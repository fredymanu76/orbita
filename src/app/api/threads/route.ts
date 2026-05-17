import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInterruptedThreads } from '@/lib/cognition/interruption-engine'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const threads = await getInterruptedThreads(user.id)

  return NextResponse.json({ threads })
}
