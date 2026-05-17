import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { content, type = 'text' } = body

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('memory_items')
    .insert({
      user_id: user.id,
      type,
      raw_content: content.trim(),
      processed: false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Trigger async processing
  const origin = new URL(request.url).origin
  fetch(`${origin}/api/memories/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memoryId: data.id }),
  }).catch(() => {
    // Fire and forget — processing happens in background
  })

  return NextResponse.json({ memory: data }, { status: 201 })
}
