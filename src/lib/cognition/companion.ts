import { createAdminClient } from '@/lib/supabase/admin'
import { getOpenAIClient } from '@/lib/ai/openai'
import { getContextWindow } from './cognitive-graph'
import { getInterruptedThreads } from './interruption-engine'
import { getPendingFollowUps } from './follow-up-detection'
import type { ContextWindow } from '@/lib/types'

const COMPANION_SYSTEM_PROMPT = `You are a continuity restoration interface. You restore context, reconnect abandoned threads, surface forgotten obligations, and reconstruct interrupted reasoning.

You never ask "How can I help?" — you show what needs attention. You speak in the present tense about the user's life state. You are warm but direct — a trusted companion who remembers what the user may have forgotten.

Guidelines:
- Open with a restoration of context: "Here is where you are."
- Surface interrupted threads with gentle language: "appears paused", "may be worth returning to"
- Mention people by name when relevant
- Acknowledge emotional context without being clinical
- If continuity is strong, affirm: "Your threads are well-maintained."
- Never use: tasks, todos, productivity, execution, efficiency
- Use: continuity, commitments, threads, context, obligations, restoration`

/**
 * Open a new context window for the user.
 * Builds current life state and generates a restoration opening.
 */
export async function openContextWindow(userId: string): Promise<{
  windowId: string
  restoration: string
  contextWindow: ContextWindow
}> {
  const supabase = createAdminClient()

  // Build context window
  const contextWindow = await getContextWindow(userId)
  const threads = await getInterruptedThreads(userId, 5)
  const followUps = await getPendingFollowUps(userId, 5)

  // Create window record
  const { data: window } = await supabase
    .from('continuity_windows')
    .insert({
      user_id: userId,
      window_type: 'restoration',
      life_state: contextWindow.life_state,
      unresolved_threads: { threads: threads.map(t => ({ id: t.id, title: t.title, score: t.decay_adjusted_score })) },
      emotional_context: contextWindow.emotional_context,
      continuity_trajectory: contextWindow.continuity_trajectory,
      active_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2h expiry
    })
    .select('id')
    .single()

  const windowId = window!.id

  // Build context for restoration
  const contextSummary = buildContextSummary(contextWindow, threads, followUps)

  // Generate restoration opening
  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: COMPANION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Generate a continuity restoration opening for the user based on their current state:\n\n${contextSummary}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 400,
  })

  const restoration = completion.choices[0].message.content || 'Your continuity state is clear. No unresolved threads need attention.'

  // Save system message and restoration
  await supabase.from('continuity_window_messages').insert([
    {
      window_id: windowId,
      role: 'system',
      content: COMPANION_SYSTEM_PROMPT,
      source_memory_ids: [],
      context_nodes: {},
    },
    {
      window_id: windowId,
      role: 'assistant',
      content: restoration,
      source_memory_ids: [],
      context_nodes: { threads: threads.length, followUps: followUps.length },
    },
  ])

  return { windowId, restoration, contextWindow }
}

/**
 * Continue a conversation within an existing context window.
 */
export async function continueInWindow(
  windowId: string,
  userId: string,
  userMessage: string
): Promise<string> {
  const supabase = createAdminClient()

  // Verify window ownership and fetch state
  const { data: window } = await supabase
    .from('continuity_windows')
    .select('*')
    .eq('id', windowId)
    .eq('user_id', userId)
    .single()

  if (!window) throw new Error('Context window not found')

  // Fetch conversation history
  const { data: messages } = await supabase
    .from('continuity_window_messages')
    .select('role, content')
    .eq('window_id', windowId)
    .order('created_at', { ascending: true })

  // Save user message
  await supabase.from('continuity_window_messages').insert({
    window_id: windowId,
    role: 'user',
    content: userMessage,
    source_memory_ids: [],
    context_nodes: {},
  })

  // Do semantic search for relevant memories
  const { generateEmbedding } = await import('@/lib/ai/embeddings')
  const queryEmbedding = await generateEmbedding(userMessage)

  const { data: relevantMemories } = await supabase.rpc('match_memories', {
    query_embedding: queryEmbedding,
    match_threshold: 0.4,
    match_count: 5,
    filter_user_id: userId,
  })

  const memoryContext = (relevantMemories || [])
    .map((m: { summary: string; raw_content: string }) => m.summary || m.raw_content?.substring(0, 200))
    .join('\n')

  // Build conversation for GPT
  const conversationMessages = [
    { role: 'system' as const, content: COMPANION_SYSTEM_PROMPT },
    ...(messages || []).map(m => ({
      role: m.role as 'system' | 'assistant' | 'user',
      content: m.content,
    })),
    {
      role: 'user' as const,
      content: memoryContext
        ? `[Relevant context from life stream:\n${memoryContext}]\n\nUser: ${userMessage}`
        : userMessage,
    },
  ]

  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: conversationMessages,
    temperature: 0.3,
    max_tokens: 400,
  })

  const response = completion.choices[0].message.content || ''

  // Save assistant response
  const sourceIds = (relevantMemories || []).map((m: { id: string }) => m.id)
  await supabase.from('continuity_window_messages').insert({
    window_id: windowId,
    role: 'assistant',
    content: response,
    source_memory_ids: sourceIds,
    context_nodes: {},
  })

  // Update window activity
  await supabase
    .from('continuity_windows')
    .update({ active_at: new Date().toISOString() })
    .eq('id', windowId)

  return response
}

function buildContextSummary(
  ctx: ContextWindow,
  threads: { title: string; decay_adjusted_score: number; continuity_retention: number }[],
  followUps: { description: string; follow_up_due_at: string | null }[]
): string {
  const parts: string[] = []

  parts.push(`Continuity score: ${ctx.life_state.continuity_score}/100 (${ctx.life_state.continuity_state})`)
  parts.push(`Emotional state: ${ctx.emotional_context.dominant_emotion} (${ctx.emotional_context.trajectory})`)
  parts.push(`Trajectory: ${ctx.continuity_trajectory.trend}`)

  if (ctx.life_state.key_people.length > 0) {
    parts.push(`Key people: ${ctx.life_state.key_people.map(p => p.name).join(', ')}`)
  }

  if (threads.length > 0) {
    parts.push(`\nInterrupted threads:`)
    for (const t of threads) {
      parts.push(`- "${t.title}" (retention: ${(t.continuity_retention * 100).toFixed(0)}%)`)
    }
  }

  if (followUps.length > 0) {
    parts.push(`\nPending follow-ups:`)
    for (const f of followUps) {
      const overdue = f.follow_up_due_at && new Date(f.follow_up_due_at) < new Date()
      parts.push(`- ${f.description}${overdue ? ' (overdue)' : ''}`)
    }
  }

  if (threads.length === 0 && followUps.length === 0) {
    parts.push('\nNo unresolved threads or pending follow-ups.')
  }

  return parts.join('\n')
}
