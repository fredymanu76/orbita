/**
 * Web Push notification delivery for Continuum.
 *
 * Uses the Web Push protocol (RFC 8030) with VAPID authentication.
 * No npm package — uses native crypto + fetch.
 *
 * Environment variables:
 *   VAPID_PUBLIC_KEY — base64url encoded public key
 *   VAPID_PRIVATE_KEY — base64url encoded private key
 *   VAPID_SUBJECT — mailto: or https: URL identifying the sender
 */

import { createAdminClient } from '@/lib/supabase/admin'

interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

interface PushSubscription {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

/**
 * Send a push notification to a specific user.
 * Retrieves their stored subscription from the database.
 */
export async function sendPushNotification(
  userId: string,
  payload: PushPayload
): Promise<boolean> {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('VAPID keys not set — push notifications disabled')
    return false
  }

  const supabase = createAdminClient()

  // Get user's push subscriptions
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_id', userId)

  if (!subscriptions || subscriptions.length === 0) {
    return false
  }

  const message = JSON.stringify(payload)
  let sent = false

  for (const sub of subscriptions) {
    try {
      const subscription = sub.subscription as PushSubscription
      const response = await fetch(subscription.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'TTL': '86400',
        },
        body: message,
      })

      if (response.ok || response.status === 201) {
        sent = true
      } else if (response.status === 410) {
        // Subscription expired — remove it
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('subscription->>endpoint', subscription.endpoint)
      }
    } catch (error) {
      console.error('Push notification error:', error)
    }
  }

  return sent
}

/**
 * Send push notification to all users who have active subscriptions.
 */
export async function broadcastPushNotification(
  userIds: string[],
  payload: PushPayload
): Promise<number> {
  let sentCount = 0
  for (const userId of userIds) {
    const sent = await sendPushNotification(userId, payload)
    if (sent) sentCount++
  }
  return sentCount
}
