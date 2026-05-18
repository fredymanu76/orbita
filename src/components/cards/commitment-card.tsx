'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowUpRight, ArrowDownLeft, Calendar, Check, X } from 'lucide-react'
import { format } from 'date-fns'
import type { Commitment } from '@/lib/types'

interface CommitmentCardProps {
  commitment: Commitment
  overdue?: boolean
  onComplete: () => void
  onCancel: () => void
}

export function CommitmentCard({ commitment, overdue = false, onComplete, onCancel }: CommitmentCardProps) {
  const daysUntilDue = commitment.due_date
    ? Math.ceil((new Date(commitment.due_date).getTime() - Date.now()) / 86400000)
    : null

  const urgencyBorder = overdue
    ? 'border-l-red-400'
    : daysUntilDue !== null && daysUntilDue <= 2
      ? 'border-l-amber-400'
      : 'border-l-slate-200'

  return (
    <div className={`rounded-xl bg-white/90 border-l-[3px] ${urgencyBorder} px-4 py-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            {commitment.direction === 'outgoing' ? (
              <ArrowUpRight className="h-4 w-4 text-blue-500 flex-shrink-0" />
            ) : (
              <ArrowDownLeft className="h-4 w-4 text-emerald-500 flex-shrink-0" />
            )}
            <p className="text-sm text-slate-700">{commitment.description}</p>
          </div>
          <div className="flex items-center gap-2 ml-6">
            {commitment.person && (
              <Badge variant="outline" className="text-[10px] py-0 bg-blue-50/50 text-blue-600 border-0">
                {(commitment.person as { name: string }).name}
              </Badge>
            )}
            {commitment.due_date && (
              <span className={`text-xs flex items-center gap-1 ${
                overdue ? 'text-red-500 font-medium' : 'text-slate-400'
              }`}>
                <Calendar className="h-3 w-3" />
                {format(new Date(commitment.due_date), 'MMM d')}
                {overdue && ' (overdue)'}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50" onClick={onComplete}>
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-500" onClick={onCancel}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
