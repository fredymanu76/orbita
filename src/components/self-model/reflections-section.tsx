'use client'

import { X } from 'lucide-react'
import type { ReflectionMemory } from '@/lib/types'

interface ReflectionsSectionProps {
  reflections: ReflectionMemory[]
  onRemove: (id: string) => void
}

const TYPE_LABELS: Record<string, string> = {
  value: 'Value',
  aspiration: 'Aspiration',
  identity_anchor: 'Identity',
  emotional_anchor: 'Anchor',
  belief: 'Belief',
  boundary: 'Boundary',
}

export function ReflectionsSection({ reflections, onRemove }: ReflectionsSectionProps) {
  if (reflections.length === 0) {
    return (
      <div>
        <h2 className="text-sm font-medium text-slate-700 mb-3">What You&apos;ve Shared</h2>
        <p className="text-xs text-slate-400 py-4 text-center">
          As you share your values and aspirations, they&apos;ll appear here.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-sm font-medium text-slate-700 mb-3">What You&apos;ve Shared</h2>
      <div className="space-y-2">
        {reflections.map(r => (
          <div key={r.id} className="flex items-start gap-3 rounded-xl bg-white/80 border border-slate-100 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-700">&ldquo;{r.content}&rdquo;</p>
              <p className="text-[10px] text-slate-400 mt-1">
                {TYPE_LABELS[r.memory_type] || r.memory_type}
                {r.source_type === 'inference' && ' (inferred)'}
              </p>
            </div>
            <button
              onClick={() => onRemove(r.id)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0"
              title="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
