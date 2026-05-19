'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Send, Mic, X, Sparkles, Archive } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { getAdaptivePrompt } from '@/lib/cognition/adaptive-prompts'
import { FormattedMessage } from '@/components/ui/formatted-message'
import type { PersonaMode, UserState, InputIntent } from '@/lib/types'

interface InlineResponse {
  intent: InputIntent
  response: string | null
  stored: boolean
}

export function QuickCaptureBar() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [placeholder, setPlaceholder] = useState('Capture a thought, or ask anything...')
  const [inlineResponse, setInlineResponse] = useState<InlineResponse | null>(null)
  const responseRef = useRef<HTMLDivElement>(null)
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
    setInlineResponse(null)

    try {
      const res = await fetch('/api/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })

      if (!res.ok) throw new Error('Failed')

      const data = await res.json()
      const intent = data.intent as InputIntent

      setContent('')

      if (data.response) {
        // Show inline response for non-capture intents
        setInlineResponse({
          intent,
          response: data.response,
          stored: data.stored || false,
        })
      } else {
        // Pure capture — brief confirmation
        toast.success('Captured')
      }

      // If it was a reflection that was also stored, note that subtly
      if (intent === 'reflect' && data.stored) {
        toast.success('Noted', { duration: 2000 })
      }
    } catch {
      toast.error('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function dismissResponse() {
    setInlineResponse(null)
  }

  const intentLabels: Record<InputIntent, { icon: typeof Sparkles; color: string }> = {
    ask: { icon: Sparkles, color: 'text-blue-500' },
    action: { icon: Sparkles, color: 'text-amber-500' },
    reflect: { icon: Sparkles, color: 'text-violet-500' },
    converse: { icon: Sparkles, color: 'text-slate-400' },
    capture: { icon: Archive, color: 'text-emerald-500' },
  }

  return (
    <div className="space-y-2">
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

      {/* Inline response */}
      {inlineResponse?.response && (
        <div
          ref={responseRef}
          className="relative bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-700 animate-in fade-in slide-in-from-top-1 duration-200"
        >
          <button
            onClick={dismissResponse}
            className="absolute top-2 right-2 text-slate-300 hover:text-slate-500 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-start gap-2 pr-6">
            {(() => {
              const meta = intentLabels[inlineResponse.intent]
              const Icon = meta.icon
              return <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.color}`} />
            })()}
            <FormattedMessage content={inlineResponse.response} />
          </div>
          {inlineResponse.stored && (
            <p className="text-[11px] text-slate-400 mt-1.5 ml-6">Also saved to your memory</p>
          )}
        </div>
      )}
    </div>
  )
}
