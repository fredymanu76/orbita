'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  GitBranch,
  Pause,
  Play,
  Check,
  Clock,
  AlertTriangle,
  Timer,
  Handshake,
  Users,
  ChevronRight,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import type { Thread, ThreadStatus } from '@/lib/types'

type ThreadFilter = 'all' | 'active' | 'unresolved' | 'time_sensitive' | 'paused' | 'forgotten_risk' | 'completed'

const FILTERS: { key: ThreadFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'unresolved', label: 'Unresolved' },
  { key: 'time_sensitive', label: 'Time sensitive' },
  { key: 'paused', label: 'Paused' },
  { key: 'forgotten_risk', label: 'At risk' },
  { key: 'completed', label: 'Completed' },
]

const STATUS_COLORS: Record<string, string> = {
  active: 'text-emerald-600 bg-emerald-50',
  unresolved: 'text-orange-600 bg-orange-50',
  paused: 'text-blue-600 bg-blue-50',
  completed: 'text-slate-400 bg-slate-50',
  forgotten_risk: 'text-red-500 bg-red-50',
  time_sensitive: 'text-amber-600 bg-amber-50',
  emotionally_sensitive: 'text-pink-600 bg-pink-50',
}

const THREAD_BORDERS: Record<string, string> = {
  relationship: 'border-l-blue-300',
  project: 'border-l-purple-300',
  obligation: 'border-l-amber-300',
  concern: 'border-l-rose-300',
  planning: 'border-l-indigo-300',
  idea: 'border-l-cyan-300',
  emotional: 'border-l-pink-300',
  admin: 'border-l-slate-300',
  recurring: 'border-l-teal-300',
  general: 'border-l-gray-300',
}

export default function ThreadsPage() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [filter, setFilter] = useState<ThreadFilter>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchThreads() {
      try {
        const res = await fetch('/api/threads?source=threads_table')
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
        prev.map(t => t.id === threadId ? { ...t, status: status as ThreadStatus } : t)
      )
    } catch {
      // Silently fail
    }
  }

  const filtered = filter === 'all' ? threads : threads.filter(t => t.status === filter)

  // Counts
  const counts: Record<string, number> = {}
  for (const t of threads) {
    counts[t.status] = (counts[t.status] || 0) + 1
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="h-7 bg-slate-100/60 rounded w-48 animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-slate-50/60 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Threads</h1>
        <p className="text-sm text-slate-400 mt-0.5">Your cognitive threads — ongoing situations, commitments, and contexts</p>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-6 text-xs text-slate-400">
        <span>{threads.length} total</span>
        {counts['active'] && <span className="text-emerald-500">{counts['active']} active</span>}
        {counts['unresolved'] && <span className="text-orange-500">{counts['unresolved']} unresolved</span>}
        {counts['forgotten_risk'] && <span className="text-red-400">{counts['forgotten_risk']} at risk</span>}
      </div>

      {/* Filters */}
      <div className="flex gap-1 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
              filter === f.key
                ? 'bg-slate-800 text-white'
                : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
            }`}
          >
            {f.label}
            {f.key !== 'all' && counts[f.key] ? ` (${counts[f.key]})` : ''}
          </button>
        ))}
      </div>

      {/* Thread list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <GitBranch className="h-6 w-6 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No threads in this category.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(thread => {
            const borderColor = THREAD_BORDERS[thread.thread_type] || THREAD_BORDERS.general
            const statusStyle = STATUS_COLORS[thread.status] || STATUS_COLORS.active

            return (
              <div key={thread.id} className={`border-l-[3px] ${borderColor} rounded-r-lg bg-white`}>
                <div className="px-4 py-3">
                  <div className="flex items-start justify-between">
                    <Link href={`/continuity/threads/${thread.id}`} className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 cursor-pointer group">
                        <h3 className="text-sm text-slate-700 truncate group-hover:text-slate-900 transition-colors">
                          {thread.title}
                        </h3>
                        <ChevronRight className="h-3 w-3 text-slate-200 group-hover:text-slate-400 transition-colors flex-shrink-0" />
                      </div>
                    </Link>
                    <Badge variant="outline" className={`text-[10px] py-0 border-0 flex-shrink-0 ${statusStyle}`}>
                      {thread.status.replace('_', ' ')}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-4 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <GitBranch className="h-3 w-3" /> {thread.capture_count}
                      </span>
                      {thread.commitment_count > 0 && (
                        <span className="flex items-center gap-1">
                          <Handshake className="h-3 w-3" /> {thread.commitment_count}
                        </span>
                      )}
                      <span>{formatDistanceToNow(new Date(thread.last_activity_at), { addSuffix: true })}</span>
                    </div>

                    {/* Retention bar */}
                    <div className="flex items-center gap-2">
                      <div className="w-12 bg-slate-100 rounded-full h-1">
                        <div
                          className="h-1 rounded-full"
                          style={{
                            width: `${thread.continuity_retention * 100}%`,
                            backgroundColor: thread.continuity_retention > 0.6 ? '#10b981'
                              : thread.continuity_retention > 0.3 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-300">{Math.round(thread.continuity_retention * 100)}%</span>
                    </div>
                  </div>

                  {/* Quick actions */}
                  {!['completed'].includes(thread.status) && (
                    <div className="flex gap-1 mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[11px] h-6 px-2 text-emerald-500"
                        onClick={() => handleAction(thread.id, 'completed')}
                      >
                        <Check className="h-3 w-3 mr-0.5" /> Resolve
                      </Button>
                      {thread.status === 'active' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[11px] h-6 px-2 text-slate-400"
                          onClick={() => handleAction(thread.id, 'paused')}
                        >
                          <Pause className="h-3 w-3 mr-0.5" /> Pause
                        </Button>
                      )}
                      {thread.status === 'paused' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[11px] h-6 px-2 text-blue-500"
                          onClick={() => handleAction(thread.id, 'active')}
                        >
                          <Play className="h-3 w-3 mr-0.5" /> Resume
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
