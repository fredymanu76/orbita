'use client'

import { useState, useCallback } from 'react'

interface RecallSource {
  id: string
  summary: string
  created_at: string
  similarity: number
}

interface RecallMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: RecallSource[]
}

export function useRecall() {
  const [messages, setMessages] = useState<RecallMessage[]>([])
  const [loading, setLoading] = useState(false)

  const ask = useCallback(async (query: string) => {
    setMessages(prev => [...prev, { role: 'user', content: query }])
    setLoading(true)

    try {
      const res = await fetch('/api/recall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })

      if (!res.ok) throw new Error('Recall failed')

      const data = await res.json()
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: data.response, sources: data.sources },
      ])
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I had trouble searching your memories. Please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    setMessages([])
  }, [])

  return { messages, loading, ask, clear }
}
