'use client'

import { useState, useRef, useEffect } from 'react'
import { useRecall } from '@/hooks/use-recall'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, MessageCircle, Brain, RotateCcw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'

const suggestedQueries = [
  'What did I promise anyone this week?',
  'What conversations did I have recently?',
  'Are there any overdue commitments?',
  'What was I working on yesterday?',
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
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-10rem)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Recall</h1>
          <p className="text-sm text-slate-500 mt-1">
            Ask questions about your memories
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={clear}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Clear
          </Button>
        )}
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <Brain className="h-12 w-12 text-slate-200 mb-4" />
              <h3 className="text-lg font-medium text-slate-600">What would you like to recall?</h3>
              <p className="text-sm text-slate-400 mt-1 max-w-sm mb-6">
                Ask about your conversations, commitments, or anything you&apos;ve captured.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                {suggestedQueries.map((query) => (
                  <button
                    key={query}
                    onClick={() => handleSuggestion(query)}
                    className="text-left text-sm p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600"
                  >
                    {query}
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
                          <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center">
                            <MessageCircle className="h-3.5 w-3.5 text-blue-600" />
                          </div>
                        </div>
                        <div>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {message.content}
                          </p>

                          {message.sources && message.sources.length > 0 && (
                            <div className="mt-3 space-y-1">
                              <p className="text-xs text-slate-400 font-medium">Sources:</p>
                              <div className="flex gap-1 flex-wrap">
                                {message.sources.map((source) => (
                                  <Link key={source.id} href={`/memories/${source.id}`}>
                                    <Badge variant="outline" className="text-xs cursor-pointer hover:bg-slate-50">
                                      {formatDistanceToNow(new Date(source.created_at), { addSuffix: true })}
                                    </Badge>
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
                    <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center">
                      <MessageCircle className="h-3.5 w-3.5 text-blue-600" />
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

        <CardContent className="border-t p-3">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Input
              placeholder="Ask about your memories..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              className="flex-1"
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
