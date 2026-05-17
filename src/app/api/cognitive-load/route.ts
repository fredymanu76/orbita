import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { measureCognitiveLoad, getLatestCognitiveLoad } from '@/lib/cognition/cognitive-load'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if we have a recent reading (within last hour)
  const latest = await getLatestCognitiveLoad(user.id)
  if (latest) {
    const age = Date.now() - new Date(latest.measured_at).getTime()
    if (age < 60 * 60 * 1000) {
      return NextResponse.json({ reading: latest, cached: true })
    }
  }

  const reading = await measureCognitiveLoad(user.id)
  return NextResponse.json({ reading, cached: false })
}
