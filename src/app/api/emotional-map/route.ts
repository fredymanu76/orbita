import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEmotionalTrajectory } from '@/lib/cognition/emotional-mapping'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const days = parseInt(request.nextUrl.searchParams.get('days') || '7')
  const trajectory = await getEmotionalTrajectory(user.id, days)

  return NextResponse.json(trajectory)
}
