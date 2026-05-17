import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { continueInWindow } from '@/lib/cognition/companion'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { window_id, message } = body

  if (!window_id || !message) {
    return NextResponse.json({ error: 'window_id and message required' }, { status: 400 })
  }

  const response = await continueInWindow(window_id, user.id, message)

  return NextResponse.json({ response })
}
