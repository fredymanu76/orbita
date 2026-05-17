import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateDailyBrief } from '@/lib/ai/generate-brief'
import { sendEmail, formatBriefEmail } from '@/lib/notifications/email'

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Get all users with their profiles and notification preferences
  const { data: users } = await supabase
    .from('profiles')
    .select('id, email, full_name')

  if (!users || users.length === 0) {
    return NextResponse.json({ message: 'No users found' })
  }

  const results = []
  for (const user of users) {
    try {
      const brief = await generateDailyBrief(user.id)

      // Check if user wants email delivery
      const { data: prefs } = await supabase
        .from('notification_preferences')
        .select('email_daily_brief')
        .eq('user_id', user.id)
        .single()

      const wantsEmail = prefs?.email_daily_brief !== false // Default to true

      if (wantsEmail && user.email && brief) {
        const html = formatBriefEmail(brief, user.full_name || undefined)
        await sendEmail({
          to: user.email,
          subject: 'Your continuity brief',
          html,
          text: brief,
        })
      }

      results.push({ userId: user.id, status: 'success', emailSent: wantsEmail })
    } catch (error) {
      results.push({ userId: user.id, status: 'error', error: String(error) })
    }
  }

  return NextResponse.json({ results })
}
