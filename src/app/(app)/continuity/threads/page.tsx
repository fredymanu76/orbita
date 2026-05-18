'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { ThreadCard } from '@/components/cards/thread-card'
import { ThreadDistributionChart } from '@/components/charts/thread-distribution-chart'
import {
  GitBranch,
  Activity,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react'
import type { Thread, ThreadStatus } from '@/lib/types'

type ThreadFilter = 'all' | 'active' | 'unresolved' | 'time_sensitive' | 'paused' | 'forgotten_risk' | 'completed'

const FILTERS: { key: ThreadFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'unresolved', label: 'Needs closure' },
  { key: 'time_sensitive', label: 'Time-sensitive' },
  { key: 'paused', label: 'On hold' },
  { key: 'forgotten_risk', label: 'Slipping' },
  { key: 'completed', label: 'Done' },
]

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

  const counts: Record<string, number> = {}
  for (const t of threads) {
    counts[t.status] = (counts[t.status] || 0) + 1
  }

  const activeCount = counts['active'] || 0
  const unresolvedCount = (counts['unresolved'] || 0) + (counts['forgotten_risk'] || 0) + (counts['time_sensitive'] || 0)
  const atRiskCount = counts['forgotten_risk'] || 0

  // Group for visual categorization
  const activeGroup = filtered.filter(t => t.status === 'active')
  const needsAttentionGroup = filtered.filter(t => ['unresolved', 'forgotten_risk', 'time_sensitive', 'emotionally_sensitive'].includes(t.status))
  const dormantGroup = filtered.filter(t => t.status === 'paused')
  const completedGroup = filtered.filter(t => t.status === 'completed')
  const showGrouped = filter === 'all'

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="h-7 bg-slate-100/60 rounded w-48 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Open Loops</h1>
        <p className="text-sm text-slate-400 mt-0.5">Things on your mind that are still open</p>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={GitBranch} label="Total" value={threads.length} color="text-slate-600" bg="bg-slate-50" />
        <StatCard icon={Activity} label="Active" value={activeCount} color="text-emerald-600" bg="bg-emerald-50" />
        <StatCard icon={AlertTriangle} label="Needs closure" value={unresolvedCount} color="text-orange-600" bg="bg-orange-50" />
        <StatCard icon={ShieldAlert} label="Slipping" value={atRiskCount} color="text-red-600" bg="bg-red-50" />
      </div>

      {/* Two-column chart row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ThreadDistributionChart threads={threads} view="type" />
        <ThreadDistributionChart threads={threads} view="status" />
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
                : 'bg-white/80 text-slate-400 hover:bg-slate-100'
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
          <p className="text-sm text-slate-400">Nothing here yet.</p>
        </div>
      ) : showGrouped ? (
        <div className="space-y-6">
          {activeGroup.length > 0 && (
            <ThreadGroup label="Active" threads={activeGroup} onAction={handleAction} />
          )}
          {needsAttentionGroup.length > 0 && (
            <ThreadGroup label="Needs your attention" threads={needsAttentionGroup} onAction={handleAction} />
          )}
          {dormantGroup.length > 0 && (
            <ThreadGroup label="On hold" threads={dormantGroup} onAction={handleAction} />
          )}
          {completedGroup.length > 0 && (
            <ThreadGroup label="Done" threads={completedGroup} onAction={handleAction} />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(thread => (
            <ThreadCard
              key={thread.id}
              id={thread.id}
              title={thread.title}
              threadType={thread.thread_type}
              status={thread.status}
              captureCount={thread.capture_count}
              commitmentCount={thread.commitment_count}
              lastActivityAt={thread.last_activity_at}
              continuityRetention={thread.continuity_retention}
              people={thread.people as { name: string }[] | undefined}
              onAction={handleAction}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ThreadGroup({ label, threads, onAction }: { label: string; threads: Thread[]; onAction: (id: string, status: string) => void }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">{label}</p>
      <div className="space-y-2">
        {threads.map(thread => (
          <ThreadCard
            key={thread.id}
            id={thread.id}
            title={thread.title}
            threadType={thread.thread_type}
            status={thread.status}
            captureCount={thread.capture_count}
            commitmentCount={thread.commitment_count}
            lastActivityAt={thread.last_activity_at}
            continuityRetention={thread.continuity_retention}
            people={thread.people as { name: string }[] | undefined}
            onAction={onAction}
          />
        ))}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, bg }: { icon: typeof GitBranch; label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`rounded-xl ${bg} p-4`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
