import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateDailyBrief } from '@/lib/ai/generate-brief'

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Get all users who have captured at least one memory
  const { data: users } = await supabase
    .from('profiles')
    .select('id')

  if (!users || users.length === 0) {
    return NextResponse.json({ message: 'No users found' })
  }

  const results = []
  for (const user of users) {
    try {
      await generateDailyBrief(user.id)
      results.push({ userId: user.id, status: 'success' })
    } catch (error) {
      results.push({ userId: user.id, status: 'error', error: String(error) })
    }
  }

  return NextResponse.json({ results })
}
