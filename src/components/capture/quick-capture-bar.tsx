'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Send, Mic } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { getAdaptivePrompt } from '@/lib/cognition/adaptive-prompts'
import type { PersonaMode, UserState } from '@/lib/types'

export function QuickCaptureBar() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [placeholder, setPlaceholder] = useState('Quick capture...')
  const router = useRouter()

  useEffect(() => {
    async function loadPrompt() {
      try {
        const [profileRes, stateRes] = await Promise.all([
          fetch('/api/self-model/profile'),
          fetch('/api/self-model/state'),
        ])

        let persona: PersonaMode | null = null
        let state: UserState | null = null

        if (profileRes.ok) {
          const data = await profileRes.json()
          persona = data.profile?.active_persona || null
        }
        if (stateRes.ok) {
          const data = await stateRes.json()
          state = data.state || null
        }

        const prompt = getAdaptivePrompt({
          persona,
          state,
          staleThreadTitle: null,
          captureCountToday: 0,
        })
        setPlaceholder(prompt)
      } catch {
        // Keep default placeholder
      }
    }
    loadPrompt()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setLoading(true)

    try {
      const res = await fetch('/api/capture/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (!res.ok) throw new Error('Failed to save')

      setContent('')
      toast.success('Memory captured')
    } catch {
      toast.error('Failed to capture')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        placeholder={placeholder}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="flex-1"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => router.push('/capture')}
      >
        <Mic className="h-4 w-4" />
      </Button>
      <Button type="submit" size="icon" disabled={!content.trim() || loading}>
        <Send className="h-4 w-4" />
      </Button>
    </form>
  )
}
