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

  // Find all unprocessed memories for this user
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

  // Clear any stale processing errors before retrying
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

  // Delete today's daily brief cache so a fresh one generates with real data
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
