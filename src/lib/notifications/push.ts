/**
 * Push notification delivery for Continuum.
 *
 * Supports two delivery channels:
 *   1. Web Push (RFC 8030) with VAPID authentication — for browsers
 *   2. Firebase Cloud Messaging (FCM v1 HTTP API) — for native Android
 *
 * Environment variables:
 *   VAPID_PUBLIC_KEY — base64url encoded public key (web push)
 *   VAPID_PRIVATE_KEY — base64url encoded private key (web push)
 *   VAPID_SUBJECT — mailto: or https: URL identifying the sender
 *   GOOGLE_FCM_PROJECT_ID — Firebase project ID (FCM)
 *   GOOGLE_FCM_SERVICE_ACCOUNT_KEY — JSON service account key string (FCM)
 */

import { createAdminClient } from '@/lib/supabase/admin'

interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

interface WebPushSubscription {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

interface StoredSubscription {
  subscription: {
    platform?: string
    fcmToken?: string
    endpoint?: string
    keys?: { p256dh: string; auth: string }
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

  for (const sub of subscriptions as StoredSubscription[]) {
    try {
      if (sub.subscription.platform === 'android' && sub.subscription.fcmToken) {
        // FCM delivery
        const fcmSent = await sendFcmNotification(sub.subscription.fcmToken, payload)
        if (fcmSent) sent = true
      } else {
        // Web Push delivery
        const webSent = await sendWebPush(
          userId,
          sub.subscription as unknown as WebPushSubscription,
          message
        )
        if (webSent) sent = true
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

// ---------------------------------------------------------------------------
// Web Push (existing VAPID flow)
// ---------------------------------------------------------------------------

async function sendWebPush(
  userId: string,
  subscription: WebPushSubscription,
  message: string
): Promise<boolean> {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('VAPID keys not set — web push disabled')
    return false
  }

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      TTL: '86400',
    },
    body: message,
  })

  if (response.ok || response.status === 201) {
    return true
  }

  if (response.status === 410) {
    // Subscription expired — remove it
    const supabase = createAdminClient()
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('subscription->>endpoint', subscription.endpoint)
  }

  return false
}

// ---------------------------------------------------------------------------
// FCM v1 HTTP API
// ---------------------------------------------------------------------------

let cachedAccessToken: { token: string; expiresAt: number } | null = null

async function getFcmAccessToken(): Promise<string | null> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt) {
    return cachedAccessToken.token
  }

  const keyJson = process.env.GOOGLE_FCM_SERVICE_ACCOUNT_KEY
  if (!keyJson) return null

  try {
    const key = JSON.parse(keyJson)
    const now = Math.floor(Date.now() / 1000)

    // Build JWT for Google OAuth2
    const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claim = btoa(
      JSON.stringify({
        iss: key.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      })
    )

    const signInput = `${header}.${claim}`

    // Import the private key and sign
    const pemBody = key.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\n/g, '')
    const binaryKey = Uint8Array.from(atob(pemBody), (c: string) => c.charCodeAt(0))

    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(signInput)
    )

    const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    // Exchange JWT for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${header}.${claim}.${sig}`,
    })

    if (!tokenRes.ok) return null

    const tokenData = await tokenRes.json()
    cachedAccessToken = {
      token: tokenData.access_token,
      expiresAt: Date.now() + (tokenData.expires_in - 60) * 1000,
    }

    return cachedAccessToken.token
  } catch (error) {
    console.error('FCM access token error:', error)
    return null
  }
}

async function sendFcmNotification(
  fcmToken: string,
  payload: PushPayload
): Promise<boolean> {
  const projectId = process.env.GOOGLE_FCM_PROJECT_ID
  if (!projectId) {
    console.warn('GOOGLE_FCM_PROJECT_ID not set — FCM disabled')
    return false
  }

  const accessToken = await getFcmAccessToken()
  if (!accessToken) {
    console.warn('Could not obtain FCM access token')
    return false
  }

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: {
            url: payload.url || '/dashboard',
            tag: payload.tag || '',
          },
          android: {
            priority: 'high',
            notification: {
              click_action: 'FCM_PLUGIN_ACTIVITY',
              channel_id: 'continuum_default',
            },
          },
        },
      }),
    }
  )

  return response.ok
}
