import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: connections } = await supabase
    .from('wearable_connections')
    .select('*')
    .eq('user_id', user.id)

  return NextResponse.json({ connections: connections || [] })
}
