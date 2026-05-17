import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateDailyBrief } from '@/lib/ai/generate-brief'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const brief = await generateDailyBrief(user.id)
    return NextResponse.json({ brief })
  } catch (error) {
    console.error('Brief generation error:', error)
    return NextResponse.json({ error: 'Failed to generate brief' }, { status: 500 })
  }
}
