'use client'

import { useState } from 'react'
import { Check, X, Pencil } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { UserPattern } from '@/lib/types'

interface LearningCardProps {
  pattern: UserPattern
  onAccept: (id: string) => void
  onDismiss: (id: string) => void
  onCorrect: (id: string, correction: string) => void
}

export function LearningCard({ pattern, onAccept, onDismiss, onCorrect }: LearningCardProps) {
  const [correcting, setCorrecting] = useState(false)
  const [correction, setCorrection] = useState('')

  const confidenceColor = pattern.confidence > 0.7
    ? 'bg-emerald-400'
    : pattern.confidence > 0.4
      ? 'bg-amber-400'
      : 'bg-slate-300'

  // Language varies by status
  const prefix = pattern.status === 'emerging' ? 'It seems like' : 'Orbita has noticed'

  function handleCorrect() {
    if (correction.trim()) {
      onCorrect(pattern.id, correction.trim())
      setCorrecting(false)
      setCorrection('')
    }
  }

  return (
    <div className="rounded-xl bg-white/80 border border-slate-100 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${confidenceColor}`} />

        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-700 font-medium">{pattern.title}</p>
          <p className="text-xs text-slate-400 mt-0.5">{pattern.description}</p>

          {pattern.user_correction && (
            <p className="text-xs text-blue-500 mt-1">Your note: {pattern.user_correction}</p>
          )}

          {correcting && (
            <div className="flex items-center gap-2 mt-2">
              <Input
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                placeholder="What would be more accurate?"
                className="text-xs h-8"
                onKeyDown={(e) => e.key === 'Enter' && handleCorrect()}
              />
              <button onClick={handleCorrect} className="text-xs text-slate-500 hover:text-slate-700">
                Save
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onAccept(pattern.id)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 transition-colors"
            title="Accept"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setCorrecting(!correcting)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition-colors"
            title="Correct"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDismiss(pattern.id)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition-colors"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
