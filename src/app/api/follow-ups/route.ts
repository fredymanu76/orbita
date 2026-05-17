import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPendingFollowUps } from '@/lib/cognition/follow-up-detection'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const followUps = await getPendingFollowUps(user.id)

  return NextResponse.json({ follow_ups: followUps })
}
