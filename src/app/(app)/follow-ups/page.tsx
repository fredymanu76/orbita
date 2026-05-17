'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, Check, X, AlertCircle, ArrowRight } from 'lucide-react'
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

  function getUrgencyBadge(followUp: FollowUpWithUrgency) {
    const now = new Date()
    if (followUp.follow_up_due_at && new Date(followUp.follow_up_due_at) < now) {
      return <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200">overdue</Badge>
    }
    const urgency = followUp.decay_adjusted_urgency ?? 0
    if (urgency > 0.6) {
      return <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-600 border-amber-200">high urgency</Badge>
    }
    if (urgency > 0.3) {
      return <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-600 border-blue-200">moderate</Badge>
    }
    return <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500 border-slate-200">low</Badge>
  }

  function getConfidenceDots(confidence: number) {
    const filled = Math.round(confidence * 5)
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${i <= filled ? 'bg-blue-400' : 'bg-slate-200'}`}
          />
        ))}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-slate-800">Follow-ups</h1>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const overdue = followUps.filter(f => f.follow_up_due_at && new Date(f.follow_up_due_at) < new Date())
  const upcoming = followUps.filter(f => !f.follow_up_due_at || new Date(f.follow_up_due_at) >= new Date())

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Follow-ups</h1>
        <p className="text-sm text-slate-500 mt-0.5">Detected intentions that may need your attention</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-red-600">{overdue.length}</p>
            <p className="text-xs text-slate-500">Overdue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{upcoming.length}</p>
            <p className="text-xs text-slate-500">Upcoming</p>
          </CardContent>
        </Card>
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Overdue
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdue.map(f => (
              <FollowUpItem key={f.id} followUp={f} onAction={handleAction} getUrgencyBadge={getUrgencyBadge} getConfidenceDots={getConfidenceDots} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Upcoming
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.map(f => (
              <FollowUpItem key={f.id} followUp={f} onAction={handleAction} getUrgencyBadge={getUrgencyBadge} getConfidenceDots={getConfidenceDots} />
            ))}
          </CardContent>
        </Card>
      )}

      {followUps.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <Clock className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              No pending follow-ups. As you capture thoughts with future intentions, they will appear here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function FollowUpItem({
  followUp,
  onAction,
  getUrgencyBadge,
  getConfidenceDots,
}: {
  followUp: FollowUpWithUrgency
  onAction: (id: string, status: 'completed' | 'dismissed') => void
  getUrgencyBadge: (f: FollowUpWithUrgency) => React.ReactNode
  getConfidenceDots: (c: number) => React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-slate-700 truncate">{followUp.description}</p>
          {getUrgencyBadge(followUp)}
        </div>
        <p className="text-xs text-slate-500 mb-1.5">{followUp.detected_intent}</p>
        <div className="flex items-center gap-4 text-[11px] text-slate-400">
          {followUp.follow_up_due_at && (
            <span>Due: {format(new Date(followUp.follow_up_due_at), 'MMM d, yyyy')}</span>
          )}
          <span className="flex items-center gap-1">
            Confidence: {getConfidenceDots(followUp.continuity_retention)}
          </span>
          <span>Retention: {Math.round(followUp.continuity_retention * 100)}%</span>
        </div>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-emerald-600"
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
