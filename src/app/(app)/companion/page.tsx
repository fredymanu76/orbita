'use client'

import { useRef, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Send, RefreshCw } from 'lucide-react'
import { useCompanion } from '@/hooks/use-companion'
import type { ContinuityState } from '@/lib/types'

const STATE_COLORS: Record<ContinuityState, string> = {
  stable: 'bg-emerald-50 text-emerald-600',
  mild_fragmentation: 'bg-blue-50 text-blue-600',
  overload_emerging: 'bg-amber-50 text-amber-600',
  high_discontinuity: 'bg-orange-50 text-orange-600',
  critical: 'bg-red-50 text-red-600',
}

export default function CompanionPage() {
  const {
    messages,
    contextWindow,
    loading,
    opening,
    isOpen,
    open,
    send,
    close,
  } = useCompanion()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend() {
    if (!input.trim() || loading) return
    send(input.trim())
    setInput('')
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Companion</h1>
        <p className="text-sm text-slate-500 mt-0.5">Continuity restoration interface</p>
      </div>

      {!isOpen ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="h-10 w-10 text-violet-400 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-slate-700 mb-2">
              Open a context window
            </h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
              The companion restores your cognitive continuity — reconnecting you with interrupted threads,
              forgotten obligations, and the context of your life stream.
            </p>
            <Button onClick={open} disabled={opening}>
              {opening ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Restoring context...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Open context window
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Context Summary Bar */}
          {contextWindow && (
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <Badge variant="outline" className={STATE_COLORS[contextWindow.life_state.continuity_state]}>
                {contextWindow.life_state.continuity_state.replace(/_/g, ' ')}
              </Badge>
              <span>Score: {Math.round(contextWindow.life_state.continuity_score)}</span>
              <span>Threads: {contextWindow.unresolved_threads.length}</span>
              <span>Emotion: {contextWindow.emotional_context.dominant_emotion}</span>
              <button
                onClick={close}
                className="ml-auto text-slate-400 hover:text-slate-600 transition-colors text-xs underline"
              >
                Close window
              </button>
            </div>
          )}

          {/* Messages */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="h-[500px] overflow-y-auto p-4 space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                        msg.role === 'user'
                          ? 'bg-slate-800 text-white'
                          : 'bg-slate-50 text-slate-700'
                      }`}
                    >
                      {msg.content.split('\n').map((line, j) => {
                        if (line.startsWith('- ')) return <li key={j} className="ml-3 mb-0.5">{line.slice(2)}</li>
                        if (line.startsWith('**') && line.endsWith('**')) return <p key={j} className="font-semibold mb-1">{line.slice(2, -2)}</p>
                        if (line.trim() === '') return <br key={j} />
                        return <p key={j} className="mb-1">{line}</p>
                      })}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-50 rounded-lg px-4 py-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                        <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-slate-200 p-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Continue in this context window..."
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300"
                    disabled={loading}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                    size="sm"
                    className="px-3"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
