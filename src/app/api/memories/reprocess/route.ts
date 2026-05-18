import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processMemory } from '@/lib/pipeline/process-memory'

export const maxDuration = 300 // 5 minutes for reprocessing multiple memories

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Check if force=true was passed (reprocess ALL memories, including already processed ones)
  let force = false
  try {
    const body = await request.json()
    force = body?.force === true
  } catch {
    // No body or invalid JSON — that's fine, default to non-force
  }

  if (force) {
    // Reset ALL memories to unprocessed so they get reprocessed with new extraction logic
    await admin
      .from('memory_items')
      .update({
        processed: false,
        processing_error: null,
        extraction_confidence: null,
        primary_thread_id: null,
      })
      .eq('user_id', user.id)

    // Clean up derived data so it gets recreated fresh
    // Delete thread_captures, thread_entities, threads for this user
    const { data: userThreads } = await admin
      .from('threads')
      .select('id')
      .eq('user_id', user.id)

    if (userThreads && userThreads.length > 0) {
      const threadIds = userThreads.map(t => t.id)
      await admin.from('thread_captures').delete().in('thread_id', threadIds)
      await admin.from('thread_entities').delete().in('thread_id', threadIds)
      await admin.from('threads').delete().eq('user_id', user.id)
    }

    // Delete memory_people links for this user's memories
    const { data: userMemories } = await admin
      .from('memory_items')
      .select('id')
      .eq('user_id', user.id)
    if (userMemories && userMemories.length > 0) {
      await admin.from('memory_people').delete().in('memory_id', userMemories.map(m => m.id))
    }
    // Delete people so they get recreated from extraction
    await admin.from('people').delete().eq('user_id', user.id)
    await admin.from('commitments').delete().eq('user_id', user.id)
    await admin.from('follow_up_candidates').delete().eq('user_id', user.id)
    // Delete cognitive graph
    await admin.from('cognitive_graph_edges').delete().eq('user_id', user.id)
    await admin.from('cognitive_graph_nodes').delete().eq('user_id', user.id)
  }

  // Find all unprocessed memories
  const { data: unprocessed, error } = await admin
    .from('memory_items')
    .select('id, raw_content, created_at')
    .eq('user_id', user.id)
    .eq('processed', false)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!unprocessed || unprocessed.length === 0) {
    return NextResponse.json({ message: 'No unprocessed memories found', processed: 0 })
  }

  // Clear processing errors
  await admin
    .from('memory_items')
    .update({ processing_error: null })
    .eq('user_id', user.id)
    .eq('processed', false)

  const results: { id: string; success: boolean; error?: string }[] = []

  for (const memory of unprocessed) {
    try {
      await processMemory(memory.id)
      results.push({ id: memory.id, success: true })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      results.push({ id: memory.id, success: false, error: errorMsg })
    }
  }

  // Delete today's daily brief cache
  const today = new Date().toISOString().split('T')[0]
  await admin
    .from('daily_briefs')
    .delete()
    .eq('user_id', user.id)
    .eq('brief_date', today)

  const succeeded = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length

  return NextResponse.json({
    message: `Reprocessed ${succeeded} memories, ${failed} failed`,
    processed: succeeded,
    failed,
    results,
  })
}
