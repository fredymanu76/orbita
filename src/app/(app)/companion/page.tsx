'use client'

import { useRef, useEffect, useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CONTINUITY_STATE_META } from '@/lib/colors'
import { Sparkles, Send, RefreshCw, GitBranch, AlertCircle } from 'lucide-react'
import { useCompanion } from '@/hooks/use-companion'
import type { ContinuityState, InterruptedThread, FollowUpCandidate } from '@/lib/types'

type ThreadSuggestion = InterruptedThread & { decay_adjusted_score?: number }
type FollowUpSuggestion = FollowUpCandidate & { decay_adjusted_urgency?: number }

/** Parse simple markdown-like text into formatted React elements */
function FormattedMessage({ content, isUser }: { content: string; isUser: boolean }) {
  const elements = useMemo(() => {
    const lines = content.split('\n')
    const result: React.ReactNode[] = []
    let listItems: React.ReactNode[] = []
    let listKey = 0

    function flushList() {
      if (listItems.length > 0) {
        result.push(
          <ul key={`list-${listKey++}`} className="space-y-1 my-2 ml-1">
            {listItems}
          </ul>
        )
        listItems = []
      }
    }

    function parseInline(text: string): React.ReactNode {
      // Replace **bold** and inline `code`
      const parts: React.ReactNode[] = []
      let remaining = text
      let key = 0

      while (remaining.length > 0) {
        // Bold
        const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
        // Inline code
        const codeMatch = remaining.match(/`(.+?)`/)

        // Find the earliest match
        let earliest: { type: 'bold' | 'code'; match: RegExpMatchArray } | null = null
        if (boldMatch && boldMatch.index !== undefined) {
          earliest = { type: 'bold', match: boldMatch }
        }
        if (codeMatch && codeMatch.index !== undefined) {
          if (!earliest || (codeMatch.index < (earliest.match.index ?? Infinity))) {
            earliest = { type: 'code', match: codeMatch }
          }
        }

        if (!earliest || earliest.match.index === undefined) {
          parts.push(remaining)
          break
        }

        // Text before the match
        if (earliest.match.index > 0) {
          parts.push(remaining.substring(0, earliest.match.index))
        }

        if (earliest.type === 'bold') {
          parts.push(
            <strong key={`b-${key++}`} className={isUser ? 'font-semibold' : 'font-semibold text-slate-800'}>
              {earliest.match[1]}
            </strong>
          )
        } else {
          parts.push(
            <code key={`c-${key++}`} className="px-1 py-0.5 rounded bg-slate-200/50 text-[12px] font-mono">
              {earliest.match[1]}
            </code>
          )
        }

        remaining = remaining.substring((earliest.match.index ?? 0) + earliest.match[0].length)
      }

      return parts.length === 1 ? parts[0] : <>{parts}</>
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Numbered list: "1. text" or "2. text"
      const numberedMatch = line.match(/^(\d+)\.\s+(.+)/)
      if (numberedMatch) {
        flushList()
        listItems.push(
          <li key={`li-${i}`} className="flex gap-2 text-sm">
            <span className={`font-medium flex-shrink-0 w-5 text-right ${isUser ? 'text-slate-300' : 'text-indigo-400'}`}>{numberedMatch[1]}.</span>
            <span>{parseInline(numberedMatch[2])}</span>
          </li>
        )
        continue
      }

      // Bullet list
      if (line.startsWith('- ') || line.startsWith('• ')) {
        const text = line.replace(/^[-•]\s+/, '')
        listItems.push(
          <li key={`li-${i}`} className="flex gap-2 text-sm">
            <span className={`flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${isUser ? 'bg-slate-300' : 'bg-indigo-300'}`} />
            <span>{parseInline(text)}</span>
          </li>
        )
        continue
      }

      flushList()

      // Empty line
      if (line.trim() === '') {
        result.push(<div key={`br-${i}`} className="h-2" />)
        continue
      }

      // Heading-like: whole line is bold
      if (line.startsWith('**') && line.endsWith('**')) {
        result.push(
          <p key={`h-${i}`} className={`font-semibold mb-1 ${isUser ? '' : 'text-slate-800'}`}>
            {line.slice(2, -2)}
          </p>
        )
        continue
      }

      // Regular paragraph
      result.push(
        <p key={`p-${i}`} className="text-sm mb-1 leading-relaxed">
          {parseInline(line)}
        </p>
      )
    }

    flushList()
    return result
  }, [content, isUser])

  return <div>{elements}</div>
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
  const [threads, setThreads] = useState<ThreadSuggestion[]>([])
  const [followUps, setFollowUps] = useState<FollowUpSuggestion[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    async function fetchSuggestions() {
      try {
        const [threadsRes, followUpsRes] = await Promise.all([
          fetch('/api/threads'),
          fetch('/api/follow-ups'),
        ])
        if (threadsRes.ok) {
          const data = await threadsRes.json()
          setThreads((data.threads || []).slice(0, 3))
        }
        if (followUpsRes.ok) {
          const data = await followUpsRes.json()
          setFollowUps((data.follow_ups || []).slice(0, 3))
        }
      } catch {
        // Non-critical
      }
    }
    fetchSuggestions()
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend() {
    if (!input.trim() || loading) return
    send(input.trim())
    setInput('')
  }

  const stateMeta = contextWindow
    ? CONTINUITY_STATE_META[contextWindow.life_state.continuity_state as ContinuityState]
    : null

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Insights</h1>
        <p className="text-sm text-slate-500 mt-0.5">A clearer picture of what&apos;s going on in your life</p>
      </div>

      {!isOpen ? (
        <Card className="bg-white/80 border-slate-100">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="h-8 w-8 text-violet-400" />
            </div>
            <h2 className="text-lg font-medium text-slate-700 mb-2">
              See what&apos;s going on
            </h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
              Get a summary of your open loops, forgotten promises, and anything
              that might need your attention right now.
            </p>
            <Button onClick={open} disabled={opening}>
              {opening ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Loading your context...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Show me what&apos;s happening
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Context Summary Bar */}
          {contextWindow && stateMeta && (
            <div className={`rounded-xl ${stateMeta.bg} px-4 py-3 flex items-center justify-between`}>
              <div className="flex items-center gap-3 text-xs">
                <Badge variant="outline" className={`${stateMeta.bg} ${stateMeta.color} border-0`}>
                  {contextWindow.life_state.continuity_state.replace(/_/g, ' ')}
                </Badge>
                <span className="text-slate-500">Balance: {Math.round(contextWindow.life_state.continuity_score)}</span>
                <span className="text-slate-500">Open loops: {contextWindow.unresolved_threads.length}</span>
                <span className="text-slate-500">Mood: {contextWindow.emotional_context.dominant_emotion}</span>
              </div>
              <button
                onClick={close}
                className="text-slate-400 hover:text-slate-600 transition-colors text-xs underline"
              >
                Close
              </button>
            </div>
          )}

          {/* Proactive Suggestions */}
          {(threads.length > 0 || followUps.length > 0) && messages.length <= 1 && (
            <div className="space-y-3">
              {threads.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
                    <GitBranch className="h-3 w-3" />
                    Open loops that may need your attention
                  </p>
                  <div className="space-y-2">
                    {threads.map(thread => (
                      <button
                        key={thread.id}
                        onClick={() => send(`Catch me up on: ${thread.title}`)}
                        className="w-full text-left"
                      >
                        <div className="rounded-xl bg-violet-50/50 hover:bg-violet-50 transition-colors p-3 border border-violet-100/50">
                          <p className="text-sm text-slate-700 font-medium truncate">{thread.title}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Freshness: {Math.round(thread.continuity_retention * 100)}% — {thread.status.replace(/_/g, ' ')}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {followUps.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3" />
                    Things you might have forgotten
                  </p>
                  <div className="space-y-2">
                    {followUps.map(fu => (
                      <button
                        key={fu.id}
                        onClick={() => send(`Remind me about: ${fu.description}`)}
                        className="w-full text-left"
                      >
                        <div className="rounded-xl bg-amber-50/50 hover:bg-amber-50 transition-colors p-3 border border-amber-100/50">
                          <p className="text-sm text-slate-700 truncate">{fu.description}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {fu.detected_intent}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          <Card className="overflow-hidden bg-white/80 border-slate-100">
            <CardContent className="p-0">
              <div className="h-[calc(100vh-22rem)] sm:h-[500px] overflow-y-auto p-3 sm:p-4 space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex items-start gap-2 sm:gap-2.5 max-w-[90%] sm:max-w-[85%]">
                        <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2.5 sm:px-4 sm:py-3 text-sm text-slate-700">
                          <FormattedMessage content={msg.content} isUser={false} />
                        </div>
                      </div>
                    )}
                    {msg.role === 'user' && (
                      <div className="max-w-[85%] sm:max-w-[80%] rounded-xl bg-slate-800 text-white px-3 py-2.5 sm:px-4 sm:py-3 text-sm">
                        <FormattedMessage content={msg.content} isUser={true} />
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-3">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                          <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-slate-100 p-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Ask a follow-up question..."
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white/80"
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
