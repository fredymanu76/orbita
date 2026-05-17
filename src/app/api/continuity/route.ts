import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateContinuityScore, getRecentSnapshots } from '@/lib/cognition/continuity-scoring'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [current, history] = await Promise.all([
    calculateContinuityScore(user.id),
    getRecentSnapshots(user.id, 14),
  ])

  return NextResponse.json({
    score: current.score,
    state: current.state,
    penalties: current.penalties,
    history,
  })
}
