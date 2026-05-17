'use client'

import { useState, useEffect, useCallback } from 'react'
import type { CognitiveLoadReading } from '@/lib/types'

export function useCognitiveLoad() {
  const [loading, setLoading] = useState(true)
  const [loadReading, setLoadReading] = useState<CognitiveLoadReading | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/cognitive-load')
      if (res.ok) {
        const data = await res.json()
        setLoadReading(data.reading)
      }
    } catch {
      setError('Failed to fetch cognitive load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch_()
  }, [fetch_])

  const isHighLoad = loadReading ? loadReading.load_score > 0.7 : false

  return {
    loading,
    loadReading,
    isHighLoad,
    error,
    refresh: fetch_,
  }
}
