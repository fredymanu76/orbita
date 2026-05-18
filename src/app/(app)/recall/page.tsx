'use client'

import { useState, useRef, useEffect } from 'react'
import { useRecall } from '@/hooks/use-recall'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, MessageCircle, Brain, RotateCcw, Sparkles } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'

const suggestedQueries = [
  { text: 'What did I promise anyone this week?', icon: '🤝' },
  { text: 'What conversations did I have recently?', icon: '💬' },
  { text: 'Do I have any overdue promises?', icon: '⏰' },
  { text: 'What was I working on yesterday?', icon: '📝' },
]

export default function RecallPage() {
  const { messages, loading, ask, clear } = useRecall()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return
    ask(input.trim())
    setInput('')
  }

  function handleSuggestion(query: string) {
    ask(query)
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-10rem)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Ask</h1>
          <p className="text-sm text-slate-500 mt-1">
            Search your memory
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={clear} className="bg-white/80">
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Clear
          </Button>
        )}
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden bg-white/80 border-slate-100">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
                <Brain className="h-8 w-8 text-indigo-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-600">What would you like to remember?</h3>
              <p className="text-sm text-slate-400 mt-1 max-w-sm mb-6">
                Ask about your conversations, promises, or anything you&apos;ve captured.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                {suggestedQueries.map((query) => (
                  <button
                    key={query.text}
                    onClick={() => handleSuggestion(query.text)}
                    className="text-left text-sm p-3 rounded-xl bg-white/90 border border-slate-100 hover:bg-white hover:border-slate-200 transition-all text-slate-600 flex items-start gap-2"
                  >
                    <span className="text-base">{query.icon}</span>
                    <span>{query.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, i) => (
                <div key={i} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] ${
                    message.role === 'user'
                      ? 'bg-slate-800 text-white rounded-2xl rounded-br-md px-4 py-3'
                      : 'space-y-3'
                  }`}>
                    {message.role === 'assistant' && (
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 mt-1">
                          <div className="h-7 w-7 rounded-full bg-indigo-50 flex items-center justify-center">
                            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                          </div>
                        </div>
                        <div>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {message.content}
                          </p>

                          {message.sources && message.sources.length > 0 && (
                            <div className="mt-3 space-y-1">
                              <p className="text-xs text-slate-400 font-medium">Sources:</p>
                              <div className="flex gap-1.5 flex-wrap">
                                {message.sources.map((source) => (
                                  <Link key={source.id} href={`/memories/${source.id}`}>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors cursor-pointer">
                                      {formatDistanceToNow(new Date(source.created_at), { addSuffix: true })}
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {message.role === 'user' && (
                      <p className="text-sm">{message.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-indigo-50 flex items-center justify-center">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                    </div>
                    <div className="flex gap-1">
                      <div className="h-2 w-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="h-2 w-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="h-2 w-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <CardContent className="border-t border-slate-100 p-3">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Input
              placeholder="Ask anything about your life..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              className="flex-1 bg-white/80"
            />
            <Button type="submit" size="icon" disabled={!input.trim() || loading}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
