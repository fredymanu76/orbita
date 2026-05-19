import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { action, answer } = body as { action: 'answered' | 'dismissed'; answer?: string }

  if (!['answered', 'dismissed'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: question } = await admin
    .from('orbita_questions')
    .select('id, user_id')
    .eq('id', id)
    .single()

  if (!question || question.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {
    status: action,
    updated_at: new Date().toISOString(),
  }

  if (action === 'answered' && answer) {
    updates.answer = answer
    updates.processed = false // Will be processed in next cron run
  }

  const { error } = await admin
    .from('orbita_questions')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
