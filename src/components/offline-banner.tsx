'use client'

import { useEffect, useState } from 'react'
import { isNativeApp } from '@/lib/capacitor'

/**
 * Shows a non-intrusive banner when the device loses network connectivity.
 * Uses @capacitor/network on native, falls back to navigator.onLine on web.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    let cleanup: (() => void) | undefined

    if (isNativeApp()) {
      // Native: use Capacitor Network plugin
      ;(async () => {
        const { Network } = await import('@capacitor/network')
        const status = await Network.getStatus()
        setOffline(!status.connected)

        const handler = await Network.addListener('networkStatusChange', (s) => {
          setOffline(!s.connected)
        })

        cleanup = () => {
          handler.remove()
        }
      })()
    } else {
      // Web fallback
      const goOffline = () => setOffline(true)
      const goOnline = () => setOffline(false)

      setOffline(!navigator.onLine)
      window.addEventListener('offline', goOffline)
      window.addEventListener('online', goOnline)

      cleanup = () => {
        window.removeEventListener('offline', goOffline)
        window.removeEventListener('online', goOnline)
      }
    }

    return () => {
      cleanup?.()
    }
  }, [])

  if (!offline) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-center bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-md">
      You&apos;re offline. Reconnecting&hellip;
    </div>
  )
}
