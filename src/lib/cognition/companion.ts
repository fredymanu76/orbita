import { createAdminClient } from '@/lib/supabase/admin'
import { getOpenAIClient } from '@/lib/ai/openai'
import { getContextWindow } from './cognitive-graph'
import { getPendingFollowUps } from './follow-up-detection'
import type { ContextWindow } from '@/lib/types'

const COMPANION_SYSTEM_PROMPT = `You are a continuity mediator. You restore context, reconnect abandoned threads, surface forgotten obligations, and reconstruct interrupted reasoning.

You never ask "How can I help?" — you show where continuity stands. You speak in the present tense about the user's life state. You are warm but direct — a trusted companion who remembers what the user may have forgotten.

Guidelines:
- Open by stating the current continuity state: thread count, what needs attention
- Surface specific threads by name, with people involved
- Mention unresolved commitments with specifics (who, what, when)
- Acknowledge emotional context without being clinical
- If continuity is strong, affirm briefly: "Your threads are well-maintained."
- Always mention people by name when relevant
- Note confidence levels: "likely unresolved", "probably forgotten", "appears paused"
- Never fabricate information — only surface what is in the data
- Never use: tasks, todos, productivity, execution, efficiency
- Use: continuity, commitments, threads, context, obligations, restoration`

/**
 * Generate ambient continuity intelligence — proactive surfacing, not reactive chat.
 * Returns structured signals + a brief restoration text.
 */
export interface AmbientIntelligence {
  signals: ContinuitySignal[]
  restoration: string
  contextWindow: ContextWindow
}

export interface ContinuitySignal {
  type: 'thread_decay' | 'commitment_overdue' | 'person_neglected' | 'forgotten_intent' | 'thread_conflict' | 'emotional_pattern'
  severity: 'low' | 'moderate' | 'high'
  confidence: number
  message: string
  thread_id?: string
  person_name?: string
}

/**
 * Open a new context window for the user.
 * Builds current life state and generates ambient intelligence.
 */
export async function openContextWindow(userId: string): Promise<{
  windowId: string
  restoration: string
  contextWindow: ContextWindow
  signals: ContinuitySignal[]
}> {
  const supabase = createAdminClient()

  // Build context window
  const contextWindow = await getContextWindow(userId)
  const followUps = await getPendingFollowUps(userId, 5)

  // Fetch threads from the new threads table — fail gracefully if table doesn't exist yet
  let threads: { id: string; title: string; status: string; thread_type: string; continuity_retention: number; commitment_count: number; last_activity_at: string; importance: number }[] = []
  try {
    const { data: activeThreads, error: threadsError } = await supabase
      .from('threads')
      .select('id, title, status, thread_type, continuity_retention, commitment_count, last_activity_at, importance')
      .eq('user_id', userId)
      .not('status', 'in', '("completed")')
      .order('last_activity_at', { ascending: false })
      .limit(10)

    if (!threadsError && activeThreads) {
      threads = activeThreads
    }
  } catch {
    // threads table may not exist yet — that's ok
  }

  // Generate ambient signals — deterministic, not GPT
  const signals = await generateAmbientSignals(supabase, userId, threads, followUps)

  // Create window record
  const { data: window } = await supabase
    .from('continuity_windows')
    .insert({
      user_id: userId,
      window_type: 'restoration',
      life_state: contextWindow.life_state,
      unresolved_threads: {
        threads: threads.map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          retention: t.continuity_retention,
        })),
      },
      emotional_context: contextWindow.emotional_context,
      continuity_trajectory: contextWindow.continuity_trajectory,
      active_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single()

  const windowId = window!.id

  // Build context for restoration (only if there's something worth saying)
  const contextSummary = buildContextSummary(contextWindow, threads, followUps, signals)

  // HARD RULE: If there is no data at all, return a deterministic message.
  // NEVER call GPT with empty context — it will fabricate names and situations.
  const hasAnyData = threads.length > 0 || signals.length > 0 || followUps.length > 0 ||
    contextWindow.life_state.key_people.length > 0

  let restoration: string

  if (!hasAnyData) {
    restoration = 'No continuity data available yet. Capture some thoughts, conversations, or commitments and your continuity state will build from there.'
  } else {
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: COMPANION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Generate a continuity restoration opening for the user. Be specific, use names and thread titles. State confidence levels where uncertain. CRITICAL: Only mention people, threads, and commitments that appear in the data below. If a section is empty, do not invent content for it. Here is their current state:\n\n${contextSummary}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 400,
    })

    restoration = completion.choices[0].message.content || 'Your continuity state is clear. No threads need attention.'
  }

  // Save messages
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
      context_nodes: { threads: threads.length, signals: signals.length },
    },
  ])

  return { windowId, restoration, contextWindow, signals }
}

/**
 * Continue a conversation within an existing context window.
 * When user mentions something, check if it relates to an existing thread and surface full context.
 */
export async function continueInWindow(
  windowId: string,
  userId: string,
  userMessage: string
): Promise<string> {
  const supabase = createAdminClient()

  // Verify window ownership
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

  // Multi-source context: semantic search + thread matching + commitment search
  const { generateEmbedding } = await import('@/lib/ai/embeddings')
  const queryEmbedding = await generateEmbedding(userMessage)

  const [memoriesRes, threadsRes, commitmentsRes] = await Promise.all([
    supabase.rpc('match_memories', {
      query_embedding: queryEmbedding,
      match_threshold: 0.35,
      match_count: 5,
      filter_user_id: userId,
    }),
    supabase.rpc('match_threads', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.35,
      match_count: 3,
      filter_user_id: userId,
    }),
    supabase
      .from('commitments')
      .select('description, status, direction, due_date, people(name)')
      .eq('user_id', userId)
      .ilike('description', `%${userMessage.split(' ').slice(0, 3).join('%')}%`)
      .limit(3),
  ])

  const memories = memoriesRes.data || []
  const threads = threadsRes.data || []
  const commitments = commitmentsRes.data || []

  // Build context
  const contextParts: string[] = []
  if (threads.length > 0) {
    contextParts.push('Related threads:')
    for (const t of threads) {
      contextParts.push(`- "${t.title}" (${t.status}, ${t.capture_count} captures)`)
    }
  }
  if (commitments.length > 0) {
    contextParts.push('Related commitments:')
    for (const c of commitments) {
      const person = (c.people as unknown as { name: string } | null)?.name
      contextParts.push(`- ${c.description} (${c.direction}, ${c.status})${person ? ` with ${person}` : ''}`)
    }
  }
  if (memories.length > 0) {
    contextParts.push('Relevant memories:')
    for (const m of memories) {
      contextParts.push(`- ${m.summary || m.raw_content?.substring(0, 150)}`)
    }
  }

  const hasContext = contextParts.length > 0
  const contextStr = hasContext ? `\n[Context from life stream:\n${contextParts.join('\n')}]\n\n` : ''

  // HARD RULE: If no context found, tell the user directly. Do NOT let GPT fabricate.
  if (!hasContext) {
    const response = "I don't have any stored context related to that. If you've captured relevant thoughts or conversations, they may not have been processed yet. You can check the pipeline status at /debug/pipeline."

    await supabase.from('continuity_window_messages').insert({
      window_id: windowId,
      role: 'assistant',
      content: response,
      source_memory_ids: [],
      context_nodes: { threads: 0, memories: 0 },
    })

    await supabase
      .from('continuity_windows')
      .update({ active_at: new Date().toISOString() })
      .eq('id', windowId)

    return response
  }

  // Build conversation for GPT — only when we have real data
  const conversationMessages = [
    { role: 'system' as const, content: COMPANION_SYSTEM_PROMPT + '\n\nCRITICAL: Only reference people, threads, and facts that appear in the context data. If you cannot answer from the data provided, say so. Never invent names, relationships, or situations.' },
    ...(messages || []).map(m => ({
      role: m.role as 'system' | 'assistant' | 'user',
      content: m.content,
    })),
    {
      role: 'user' as const,
      content: `${contextStr}User: ${userMessage}`,
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

  // Save response
  const sourceIds = memories.map((m: { id: string }) => m.id)
  await supabase.from('continuity_window_messages').insert({
    window_id: windowId,
    role: 'assistant',
    content: response,
    source_memory_ids: sourceIds,
    context_nodes: { threads: threads.length, memories: memories.length },
  })

  // Update window activity
  await supabase
    .from('continuity_windows')
    .update({ active_at: new Date().toISOString() })
    .eq('id', windowId)

  return response
}

/**
 * Generate ambient signals — deterministic intelligence, not GPT.
 */
async function generateAmbientSignals(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  threads: { id: string; title: string; status: string; continuity_retention: number; commitment_count: number; last_activity_at: string }[],
  followUps: { description: string; follow_up_due_at: string | null; status: string }[]
): Promise<ContinuitySignal[]> {
  const signals: ContinuitySignal[] = []
  const now = new Date()

  // Thread decay signals
  for (const t of threads) {
    if (t.continuity_retention < 0.3) {
      signals.push({
        type: 'thread_decay',
        severity: 'high',
        confidence: 0.85,
        message: `"${t.title}" is likely fading — ${Math.round(t.continuity_retention * 100)}% retained`,
        thread_id: t.id,
      })
    } else if (t.continuity_retention < 0.5 && t.commitment_count > 0) {
      signals.push({
        type: 'thread_decay',
        severity: 'moderate',
        confidence: 0.7,
        message: `"${t.title}" has unresolved commitments and is decaying`,
        thread_id: t.id,
      })
    }
  }

  // Overdue commitments
  const { data: overdueCommitments } = await supabase
    .from('commitments')
    .select('description, due_date, people(name)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .lt('due_date', now.toISOString().split('T')[0])
    .limit(5)

  for (const c of (overdueCommitments || [])) {
    const person = (c.people as unknown as { name: string } | null)?.name
    signals.push({
      type: 'commitment_overdue',
      severity: 'high',
      confidence: 0.95,
      message: `${c.description}${person ? ` with ${person}` : ''} — overdue`,
      person_name: person || undefined,
    })
  }

  // Forgotten follow-ups
  for (const f of followUps) {
    if (f.follow_up_due_at && new Date(f.follow_up_due_at) < now) {
      signals.push({
        type: 'forgotten_intent',
        severity: 'moderate',
        confidence: 0.65,
        message: `Probably intended to: ${f.description}`,
      })
    }
  }

  // People neglect — people not mentioned in 14+ days
  const { data: neglectedPeople } = await supabase
    .from('people')
    .select('name, last_mentioned_at, mention_count')
    .eq('user_id', userId)
    .lt('last_mentioned_at', new Date(now.getTime() - 14 * 86400000).toISOString())
    .gt('mention_count', 3) // Only flag people who were regularly mentioned
    .limit(3)

  for (const p of (neglectedPeople || [])) {
    const days = Math.floor((now.getTime() - new Date(p.last_mentioned_at).getTime()) / 86400000)
    signals.push({
      type: 'person_neglected',
      severity: days > 21 ? 'high' : 'moderate',
      confidence: 0.6,
      message: `${p.name} hasn't appeared in ${days} days`,
      person_name: p.name,
    })
  }

  // Sort by severity
  const severityOrder = { high: 0, moderate: 1, low: 2 }
  signals.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return signals
}

function buildContextSummary(
  ctx: ContextWindow,
  threads: { id: string; title: string; status: string; continuity_retention: number; commitment_count: number }[],
  followUps: { description: string; follow_up_due_at: string | null }[],
  signals: ContinuitySignal[]
): string {
  const parts: string[] = []

  parts.push(`Continuity state: ${ctx.life_state.continuity_state}`)
  parts.push(`Active threads: ${threads.filter(t => t.status === 'active').length}`)
  parts.push(`Unresolved: ${threads.filter(t => ['unresolved', 'forgotten_risk', 'time_sensitive'].includes(t.status)).length}`)

  if (ctx.life_state.key_people.length > 0) {
    parts.push(`Key people: ${ctx.life_state.key_people.map(p => p.name).join(', ')}`)
  }

  if (signals.length > 0) {
    parts.push(`\nAmbient signals (${signals.length}):`)
    for (const s of signals.slice(0, 6)) {
      parts.push(`- [${s.severity}, ${Math.round(s.confidence * 100)}% confidence] ${s.message}`)
    }
  }

  if (threads.length > 0) {
    parts.push(`\nThreads:`)
    for (const t of threads.slice(0, 5)) {
      parts.push(`- "${t.title}" (${t.status}, ${Math.round(t.continuity_retention * 100)}% retained, ${t.commitment_count} commitments)`)
    }
  }

  if (followUps.length > 0) {
    parts.push(`\nPending follow-ups:`)
    for (const f of followUps) {
      const overdue = f.follow_up_due_at && new Date(f.follow_up_due_at) < new Date()
      parts.push(`- ${f.description}${overdue ? ' (overdue)' : ''}`)
    }
  }

  return parts.join('\n')
}
