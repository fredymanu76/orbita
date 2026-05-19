'use client'

import { cn } from '@/lib/utils'
import type { PersonaMode } from '@/lib/types'

interface PersonaSelectorProps {
  current: PersonaMode | null
  onSelect: (persona: PersonaMode) => void
}

const PERSONAS: { value: PersonaMode; label: string; description: string }[] = [
  { value: 'parent', label: 'Parent', description: 'Juggling family and everything else' },
  { value: 'carer', label: 'Carer', description: 'Looking after someone who depends on you' },
  { value: 'worker', label: 'Worker', description: 'Managing work, meetings, deadlines' },
  { value: 'founder', label: 'Founder', description: 'Building something from the ground up' },
  { value: 'faith_community', label: 'Faith & Community', description: 'Active in faith or community life' },
  { value: 'student', label: 'Student', description: 'Studying, exams, learning' },
  { value: 'general', label: 'General', description: 'A bit of everything' },
]

export function PersonaSelector({ current, onSelect }: PersonaSelectorProps) {
  return (
    <div>
      <h2 className="text-sm font-medium text-slate-700 mb-1">Your Mode</h2>
      <p className="text-xs text-slate-400 mb-3">This helps Orbita adapt its tone and priorities.</p>
      <div className="grid grid-cols-2 gap-2">
        {PERSONAS.map(p => (
          <button
            key={p.value}
            onClick={() => onSelect(p.value)}
            className={cn(
              'rounded-xl border px-3 py-2.5 text-left transition-all',
              current === p.value
                ? 'border-slate-300 bg-white shadow-sm'
                : 'border-slate-100 bg-white/50 hover:bg-white/80'
            )}
          >
            <p className="text-xs font-medium text-slate-700">{p.label}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{p.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
