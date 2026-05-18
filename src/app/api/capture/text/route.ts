import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processMemory } from '@/lib/pipeline/process-memory'

export const maxDuration = 60 // Allow up to 60s for synchronous processing

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

  // Process synchronously — correctness before speed
  let processingError: string | null = null
  try {
    await processMemory(data.id)
  } catch (err) {
    processingError = err instanceof Error ? err.message : String(err)
    console.error('Processing failed for memory:', data.id, err)
  }

  return NextResponse.json({
    memory: data,
    processing: processingError ? { success: false, error: processingError } : { success: true },
  }, { status: 201 })
}
