'use client'

import { useState, useCallback } from 'react'
import type { ContextWindow } from '@/lib/types'

interface CompanionMessage {
  role: 'assistant' | 'user'
  content: string
}

export function useCompanion() {
  const [windowId, setWindowId] = useState<string | null>(null)
  const [messages, setMessages] = useState<CompanionMessage[]>([])
  const [contextWindow, setContextWindow] = useState<ContextWindow | null>(null)
  const [loading, setLoading] = useState(false)
  const [opening, setOpening] = useState(false)

  const open = useCallback(async () => {
    setOpening(true)
    try {
      const res = await fetch('/api/companion/open', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to open context window')

      const data = await res.json()
      setWindowId(data.window_id)
      setContextWindow(data.context_window)
      setMessages([{ role: 'assistant', content: data.restoration }])
    } catch (error) {
      console.error('Failed to open companion:', error)
    } finally {
      setOpening(false)
    }
  }, [])

  const send = useCallback(async (message: string) => {
    if (!windowId) return

    setMessages(prev => [...prev, { role: 'user', content: message }])
    setLoading(true)

    try {
      const res = await fetch('/api/companion/continue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ window_id: windowId, message }),
      })

      if (!res.ok) throw new Error('Failed to continue in window')

      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }])
    } catch (error) {
      console.error('Companion error:', error)
      setMessages(prev => [...prev, { role: 'assistant', content: 'Unable to restore context at this moment.' }])
    } finally {
      setLoading(false)
    }
  }, [windowId])

  const close = useCallback(() => {
    setWindowId(null)
    setMessages([])
    setContextWindow(null)
  }, [])

  return {
    windowId,
    messages,
    contextWindow,
    loading,
    opening,
    isOpen: windowId !== null,
    open,
    send,
    close,
  }
}
