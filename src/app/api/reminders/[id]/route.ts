import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addHours } from 'date-fns'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { action } = body // 'dismiss' or 'snooze'

  if (action === 'dismiss') {
    const { error } = await supabase
      .from('reminders')
      .update({ status: 'dismissed' })
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (action === 'snooze') {
    const { error } = await supabase
      .from('reminders')
      .update({
        status: 'pending',
        remind_at: addHours(new Date(), 1).toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
