'use client'

import { LearningCard } from './learning-card'
import type { UserPattern } from '@/lib/types'

interface LearningCardsSectionProps {
  patterns: UserPattern[]
  onAccept: (id: string) => void
  onDismiss: (id: string) => void
  onCorrect: (id: string, correction: string) => void
}

export function LearningCardsSection({ patterns, onAccept, onDismiss, onCorrect }: LearningCardsSectionProps) {
  const visible = patterns.filter(p => ['emerging', 'established'].includes(p.status))

  if (visible.length === 0) {
    return (
      <div>
        <h2 className="text-sm font-medium text-slate-700 mb-3">Your Patterns</h2>
        <p className="text-xs text-slate-400 py-4 text-center">
          No patterns detected yet. Keep capturing and Orbita will learn.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-sm font-medium text-slate-700 mb-3">Your Patterns</h2>
      <div className="space-y-2">
        {visible.map(pattern => (
          <LearningCard
            key={pattern.id}
            pattern={pattern}
            onAccept={onAccept}
            onDismiss={onDismiss}
            onCorrect={onCorrect}
          />
        ))}
      </div>
    </div>
  )
}
