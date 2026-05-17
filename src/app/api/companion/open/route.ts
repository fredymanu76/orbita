import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { openContextWindow } from '@/lib/cognition/companion'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { windowId, restoration, contextWindow } = await openContextWindow(user.id)

  return NextResponse.json({
    window_id: windowId,
    restoration,
    context_window: contextWindow,
  })
}
