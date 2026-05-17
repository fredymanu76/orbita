'use client'

import { useState, useEffect, useCallback } from 'react'
import type { MemoryItem } from '@/lib/types'

interface UseMemoriesOptions {
  type?: string | null
  personId?: string | null
  page?: number
  limit?: number
}

interface UseMemoriesReturn {
  memories: MemoryItem[]
  total: number
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useMemories(options: UseMemoriesOptions = {}): UseMemoriesReturn {
  const { type, personId, page = 1, limit = 20 } = options
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMemories = useCallback(async () => {
    setLoading(true)
    setError(null)

    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    })
    if (type) params.set('type', type)
    if (personId) params.set('person_id', personId)

    try {
      const res = await fetch(`/api/memories?${params}`)
      if (!res.ok) throw new Error('Failed to fetch memories')
      const data = await res.json()
      setMemories(data.memories)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [type, personId, page, limit])

  useEffect(() => {
    fetchMemories()
  }, [fetchMemories])

  return { memories, total, loading, error, refresh: fetchMemories }
}
