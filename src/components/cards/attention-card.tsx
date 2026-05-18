'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Timer, Info, ChevronDown, ChevronUp } from 'lucide-react'

interface AttentionCardProps {
  id: string
  title: string
  type: string
  reasons: string[]
  link: string
  severity: 'high' | 'medium' | 'low'
}

const SEVERITY_STYLES = {
  high: {
    bg: 'bg-red-50/60',
    border: 'border-l-red-400',
    icon: 'text-red-400',
  },
  medium: {
    bg: 'bg-amber-50/60',
    border: 'border-l-amber-400',
    icon: 'text-amber-400',
  },
  low: {
    bg: 'bg-slate-50/60',
    border: 'border-l-slate-300',
    icon: 'text-slate-400',
  },
}

export function AttentionCard({ id, title, type, reasons, link, severity }: AttentionCardProps) {
  const [expanded, setExpanded] = useState(false)
  const style = SEVERITY_STYLES[severity]
  const Icon = type === 'thread_time_sensitive' ? Timer : AlertCircle

  return (
    <div className={`rounded-xl ${style.bg} border-l-[3px] ${style.border}`}>
      <div className="flex items-center gap-3 px-4 py-3 text-sm">
        <Icon className={`h-4 w-4 ${style.icon} flex-shrink-0`} />
        <Link href={link} className="flex-1 text-slate-600 hover:text-slate-800 transition-colors truncate">
          {title}
        </Link>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-slate-300 hover:text-slate-500 transition-colors p-1"
          title="Why am I seeing this?"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-3 pt-0">
          <div className="pl-7 border-l-2 border-slate-200 space-y-1">
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Why this appeared</p>
            {reasons.map((reason, i) => (
              <p key={i} className="text-[11px] text-slate-400">{reason}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
