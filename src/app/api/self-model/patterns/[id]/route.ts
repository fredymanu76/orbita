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
  const { action, correction } = body as { action: 'accepted' | 'dismissed' | 'corrected'; correction?: string }

  if (!['accepted', 'dismissed', 'corrected'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify ownership
  const { data: pattern } = await admin
    .from('user_patterns')
    .select('id, user_id, confidence')
    .eq('id', id)
    .single()

  if (!pattern || pattern.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Update based on action
  const updates: Record<string, unknown> = {
    user_response: action,
    updated_at: new Date().toISOString(),
  }

  if (action === 'accepted') {
    updates.status = 'confirmed'
    updates.confidence = Math.min(pattern.confidence + 0.1, 1)
  } else if (action === 'dismissed') {
    updates.status = 'dismissed'
  } else if (action === 'corrected') {
    updates.status = 'corrected'
    updates.user_correction = correction || null
    updates.confidence = Math.max(pattern.confidence - 0.2, 0)
  }

  const { error } = await admin
    .from('user_patterns')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
