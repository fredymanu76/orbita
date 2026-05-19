'use client'

import { useState } from 'react'
import { HelpCircle, Send, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface QuestionCardProps {
  id: string
  question: string
  reason: string
  onAnswer: (id: string, answer: string) => void
  onDismiss: (id: string) => void
}

export function QuestionCard({ id, question, reason, onAnswer, onDismiss }: QuestionCardProps) {
  const [answer, setAnswer] = useState('')

  function handleSubmit() {
    if (answer.trim()) {
      onAnswer(id, answer.trim())
      setAnswer('')
    }
  }

  return (
    <div className="rounded-xl bg-indigo-50/40 border border-indigo-100/60 px-4 py-3">
      <div className="flex items-start gap-3">
        <HelpCircle className="h-4 w-4 text-indigo-300 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-700 font-medium">{question}</p>
          <p className="text-xs text-slate-400 mt-0.5">{reason}</p>
          <div className="flex items-center gap-2 mt-2">
            <Input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Your answer..."
              className="text-xs h-8"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSubmit}
              disabled={!answer.trim()}
              className="h-8 px-2"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <button
          onClick={() => onDismiss(id)}
          className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 transition-colors"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
