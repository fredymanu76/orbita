import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifyIntent } from '@/lib/cognition/intent-router'
import { processMemory } from '@/lib/pipeline/process-memory'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { getOpenAIClient } from '@/lib/ai/openai'
import { buildVoiceContext } from '@/lib/cognition/voice-engine'

export const maxDuration = 60

/**
 * Unified input endpoint — the "brain" that decides what to do with user input.
 *
 * Instead of blindly storing everything as memory, this route:
 * 1. Classifies the intent (capture, ask, reflect, converse, action)
 * 2. Routes to the appropriate handler
 * 3. Returns a structured response with optional AI reply
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { content } = body

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  }

  const trimmed = content.trim()

  // 1. Classify intent
  const classification = await classifyIntent(trimmed)

  // 2. Route based on intent
  switch (classification.intent) {
    case 'capture':
      return handleCapture(user.id, trimmed, classification.reasoning)

    case 'ask':
      return handleAsk(user.id, trimmed, classification.reasoning)

    case 'reflect':
      return handleReflect(user.id, trimmed, classification.reasoning)

    case 'converse':
      return handleConverse(user.id, trimmed, classification.reasoning)

    case 'action':
      return handleAction(user.id, trimmed, classification.reasoning)

    default:
      return handleCapture(user.id, trimmed, 'fallback')
  }
}

/**
 * CAPTURE — store as memory, run pipeline. No conversational response.
 */
async function handleCapture(userId: string, content: string, reasoning: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('memory_items')
    .insert({
      user_id: userId,
      type: 'text',
      raw_content: content,
      processed: false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let processingError: string | null = null
  try {
    await processMemory(data.id)
  } catch (err) {
    processingError = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json({
    intent: 'capture',
    stored: true,
    response: null,
    memory_id: data.id,
    processing: processingError ? { success: false, error: processingError } : { success: true },
    _routing: reasoning,
  }, { status: 201 })
}

/**
 * ASK — search memories/threads/commitments and return an intelligent answer.
 * Reuses the recall engine logic.
 */
async function handleAsk(userId: string, query: string, reasoning: string) {
  const admin = createAdminClient()

  const embedding = await generateEmbedding(query)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeQuery = async (fn: () => PromiseLike<{ data: any; error: any }>): Promise<any[] | null> => {
    try {
      const result = await fn()
      if (result.error) return null
      return result.data
    } catch {
      return null
    }
  }

  const [memoryData, threadData, commitmentData] = await Promise.all([
    safeQuery(() => admin.rpc('match_memories', {
      query_embedding: JSON.stringify(embedding),
      match_threshold: 0.35,
      match_count: 6,
      filter_user_id: userId,
    })),
    safeQuery(() => admin.rpc('match_threads', {
      query_embedding: JSON.stringify(embedding),
      match_threshold: 0.35,
      match_count: 4,
      filter_user_id: userId,
    })),
    safeQuery(() => admin
      .from('commitments')
      .select('description, status, direction, due_date, people(name)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(8)),
  ])

  const memories = memoryData || []
  const threads = threadData || []
  const commitments = commitmentData || []

  const hasData = memories.length > 0 || threads.length > 0 || commitments.length > 0

  if (!hasData) {
    return NextResponse.json({
      intent: 'ask',
      stored: false,
      response: "I don't have enough context to answer that yet. As you capture more thoughts and conversations, I'll be better able to help.",
      _routing: reasoning,
    })
  }

  // Build context
  const contextParts: string[] = []

  if (threads.length > 0) {
    contextParts.push('== Threads ==')
    for (const t of threads) {
      contextParts.push(`- "${t.title}" (${t.status}, ${t.capture_count} captures, last active ${new Date(t.last_activity_at).toLocaleDateString()})`)
    }
  }

  if (memories.length > 0) {
    contextParts.push('\n== Memories ==')
    for (const m of memories) {
      contextParts.push(`- (${new Date(m.created_at).toLocaleDateString()}) ${m.summary || m.raw_content?.substring(0, 200)}`)
    }
  }

  if (commitments.length > 0) {
    contextParts.push('\n== Active Commitments ==')
    for (const c of commitments) {
      const person = (c.people as unknown as { name: string } | null)?.name
      contextParts.push(`- ${c.description} (${c.direction})${person ? ` with ${person}` : ''}${c.due_date ? ` due ${c.due_date}` : ''}`)
    }
  }

  const voice = await buildVoiceContext(userId, 'ask')

  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `${voice.systemPrompt}\n\n${contextParts.join('\n')}`,
      },
      { role: 'user', content: query },
    ],
    temperature: voice.temperature,
    max_tokens: voice.maxTokens,
  })

  const response = completion.choices[0].message.content || ''

  // Log the query
  try {
    await admin.from('recall_queries').insert({
      user_id: userId,
      query_text: query,
      response_text: response,
      source_memory_ids: memories.map((m: { id: string }) => m.id),
    })
  } catch {
    // Non-critical — don't fail the response
  }

  return NextResponse.json({
    intent: 'ask',
    stored: false,
    response,
    _routing: reasoning,
  })
}

/**
 * REFLECT — store as memory (with emotional context) AND respond with empathy.
 * This content is valuable for the self-model, so we store it.
 * But we also acknowledge the user with a warm response.
 */
async function handleReflect(userId: string, content: string, reasoning: string) {
  const supabase = await createClient()
  const admin = createAdminClient()

  // Store as memory — reflections are valuable data
  const { data: memory, error } = await supabase
    .from('memory_items')
    .insert({
      user_id: userId,
      type: 'text',
      raw_content: content,
      processed: false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Process in background (non-blocking for the response)
  processMemory(memory.id).catch(err => {
    console.error('Reflect memory processing failed:', memory.id, err)
  })

  // Build context for empathetic response
  const { data: recentMemories } = await admin
    .from('memory_items')
    .select('summary, emotional_tone, created_at')
    .eq('user_id', userId)
    .eq('processed', true)
    .order('created_at', { ascending: false })
    .limit(5)

  const contextParts: string[] = []
  if (recentMemories && recentMemories.length > 0) {
    contextParts.push('Recent context:')
    for (const m of recentMemories) {
      if (m.summary) {
        contextParts.push(`- ${m.summary}${m.emotional_tone ? ` (${m.emotional_tone})` : ''}`)
      }
    }
  }

  const voice = await buildVoiceContext(userId, 'reflect')

  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `${voice.systemPrompt}\n\n${contextParts.join('\n')}`,
      },
      { role: 'user', content },
    ],
    temperature: voice.temperature,
    max_tokens: voice.maxTokens,
  })

  const response = completion.choices[0].message.content || ''

  return NextResponse.json({
    intent: 'reflect',
    stored: true,
    response,
    memory_id: memory.id,
    _routing: reasoning,
  }, { status: 201 })
}

/**
 * CONVERSE — respond naturally. Do NOT store as memory.
 * Greetings, acknowledgments, small talk.
 */
async function handleConverse(userId: string, content: string, reasoning: string) {
  const lower = content.toLowerCase().trim()

  // For very simple acknowledgments, respond deterministically (no GPT needed)
  const simpleResponses: Record<string, string[]> = {
    'ok': ['Got it.'],
    'okay': ['Got it.'],
    'thanks': ['You\'re welcome.'],
    'thank you': ['You\'re welcome.'],
    'great': ['Glad to hear it.'],
    'very well': ['Good to hear.'],
    'got it': ['Perfect.'],
    'sure': ['Alright.'],
    'fine': ['Alright.'],
    'cool': ['Great.'],
    'nice': ['Great.'],
    'yes': ['Noted.'],
    'yep': ['Noted.'],
    'yeah': ['Noted.'],
    'no': ['Understood.'],
    'nope': ['Understood.'],
    'hmm': ['Take your time.'],
  }

  const simpleMatch = simpleResponses[lower] || simpleResponses[lower.replace(/[.!]$/, '')]
  if (simpleMatch) {
    return NextResponse.json({
      intent: 'converse',
      stored: false,
      response: simpleMatch[0],
      _routing: reasoning,
    })
  }

  // For greetings and slightly more complex conversation, use GPT with voice context
  const voice = await buildVoiceContext(userId, 'converse')

  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: voice.systemPrompt,
      },
      { role: 'user', content },
    ],
    temperature: voice.temperature,
    max_tokens: voice.maxTokens,
  })

  const response = completion.choices[0].message.content || ''

  return NextResponse.json({
    intent: 'converse',
    stored: false,
    response,
    _routing: reasoning,
  })
}

/**
 * ACTION — provide guidance based on the user's current data.
 * Searches for context, then gives actionable advice.
 */
async function handleAction(userId: string, query: string, reasoning: string) {
  const admin = createAdminClient()

  // Gather the user's current state — all queries in parallel
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  const [commitmentsRes, threadsRes, stateRes, emotionalRes, patternsRes] = await Promise.all([
    admin
      .from('commitments')
      .select('description, status, direction, due_date, importance, people(name)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(10),
    admin
      .from('threads')
      .select('title, status, thread_type, continuity_retention, commitment_count, last_activity_at, importance')
      .eq('user_id', userId)
      .not('status', 'in', '("completed","paused","cooling")')
      .order('importance', { ascending: false })
      .limit(8),
    admin
      .from('user_state')
      .select('current_state, state_confidence')
      .eq('user_id', userId)
      .single(),
    admin
      .from('emotional_readings')
      .select('emotion_label, valence, intensity, measured_at')
      .eq('user_id', userId)
      .gte('measured_at', thirtyDaysAgo)
      .order('measured_at', { ascending: false })
      .limit(10),
    admin
      .from('user_patterns')
      .select('title, description, pattern_type, confidence')
      .eq('user_id', userId)
      .in('status', ['confirmed', 'established'])
      .order('confidence', { ascending: false })
      .limit(8),
  ])

  const commitments = commitmentsRes.data || []
  const threads = threadsRes.data || []
  const userState = stateRes.data
  const emotionalReadings = emotionalRes.data || []
  const patterns = patternsRes.data || []

  const contextParts: string[] = []

  if (userState) {
    contextParts.push(`User's inferred state: ${userState.current_state} (confidence: ${Math.round(userState.state_confidence * 100)}%)`)
  }

  if (emotionalReadings.length > 0) {
    contextParts.push('\nRecent emotional readings:')
    for (const r of emotionalReadings) {
      const date = new Date(r.measured_at).toLocaleDateString()
      contextParts.push(`- ${r.emotion_label} (valence: ${r.valence?.toFixed(1)}, intensity: ${r.intensity?.toFixed(1)}) on ${date}`)
    }
  }

  if (patterns.length > 0) {
    contextParts.push('\nObserved patterns:')
    for (const p of patterns) {
      contextParts.push(`- [${p.pattern_type}] ${p.title}: ${p.description}`)
    }
  }

  if (commitments.length > 0) {
    contextParts.push('\nActive commitments:')
    const today = new Date().toISOString().split('T')[0]
    for (const c of commitments) {
      const person = (c.people as unknown as { name: string } | null)?.name
      const overdue = c.due_date && c.due_date < today
      contextParts.push(`- ${c.description} (${c.direction}${overdue ? ', OVERDUE' : ''})${person ? ` with ${person}` : ''}${c.due_date ? ` due ${c.due_date}` : ''} importance: ${c.importance || 5}/10`)
    }
  }

  if (threads.length > 0) {
    contextParts.push('\nActive threads:')
    for (const t of threads) {
      contextParts.push(`- "${t.title}" (${t.status}, ${t.thread_type}, ${Math.round(t.continuity_retention * 100)}% retained, ${t.commitment_count} commitments, importance: ${t.importance}/10)`)
    }
  }

  const hasData = commitments.length > 0 || threads.length > 0 || patterns.length > 0 || emotionalReadings.length > 0

  if (!hasData) {
    return NextResponse.json({
      intent: 'action',
      stored: false,
      response: "I don't have enough data yet to guide you. Capture some thoughts, conversations, and commitments first — then I can help you prioritise.",
      _routing: reasoning,
    })
  }

  const voice = await buildVoiceContext(userId, 'action')

  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `${voice.systemPrompt}\n\n${contextParts.join('\n')}`,
      },
      { role: 'user', content: query },
    ],
    temperature: voice.temperature,
    max_tokens: voice.maxTokens,
  })

  const response = completion.choices[0].message.content || ''

  return NextResponse.json({
    intent: 'action',
    stored: false,
    response,
    _routing: reasoning,
  })
}
