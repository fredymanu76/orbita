'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfidenceBadge } from '@/components/ui/confidence-badge'
import {
  Clock,
  Check,
  X,
  AlertCircle,
  CalendarCheck,
  Activity,
} from 'lucide-react'
import { format } from 'date-fns'
import type { FollowUpCandidate } from '@/lib/types'

type FollowUpWithUrgency = FollowUpCandidate & { decay_adjusted_urgency?: number }

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState<FollowUpWithUrgency[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchFollowUps() {
      try {
        const res = await fetch('/api/follow-ups')
        if (res.ok) {
          const data = await res.json()
          setFollowUps(data.follow_ups || [])
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false)
      }
    }
    fetchFollowUps()
  }, [])

  async function handleAction(id: string, status: 'completed' | 'dismissed') {
    try {
      await fetch(`/api/follow-ups/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setFollowUps(prev => prev.filter(f => f.id !== id))
    } catch {
      // Silently fail
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="h-7 bg-slate-100/60 rounded w-32 animate-pulse" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-slate-50/60 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-slate-50/60 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const overdue = followUps.filter(f => f.follow_up_due_at && new Date(f.follow_up_due_at) < new Date())
  const upcoming = followUps.filter(f => !f.follow_up_due_at || new Date(f.follow_up_due_at) >= new Date())

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Waiting On</h1>
        <p className="text-sm text-slate-500 mt-0.5">Things you might have forgotten to follow up on</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-slate-50 p-4 flex items-center gap-3">
          <Activity className="h-5 w-5 text-slate-500" />
          <div>
            <p className="text-2xl font-bold text-slate-700">{followUps.length}</p>
            <p className="text-xs text-slate-400">Total</p>
          </div>
        </div>
        <div className="rounded-xl bg-red-50 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <div>
            <p className="text-2xl font-bold text-red-700">{overdue.length}</p>
            <p className="text-xs text-red-500">Overdue</p>
          </div>
        </div>
        <div className="rounded-xl bg-blue-50 p-4 flex items-center gap-3">
          <CalendarCheck className="h-5 w-5 text-blue-500" />
          <div>
            <p className="text-2xl font-bold text-blue-700">{upcoming.length}</p>
            <p className="text-xs text-blue-500">Upcoming</p>
          </div>
        </div>
      </div>

      {/* Overdue section */}
      {overdue.length > 0 && (
        <div className="rounded-xl bg-red-50/40 p-4">
          <h3 className="text-sm font-medium text-red-600 mb-3 flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4" />
            Overdue
          </h3>
          <div className="space-y-2">
            {overdue.map(f => (
              <FollowUpItem key={f.id} followUp={f} onAction={handleAction} />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming section */}
      {upcoming.length > 0 && (
        <div className="rounded-xl bg-blue-50/30 p-4">
          <h3 className="text-sm font-medium text-blue-600 mb-3 flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Upcoming
          </h3>
          <div className="space-y-2">
            {upcoming.map(f => (
              <FollowUpItem key={f.id} followUp={f} onAction={handleAction} />
            ))}
          </div>
        </div>
      )}

      {followUps.length === 0 && (
        <div className="text-center py-12 rounded-xl bg-white/80">
          <Clock className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-400">
            Nothing waiting on you right now. When you mention something you need to follow up on, it&apos;ll show up here.
          </p>
        </div>
      )}
    </div>
  )
}

function FollowUpItem({
  followUp,
  onAction,
}: {
  followUp: FollowUpWithUrgency
  onAction: (id: string, status: 'completed' | 'dismissed') => void
}) {
  const isOverdue = followUp.follow_up_due_at && new Date(followUp.follow_up_due_at) < new Date()
  const urgency = followUp.decay_adjusted_urgency ?? 0

  const urgencyBorder = isOverdue
    ? 'border-l-red-400'
    : urgency > 0.6
      ? 'border-l-amber-400'
      : urgency > 0.3
        ? 'border-l-blue-300'
        : 'border-l-slate-200'

  const urgencyLabel = isOverdue
    ? 'overdue'
    : urgency > 0.6
      ? 'high urgency'
      : urgency > 0.3
        ? 'moderate'
        : 'low'

  const urgencyStyle = isOverdue
    ? 'bg-red-50 text-red-600'
    : urgency > 0.6
      ? 'bg-amber-50 text-amber-600'
      : urgency > 0.3
        ? 'bg-blue-50 text-blue-600'
        : 'bg-slate-50 text-slate-500'

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl bg-white/90 border-l-[3px] ${urgencyBorder}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-slate-700 truncate">{followUp.description}</p>
          <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-medium ${urgencyStyle}`}>
            {urgencyLabel}
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-1.5">{followUp.detected_intent}</p>
        <div className="flex items-center gap-4 text-[11px] text-slate-400">
          {followUp.follow_up_due_at && (
            <span>Due: {format(new Date(followUp.follow_up_due_at), 'MMM d, yyyy')}</span>
          )}
          <span className="flex items-center gap-1">
            Certainty: <ConfidenceBadge value={followUp.continuity_retention} />
          </span>
          <span>Freshness: {Math.round(followUp.continuity_retention * 100)}%</span>
        </div>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-emerald-600 hover:bg-emerald-50"
          onClick={() => onAction(followUp.id, 'completed')}
        >
          <Check className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-slate-400"
          onClick={() => onAction(followUp.id, 'dismissed')}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}
