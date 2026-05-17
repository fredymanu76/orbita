import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { predictForgottenIntents } from '@/lib/cognition/forgotten-intent'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const predictions = await predictForgottenIntents(user.id)

  return NextResponse.json({ predictions })
}
