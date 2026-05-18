import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { getOpenAIClient } from '@/lib/ai/openai'

interface MemoryMatch {
  id: string
  raw_content: string
  summary: string | null
  created_at: string
  emotional_tone: string | null
  importance: number | null
  similarity: number
  relevance?: number
}

interface ThreadMatch {
  id: string
  title: string
  summary: string | null
  thread_type: string
  status: string
  capture_count: number
  commitment_count: number
  last_activity_at: string
  similarity: number
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { query } = body

  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Run multi-source search in parallel
  const embedding = await generateEmbedding(query)

  const [
    memoryResults,
    threadResults,
    peopleResults,
    commitmentResults,
    followUpResults,
    textFallbackResults,
  ] = await Promise.all([
    // 1. Memory embeddings (existing)
    admin.rpc('match_memories', {
      query_embedding: JSON.stringify(embedding),
      match_threshold: 0.35,
      match_count: 8,
      filter_user_id: user.id,
    }),

    // 2. Thread embeddings
    admin.rpc('match_threads', {
      query_embedding: JSON.stringify(embedding),
      match_threshold: 0.35,
      match_count: 5,
      filter_user_id: user.id,
    }),

    // 3. People by name (text match in query)
    admin
      .from('people')
      .select('id, name, relationship, context, mention_count, last_mentioned_at')
      .eq('user_id', user.id)
      .or(`name.ilike.%${query}%`)
      .limit(5),

    // 4. Commitments (text search on description)
    admin
      .from('commitments')
      .select('id, description, status, direction, due_date, person_id, importance, people(name)')
      .eq('user_id', user.id)
      .or(`description.ilike.%${query}%`)
      .limit(10),

    // 5. Follow-up candidates (text search)
    admin
      .from('follow_up_candidates')
      .select('id, description, detected_intent, status, follow_up_due_at')
      .eq('user_id', user.id)
      .or(`description.ilike.%${query}%,detected_intent.ilike.%${query}%`)
      .limit(5),

    // 6. Text fallback search (fuzzy trigram)
    admin.rpc('search_memories_text', {
      search_query: query,
      filter_user_id: user.id,
      result_limit: 5,
    }),
  ])

  const memories = (memoryResults.data || []) as MemoryMatch[]
  const threads = (threadResults.data || []) as ThreadMatch[]
  const people = peopleResults.data || []
  const commitments = commitmentResults.data || []
  const followUps = followUpResults.data || []
  const textMatches = (textFallbackResults.data || []) as MemoryMatch[]

  // Merge text fallback results with vector results (deduplicating)
  const seenMemoryIds = new Set(memories.map(m => m.id))
  for (const tm of textMatches) {
    if (!seenMemoryIds.has(tm.id)) {
      memories.push({ ...tm, similarity: tm.relevance || 0.3 })
      seenMemoryIds.add(tm.id)
    }
  }

  // Check if we have any data at all
  const hasData = memories.length > 0 || threads.length > 0 || people.length > 0 ||
    commitments.length > 0 || followUps.length > 0

  if (!hasData) {
    const response = "I couldn't find any relevant memories, threads, or commitments matching your question. Try capturing more thoughts and conversations, and I'll be better able to help."

    await admin.from('recall_queries').insert({
      user_id: user.id,
      query_text: query,
      response_text: response,
      source_memory_ids: [],
    })

    return NextResponse.json({ response, sources: [] })
  }

  // Build rich context for GPT
  const contextParts: string[] = []

  // Thread context
  if (threads.length > 0) {
    contextParts.push('== Active Threads ==')
    for (const [i, t] of threads.entries()) {
      contextParts.push(
        `[Thread ${i + 1}] "${t.title}" (${t.thread_type}, ${t.status})` +
        `\n  Summary: ${t.summary || 'No summary'}` +
        `\n  Captures: ${t.capture_count}, Commitments: ${t.commitment_count}` +
        `\n  Last active: ${new Date(t.last_activity_at).toLocaleDateString()}`
      )

      // Fetch linked captures for this thread
      const { data: threadCaptures } = await admin
        .from('thread_captures')
        .select('memory_id, memory_items(summary, raw_content, created_at)')
        .eq('thread_id', t.id)
        .order('created_at', { ascending: false })
        .limit(3)

      if (threadCaptures && threadCaptures.length > 0) {
        for (const tc of threadCaptures) {
          const mem = tc.memory_items as unknown as { summary: string | null; raw_content: string; created_at: string } | null
          if (mem) {
            contextParts.push(
              `  - (${new Date(mem.created_at).toLocaleDateString()}) ${mem.summary || mem.raw_content.substring(0, 150)}`
            )
          }
        }
      }

      // Fetch linked people for this thread
      const { data: threadPeople } = await admin
        .from('thread_entities')
        .select('entity_id, people(name, relationship)')
        .eq('thread_id', t.id)
        .eq('entity_type', 'person')

      if (threadPeople && threadPeople.length > 0) {
        const names = threadPeople
          .map(tp => {
            const p = tp.people as unknown as { name: string; relationship: string | null } | null
            return p ? `${p.name}${p.relationship ? ` (${p.relationship})` : ''}` : null
          })
          .filter(Boolean)
        if (names.length > 0) {
          contextParts.push(`  People: ${names.join(', ')}`)
        }
      }
    }
  }

  // Memory context
  if (memories.length > 0) {
    contextParts.push('\n== Relevant Memories ==')
    for (const [i, m] of memories.entries()) {
      contextParts.push(
        `[Memory ${i + 1}] (${new Date(m.created_at).toLocaleDateString()})` +
        `${m.emotional_tone ? ` [${m.emotional_tone}]` : ''}` +
        `\n${m.summary || m.raw_content}`
      )
    }
  }

  // Commitment context
  if (commitments.length > 0) {
    contextParts.push('\n== Commitments ==')
    for (const c of commitments) {
      const personName = (c.people as unknown as { name: string } | null)?.name
      contextParts.push(
        `- ${c.description} (${c.direction}, ${c.status})` +
        `${personName ? ` — with ${personName}` : ''}` +
        `${c.due_date ? ` — due ${c.due_date}` : ''}`
      )
    }
  }

  // People context
  if (people.length > 0) {
    contextParts.push('\n== People ==')
    for (const p of people) {
      contextParts.push(
        `- ${p.name}${p.relationship ? ` (${p.relationship})` : ''}` +
        ` — mentioned ${p.mention_count} times` +
        `${p.last_mentioned_at ? `, last on ${new Date(p.last_mentioned_at).toLocaleDateString()}` : ''}`
      )
    }
  }

  // Follow-up context
  if (followUps.length > 0) {
    contextParts.push('\n== Follow-up Items ==')
    for (const f of followUps) {
      const overdue = f.follow_up_due_at && new Date(f.follow_up_due_at) < new Date()
      contextParts.push(
        `- ${f.description} (${f.status}${overdue ? ', OVERDUE' : ''})` +
        `${f.follow_up_due_at ? ` — due ${new Date(f.follow_up_due_at).toLocaleDateString()}` : ''}`
      )
    }
  }

  const fullContext = contextParts.join('\n')

  // Generate answer
  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a continuity reconstruction engine. The user is asking about their own life — their memories, commitments, promises, relationships, and ongoing situations (threads). Answer their question by synthesizing across ALL available data sources.

Key guidelines:
- Organize your response around threads when relevant — group related information together
- Reference specific memories using [Memory N] citations
- Reference threads using [Thread N] when relevant
- Aggregate related captures — don't list them individually unless the user wants detail
- Surface unresolved elements: overdue commitments, forgotten follow-ups, at-risk threads
- Be specific: mention people by name, dates, emotional context
- If information is partial or uncertain, say so gently
- Never fabricate information not present in the data
- If asked about commitments or promises, check both the commitments section AND memory content
- Never say "I couldn't find any relevant memories" when data exists elsewhere in the system
- Use phrases like "Based on your threads..." or "Looking across your captures..."

Available data sources:
${fullContext}`,
      },
      {
        role: 'user',
        content: query,
      },
    ],
    temperature: 0.3,
    max_tokens: 1000,
  })

  const response = completion.choices[0].message.content || ''
  const sourceIds = memories.map(m => m.id)

  // Save query
  await admin.from('recall_queries').insert({
    user_id: user.id,
    query_text: query,
    response_text: response,
    source_memory_ids: sourceIds,
  })

  return NextResponse.json({
    response,
    sources: memories.map(m => ({
      id: m.id,
      summary: m.summary || m.raw_content.substring(0, 100),
      created_at: m.created_at,
      similarity: m.similarity,
    })),
    threads: threads.map(t => ({
      id: t.id,
      title: t.title,
      thread_type: t.thread_type,
      status: t.status,
      similarity: t.similarity,
    })),
  })
}
