'use client'

import { useEffect, useState } from 'react'
import { isNativeApp } from '@/lib/capacitor'

/**
 * Animated splash overlay for the native app.
 * The Orbita orb rises from bottom-left to center, the text "ORBITA"
 * appears on the orb, then the whole thing fades out.
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

    // Phase 1: orb rises from bottom-left to center — 800ms
    const holdTimer = setTimeout(() => setPhase('hold'), 800)
    // Phase 2: hold at center with text visible — 1000ms
    const fadeTimer = setTimeout(() => setPhase('fadeout'), 1800)
    // Phase 3: fade out — 600ms
    const doneTimer = setTimeout(() => setPhase('done'), 2400)

    return () => {
      clearTimeout(holdTimer)
      clearTimeout(fadeTimer)
      clearTimeout(doneTimer)
    }
  }, [])

  if (phase === 'done' || !isNative) return null

  const arrived = phase === 'hold' || phase === 'fadeout'

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
        transition: 'opacity 600ms ease-out',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 140,
          height: 140,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 40% 40%, #f0e6ff, #c4b5fd 40%, #7c6bc4 70%, #3b2d80)',
          boxShadow:
            '0 0 60px rgba(124, 107, 196, 0.5), 0 0 120px rgba(124, 107, 196, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform:
            phase === 'animate'
              ? 'translate(-40vw, 40vh) scale(0.3)'
              : 'translate(0, 0) scale(1)',
          transition: 'transform 800ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <span
          style={{
            fontFamily:
              'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '0.25em',
            color: '#0D1230',
            textTransform: 'uppercase',
            opacity: arrived ? 1 : 0,
            transform: arrived ? 'scale(1)' : 'scale(0.6)',
            transition: 'opacity 400ms ease-out, transform 400ms ease-out',
          }}
        >
          ORBITA
        </span>
      </div>
    </div>
  )
}
