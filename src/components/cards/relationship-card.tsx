'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import type { Person } from '@/lib/types'

interface RelationshipCardProps {
  person: Person
  daysSince?: number | null
  compact?: boolean
}

function getRecencyRing(days: number | null | undefined): string {
  if (days === null || days === undefined) return 'ring-slate-200'
  if (days > 14) return 'ring-red-300'
  if (days > 7) return 'ring-amber-300'
  return 'ring-emerald-300'
}

function getRecencyBg(days: number | null | undefined): string {
  if (days === null || days === undefined) return 'bg-slate-100 text-slate-500'
  if (days > 14) return 'bg-red-50 text-red-500'
  if (days > 7) return 'bg-amber-50 text-amber-500'
  return 'bg-blue-50 text-blue-500'
}

export function RelationshipCard({ person, daysSince, compact = false }: RelationshipCardProps) {
  const days = daysSince ?? (person.last_mentioned_at
    ? Math.floor((Date.now() - new Date(person.last_mentioned_at).getTime()) / 86400000)
    : null)

  if (compact) {
    return (
      <Link href={`/people/${person.id}`}>
        <div className="flex flex-col items-center cursor-pointer group" title={person.name}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ring-2 ${getRecencyRing(days)} ${getRecencyBg(days)} transition-transform group-hover:scale-105`}>
            {person.name[0]}
          </div>
          <span className="text-[11px] text-slate-500 mt-1.5">{person.name.split(' ')[0]}</span>
          {days !== null && (
            <span className={`text-[10px] ${days > 14 ? 'text-red-400' : days > 7 ? 'text-amber-400' : 'text-slate-300'}`}>
              {days}d ago
            </span>
          )}
        </div>
      </Link>
    )
  }

  return (
    <Link href={`/people/${person.id}`}>
      <div className="rounded-xl bg-white/90 hover:bg-white transition-colors p-4 cursor-pointer group">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ring-2 ${getRecencyRing(days)} ${getRecencyBg(days)} flex-shrink-0`}>
            {person.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-700 text-sm group-hover:text-slate-900 transition-colors">{person.name}</p>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
              {person.relationship && <span>{person.relationship}</span>}
              <span>{person.mention_count} mention{person.mention_count !== 1 ? 's' : ''}</span>
              {person.last_mentioned_at && (
                <span>{formatDistanceToNow(new Date(person.last_mentioned_at), { addSuffix: true })}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
