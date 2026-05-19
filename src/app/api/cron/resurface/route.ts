import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushNotification } from '@/lib/notifications/push'
import { sendEmail, formatAlertEmail } from '@/lib/notifications/email'

/**
 * Resurfacing cron — runs every 4 hours.
 * Checks for overdue follow-ups and forgotten intents, then sends
 * push notifications and/or email alerts to affected users.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // 1. Find overdue follow-ups that haven't been surfaced yet
  const { data: overdueFollowUps } = await supabase
    .from('follow_up_candidates')
    .select('id, user_id, description, detected_intent, follow_up_due_at')
    .eq('status', 'pending')
    .lt('follow_up_due_at', now)
    .order('follow_up_due_at', { ascending: true })

  // 2. Find forgotten intent predictions that should be surfaced
  const { data: forgottenIntents } = await supabase
    .from('forgotten_intent_predictions')
    .select('id, user_id, intent_description, probability_forgotten, decay_adjusted_priority')
    .eq('status', 'predicted')
    .gt('probability_forgotten', 0.5)
    .order('decay_adjusted_priority', { ascending: false })

  // Group by user
  const userAlerts: Record<string, {
    followUps: typeof overdueFollowUps
    intents: typeof forgottenIntents
    email?: string
    name?: string
  }> = {}

  for (const fu of overdueFollowUps || []) {
    if (!userAlerts[fu.user_id]) userAlerts[fu.user_id] = { followUps: [], intents: [] }
    userAlerts[fu.user_id].followUps!.push(fu)
  }

  for (const intent of forgottenIntents || []) {
    if (!userAlerts[intent.user_id]) userAlerts[intent.user_id] = { followUps: [], intents: [] }
    userAlerts[intent.user_id].intents!.push(intent)
  }

  const results = []

  for (const [userId, alerts] of Object.entries(userAlerts)) {
    // Check notification preferences
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single()

    // Check quiet hours
    const hour = new Date().getHours()
    const quietStart = parseInt(prefs?.quiet_hours_start?.split(':')[0] || '22')
    const quietEnd = parseInt(prefs?.quiet_hours_end?.split(':')[0] || '7')
    const isQuietHours = hour >= quietStart || hour < quietEnd

    if (isQuietHours) {
      results.push({ userId, status: 'skipped', reason: 'quiet_hours' })
      continue
    }

    const totalAlerts = (alerts.followUps?.length || 0) + (alerts.intents?.length || 0)
    if (totalAlerts === 0) continue

    // Send push notification
    const wantsPush = prefs?.push_overdue_follow_ups !== false || prefs?.push_forgotten_intents !== false
    if (wantsPush) {
      const topAlert = alerts.followUps?.[0] || alerts.intents?.[0]
      const title = totalAlerts === 1
        ? 'Something may need your attention'
        : `${totalAlerts} items may need attention`
      const body = topAlert
        ? ('description' in topAlert ? topAlert.description : topAlert.intent_description)
        : 'Open Orbita to review'

      await sendPushNotification(userId, {
        title,
        body,
        url: '/follow-ups',
        tag: 'resurface',
      })
    }

    // Send email for overdue follow-ups
    const wantsEmail = prefs?.email_follow_up_alerts !== false
    if (wantsEmail) {
      // Get user email
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single()

      if (profile?.email) {
        const emailAlerts = [
          ...(alerts.followUps || []).map(fu => ({
            title: fu.description,
            description: fu.detected_intent,
            urgency: 'Overdue follow-up',
          })),
          ...(alerts.intents || []).slice(0, 3).map(i => ({
            title: i.intent_description,
            description: `${Math.round(i.probability_forgotten * 100)}% likely forgotten`,
            urgency: 'Predicted forgotten',
          })),
        ].slice(0, 5)

        await sendEmail({
          to: profile.email,
          subject: `${totalAlerts} item${totalAlerts > 1 ? 's' : ''} may need your attention`,
          html: formatAlertEmail(emailAlerts),
        })
      }
    }

    // Mark follow-ups as surfaced
    for (const fu of alerts.followUps || []) {
      await supabase
        .from('follow_up_candidates')
        .update({ status: 'surfaced', surfaced_at: now })
        .eq('id', fu.id)
    }

    // Mark intents as surfaced
    for (const intent of alerts.intents || []) {
      await supabase
        .from('forgotten_intent_predictions')
        .update({ status: 'surfaced' })
        .eq('id', intent.id)
    }

    results.push({ userId, status: 'notified', alerts: totalAlerts })
  }

  return NextResponse.json({ results, processed: Object.keys(userAlerts).length })
}
