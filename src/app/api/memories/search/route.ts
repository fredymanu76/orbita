import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateEmbedding } from '@/lib/ai/embeddings'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { query, limit = 10, threshold = 0.5 } = body

  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 })
  }

  const embedding = await generateEmbedding(query)

  const { data, error } = await supabase.rpc('match_memories', {
    query_embedding: JSON.stringify(embedding),
    match_threshold: threshold,
    match_count: limit,
    filter_user_id: user.id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ results: data })
}
