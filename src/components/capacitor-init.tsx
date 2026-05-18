'use client'

import { useEffect } from 'react'
import { isNativeApp } from '@/lib/capacitor'

/**
 * Initializes native Capacitor plugins when running inside the Android shell.
 * Must be mounted once in the root app layout.
 */
export function CapacitorInit() {
  useEffect(() => {
    if (!isNativeApp()) return

    let cleanup: (() => void) | undefined

    async function init() {
      const { StatusBar, Style } = await import('@capacitor/status-bar')
      const { App } = await import('@capacitor/app')

      // Configure status bar to match app theme
      await StatusBar.setStyle({ style: Style.Light })
      await StatusBar.setBackgroundColor({ color: '#FAF9F7' })

      // Handle Android hardware back button
      const backHandler = await App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back()
        } else {
          App.exitApp()
        }
      })

      // Handle deep links opened while app is running
      const urlHandler = await App.addListener('appUrlOpen', ({ url }) => {
        try {
          const path = new URL(url).pathname
          if (path) {
            window.location.href = path
          }
        } catch {
          // Invalid URL — ignore
        }
      })

      // Register for native push notifications (FCM)
      const { registerNativePush } = await import('@/lib/notifications/push-native')
      await registerNativePush()

      cleanup = () => {
        backHandler.remove()
        urlHandler.remove()
      }
    }

    init()

    return () => {
      cleanup?.()
    }
  }, [])

  return null
}
