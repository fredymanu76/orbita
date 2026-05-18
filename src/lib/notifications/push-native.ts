'use client'

import { isNativeApp } from '@/lib/capacitor'

/**
 * Register for native push notifications via FCM.
 * Sends the FCM token to the backend for storage.
 * Only runs inside the Capacitor native shell.
 */
export async function registerNativePush(): Promise<string | null> {
  if (!isNativeApp()) return null

  const { PushNotifications } = await import('@capacitor/push-notifications')

  // Request permission
  const permission = await PushNotifications.requestPermissions()
  if (permission.receive !== 'granted') {
    console.warn('Push notification permission denied')
    return null
  }

  return new Promise((resolve) => {
    // Listen for successful registration (FCM token)
    PushNotifications.addListener('registration', async ({ value: token }) => {
      try {
        await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: 'android',
            fcmToken: token,
          }),
        })
        resolve(token)
      } catch (error) {
        console.error('Failed to register FCM token:', error)
        resolve(null)
      }
    })

    // Listen for registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error)
      resolve(null)
    })

    // Handle notification taps — navigate to the relevant page
    PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      const url = notification.data?.url
      if (url) {
        window.location.href = url
      }
    })

    // Trigger registration
    PushNotifications.register()
  })
}
