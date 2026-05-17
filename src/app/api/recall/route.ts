import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { getOpenAIClient } from '@/lib/ai/openai'

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

  // 1. Semantic search
  const embedding = await generateEmbedding(query)
  const { data: matches } = await supabase.rpc('match_memories', {
    query_embedding: JSON.stringify(embedding),
    match_threshold: 0.4,
    match_count: 8,
    filter_user_id: user.id,
  })

  if (!matches || matches.length === 0) {
    const response = "I couldn't find any relevant memories matching your question. Try capturing more thoughts and conversations, and I'll be better able to help."

    // Save query
    await supabase.from('recall_queries').insert({
      user_id: user.id,
      query_text: query,
      response_text: response,
      source_memory_ids: [],
    })

    return NextResponse.json({ response, sources: [] })
  }

  // 2. Build context for GPT
  const context = matches
    .map((m: { raw_content: string; summary: string | null; created_at: string; id: string }, i: number) =>
      `[Memory ${i + 1}] (${new Date(m.created_at).toLocaleDateString()})\n${m.summary || m.raw_content}`
    )
    .join('\n\n')

  // 3. Generate answer
  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a personal recall assistant. The user is asking about their own memories and experiences. Answer their question based on the relevant memories provided below. Be warm, supportive, and specific.

Key guidelines:
- Reference specific memories using [Memory N] citations
- If the information is partial or uncertain, say so gently
- Use phrases like "Based on what you captured..." or "From your notes..."
- Never fabricate information not present in the memories
- If asked about commitments or promises, be clear about what was said

Relevant memories:
${context}`,
      },
      {
        role: 'user',
        content: query,
      },
    ],
    temperature: 0.3,
    max_tokens: 800,
  })

  const response = completion.choices[0].message.content || ''
  const sourceIds = matches.map((m: { id: string }) => m.id)

  // Save query
  await supabase.from('recall_queries').insert({
    user_id: user.id,
    query_text: query,
    response_text: response,
    source_memory_ids: sourceIds,
  })

  return NextResponse.json({
    response,
    sources: matches.map((m: { id: string; summary: string | null; raw_content: string; created_at: string; similarity: number }) => ({
      id: m.id,
      summary: m.summary || m.raw_content.substring(0, 100),
      created_at: m.created_at,
      similarity: m.similarity,
    })),
  })
}
