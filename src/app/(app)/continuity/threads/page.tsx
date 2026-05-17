'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  GitBranch,
  Pause,
  Play,
  Check,
  X,
  Clock,
  AlertTriangle,
  RotateCcw,
  Eye,
} from 'lucide-react'
import { format } from 'date-fns'
import type { InterruptedThread } from '@/lib/types'

type ThreadFilter = 'all' | 'active' | 'interrupted' | 'paused' | 'dormant' | 'restored' | 'forgotten' | 'resolved'

const FILTERS: { key: ThreadFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'interrupted', label: 'Interrupted' },
  { key: 'paused', label: 'Paused' },
  { key: 'dormant', label: 'Dormant' },
  { key: 'forgotten', label: 'Forgotten' },
  { key: 'restored', label: 'Restored' },
  { key: 'resolved', label: 'Resolved' },
]

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof GitBranch }> = {
  active: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: Play },
  paused: { bg: 'bg-blue-50', text: 'text-blue-600', icon: Pause },
  interrupted: { bg: 'bg-amber-50', text: 'text-amber-600', icon: AlertTriangle },
  dormant: { bg: 'bg-slate-50', text: 'text-slate-500', icon: Clock },
  forgotten: { bg: 'bg-red-50', text: 'text-red-500', icon: AlertTriangle },
  restored: { bg: 'bg-violet-50', text: 'text-violet-600', icon: RotateCcw },
  resolved: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: Check },
  dismissed: { bg: 'bg-slate-50', text: 'text-slate-400', icon: X },
}

export default function ThreadsPage() {
  const [threads, setThreads] = useState<(InterruptedThread & { decay_adjusted_score?: number })[]>([])
  const [filter, setFilter] = useState<ThreadFilter>('all')
  const [loading, setLoading] = useState(true)
  const [expandedThread, setExpandedThread] = useState<string | null>(null)
  const [reconstructions, setReconstructions] = useState<Record<string, string>>({})

  useEffect(() => {
    async function fetchThreads() {
      try {
        const res = await fetch('/api/threads')
        if (res.ok) {
          const data = await res.json()
          setThreads(data.threads || [])
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false)
      }
    }
    fetchThreads()
  }, [])

  async function handleAction(threadId: string, status: string) {
    try {
      await fetch(`/api/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setThreads(prev =>
        prev.map(t => t.id === threadId ? { ...t, status: status as InterruptedThread['status'] } : t)
      )
    } catch {
      // Silently fail
    }
  }

  async function handleReconstruct(threadId: string) {
    if (reconstructions[threadId]) {
      setExpandedThread(expandedThread === threadId ? null : threadId)
      return
    }
    try {
      const res = await fetch(`/api/threads/${threadId}`)
      if (res.ok) {
        const data = await res.json()
        setReconstructions(prev => ({ ...prev, [threadId]: data.reconstruction }))
        setExpandedThread(threadId)
      }
    } catch {
      // Silently fail
    }
  }

  const filtered = filter === 'all'
    ? threads
    : threads.filter(t => t.status === filter)

  // Counts per status
  const counts: Record<string, number> = {}
  for (const t of threads) {
    counts[t.status] = (counts[t.status] || 0) + 1
  }

  // High cognitive weight: threads with retention > 0.6 and high interruption score
  const highWeightCount = threads.filter(
    t => t.continuity_retention > 0.6 && t.interruption_score > 0.5
  ).length

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-slate-800">Continuity Threads</h1>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Continuity Threads</h1>
        <p className="text-sm text-slate-500 mt-0.5">Track and restore your cognitive threads</p>
      </div>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active', count: counts['active'] || 0, color: 'text-emerald-600' },
          { label: 'Interrupted', count: counts['interrupted'] || 0, color: 'text-amber-600' },
          { label: 'Restored', count: (counts['restored'] || 0), color: 'text-violet-600' },
          { label: 'High Weight', count: highWeightCount, color: 'text-red-600' },
        ].map(card => (
          <Card key={card.label}>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold text-slate-700">{card.count}</p>
              <p className={`text-xs font-medium ${card.color}`}>{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
              filter === f.key
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {f.label}
            {f.key !== 'all' && counts[f.key] ? ` (${counts[f.key]})` : ''}
          </button>
        ))}
      </div>

      {/* Thread List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-slate-400">No threads in this category.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(thread => {
            const style = STATUS_STYLES[thread.status] || STATUS_STYLES['interrupted']
            const StatusIcon = style.icon
            const isExpanded = expandedThread === thread.id

            return (
              <Card key={thread.id} className="overflow-hidden">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${style.bg} flex-shrink-0`}>
                      <StatusIcon className={`h-4 w-4 ${style.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-medium text-slate-700 truncate">{thread.title}</h3>
                        <Badge variant="outline" className={`text-[10px] ${style.bg} ${style.text}`}>
                          {thread.status}
                        </Badge>
                      </div>
                      {thread.thread_summary && (
                        <p className="text-xs text-slate-500 line-clamp-2 mb-2">{thread.thread_summary}</p>
                      )}
                      <div className="flex items-center gap-4 text-[11px] text-slate-400">
                        <span>Retention: {Math.round(thread.continuity_retention * 100)}%</span>
                        <span>Score: {(thread.interruption_score * 100).toFixed(0)}%</span>
                        <span>Last active: {format(new Date(thread.last_activity_at), 'MMM d, h:mm a')}</span>
                      </div>

                      {/* Retention bar */}
                      <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full transition-all duration-300"
                          style={{
                            width: `${thread.continuity_retention * 100}%`,
                            backgroundColor: thread.continuity_retention > 0.6 ? '#10b981'
                              : thread.continuity_retention > 0.3 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </div>

                      {/* Reconstruction */}
                      {isExpanded && reconstructions[thread.id] && (
                        <div className="mt-3 p-3 rounded-lg bg-violet-50/50 text-xs text-slate-600 leading-relaxed">
                          {reconstructions[thread.id]}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5 mt-3 ml-11">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => handleReconstruct(thread.id)}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      {isExpanded ? 'Hide' : 'Restore context'}
                    </Button>
                    {thread.status === 'interrupted' && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => handleAction(thread.id, 'restored')}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Resume
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => handleAction(thread.id, 'paused')}
                        >
                          <Pause className="h-3 w-3 mr-1" />
                          Pause
                        </Button>
                      </>
                    )}
                    {thread.status === 'paused' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => handleAction(thread.id, 'restored')}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Resume
                      </Button>
                    )}
                    {!['resolved', 'dismissed'].includes(thread.status) && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 text-emerald-600"
                          onClick={() => handleAction(thread.id, 'resolved')}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Resolve
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 text-slate-400"
                          onClick={() => handleAction(thread.id, 'dismissed')}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Dismiss
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
