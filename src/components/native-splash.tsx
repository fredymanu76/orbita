'use client'

import { useEffect, useState } from 'react'
import { isNativeApp } from '@/lib/capacitor'

/**
 * Animated splash overlay for the native app.
 * The Orbita logo rises from bottom-left to center, holds briefly, then fades out.
 * Only renders inside the Capacitor native shell.
 */
export function NativeSplash() {
  const [phase, setPhase] = useState<'animate' | 'hold' | 'fadeout' | 'done'>('animate')
  const [isNative, setIsNative] = useState(false)

  useEffect(() => {
    if (!isNativeApp()) {
      setPhase('done')
      return
    }
    setIsNative(true)

    // Phase 1: animate in (logo rises from bottom-left to center) — 800ms
    const holdTimer = setTimeout(() => setPhase('hold'), 800)
    // Phase 2: hold at center — 600ms
    const fadeTimer = setTimeout(() => setPhase('fadeout'), 1400)
    // Phase 3: fade out — 500ms
    const doneTimer = setTimeout(() => setPhase('done'), 1900)

    return () => {
      clearTimeout(holdTimer)
      clearTimeout(fadeTimer)
      clearTimeout(doneTimer)
    }
  }, [])

  if (phase === 'done' || !isNative) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: '#0D1230',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: phase === 'fadeout' ? 0 : 1,
        transition: 'opacity 500ms ease-out',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 40% 40%, #f0e6ff, #c4b5fd 40%, #7c6bc4 70%, #3b2d80)',
          boxShadow: '0 0 60px rgba(124, 107, 196, 0.5), 0 0 120px rgba(124, 107, 196, 0.2)',
          transform:
            phase === 'animate'
              ? 'translate(-40vw, 40vh) scale(0.3)'
              : 'translate(0, 0) scale(1)',
          transition: 'transform 800ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />
    </div>
  )
}
