'use client'

import { useState } from 'react'
import { Check, X, Pencil, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface InsightCardProps {
  id: string
  title: string
  whyItMatters: string
  confidence: number
  suggestedAction?: string
  category: string
  evidenceRefs?: Record<string, unknown>[]
  onAccept: (id: string) => void
  onDismiss: (id: string) => void
  onCorrect: (id: string, correction: string) => void
}

export function InsightCard({
  id,
  title,
  whyItMatters,
  confidence,
  suggestedAction,
  evidenceRefs,
  onAccept,
  onDismiss,
  onCorrect,
}: InsightCardProps) {
  const [showEvidence, setShowEvidence] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [correction, setCorrection] = useState('')

  const confidenceColor = confidence > 0.7
    ? 'bg-emerald-400'
    : confidence > 0.4
      ? 'bg-amber-400'
      : 'bg-slate-300'

  function handleCorrect() {
    if (correction.trim()) {
      onCorrect(id, correction.trim())
      setCorrecting(false)
      setCorrection('')
    }
  }

  return (
    <div className="rounded-xl bg-white/80 border border-slate-100 px-4 py-3">
      <div className="flex items-start gap-3">
        {/* Confidence dot */}
        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${confidenceColor}`} />

        <div className="flex-1 min-w-0">
          {/* Title — 1 sentence max */}
          <p className="text-sm text-slate-700 font-medium leading-snug">{title}</p>

          {/* Why it matters — 1 sentence max */}
          <p className="text-xs text-slate-400 mt-0.5">{whyItMatters}</p>

          {/* Suggested action */}
          {suggestedAction && (
            <p className="text-xs text-slate-500 mt-1.5 italic">{suggestedAction}</p>
          )}

          {/* Correcting input */}
          {correcting && (
            <div className="flex items-center gap-2 mt-2">
              <Input
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                placeholder="What would be more accurate?"
                className="text-xs h-8"
                onKeyDown={(e) => e.key === 'Enter' && handleCorrect()}
              />
              <Button size="sm" variant="ghost" onClick={handleCorrect} className="h-8 px-2 text-xs">
                Save
              </Button>
            </div>
          )}

          {/* Evidence (expandable) */}
          {evidenceRefs && evidenceRefs.length > 0 && showEvidence && (
            <div className="mt-2 pl-2 border-l-2 border-slate-100 space-y-1">
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Evidence</p>
              {evidenceRefs.map((ref, i) => (
                <p key={i} className="text-[11px] text-slate-400">
                  {Object.entries(ref).map(([k, v]) => `${k}: ${v}`).join(', ')}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onAccept(id)}
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
            onClick={() => onDismiss(id)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition-colors"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {evidenceRefs && evidenceRefs.length > 0 && (
            <button
              onClick={() => setShowEvidence(!showEvidence)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 transition-colors"
              title="Show evidence"
            >
              {showEvidence ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
