/**
 * Continuum Service Worker
 * Handles push notifications for forgotten intents, follow-up alerts,
 * and continuity restoration prompts.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = {
      title: 'Continuum',
      body: event.data.text(),
    }
  }

  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: payload.tag || 'continuum-notification',
    data: {
      url: payload.url || '/dashboard',
    },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Later' },
    ],
    vibrate: [100, 50, 100],
    renotify: true,
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Continuum', options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'dismiss') return

  const url = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If the app is already open, focus it
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url)
            return client.focus()
          }
        }
        // Otherwise open a new window
        return self.clients.openWindow(url)
      })
  )
})
