'use client'

import { useEffect, useState, useCallback } from 'react'
import { QuickCaptureBar } from '@/components/capture/quick-capture-bar'
import { ContinuityStateHero } from '@/components/charts/continuity-state-hero'
import { CognitiveLoadChart } from '@/components/charts/cognitive-load-chart'
import { ThreadDistributionChart } from '@/components/charts/thread-distribution-chart'
import { ThreadCard } from '@/components/cards/thread-card'
import { AttentionCard } from '@/components/cards/attention-card'
import { RelationshipCard } from '@/components/cards/relationship-card'
import {
  CheckCircle2,
  ChevronRight,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { Commitment, ContinuityState, CognitiveLoadReading, Person, Thread } from '@/lib/types'

export default function DashboardPage() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [continuityState, setContinuityState] = useState<ContinuityState>('stable')
  const [continuityScore, setContinuityScore] = useState(0)
  const [cognitiveLoadReading, setCognitiveLoadReading] = useState<CognitiveLoadReading | null>(null)
  const [peopleNeedingFollowUp, setPeopleNeedingFollowUp] = useState<(Person & { days_since: number })[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [threadsRes, commitmentsRes, continuityRes, loadRes, peopleRes] = await Promise.all([
        fetch('/api/threads?include_people=true'),
        fetch('/api/commitments?status=active'),
        fetch('/api/continuity'),
        fetch('/api/cognitive-load'),
        fetch('/api/people'),
      ])

      if (threadsRes.ok) {
        const data = await threadsRes.json()
        setThreads((data.threads || []).slice(0, 8))
      }
      if (commitmentsRes.ok) {
        const data = await commitmentsRes.json()
        setCommitments(data.commitments || [])
      }
      if (continuityRes.ok) {
        const data = await continuityRes.json()
        setContinuityState(data.state)
        setContinuityScore(data.score ?? 0)
      }
      if (loadRes.ok) {
        const data = await loadRes.json()
        setCognitiveLoadReading(data.reading ?? null)
      }
      if (peopleRes.ok) {
        const data = await peopleRes.json()
        const now = new Date()
        const sorted = (data.people || [])
          .filter((p: Person) => p.last_mentioned_at)
          .map((p: Person) => ({
            ...p,
            days_since: Math.floor((now.getTime() - new Date(p.last_mentioned_at!).getTime()) / (1000 * 60 * 60 * 24)),
          }))
          .filter((p: Person & { days_since: number }) => p.days_since > 5)
          .sort((a: { days_since: number }, b: { days_since: number }) => b.days_since - a.days_since)
          .slice(0, 4)
        setPeopleNeedingFollowUp(sorted)
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const today = format(new Date(), 'EEEE, MMMM d')
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  // Build surfaced items with deterministic reasons
  interface SurfacedItem {
    id: string
    type: string
    title: string
    reasons: string[]
    link: string
    severity: 'high' | 'medium' | 'low'
  }

  const surfacedItems: SurfacedItem[] = []

  for (const c of commitments) {
    if (c.due_date && c.due_date < todayStr) {
      const daysOverdue = Math.floor((Date.now() - new Date(c.due_date).getTime()) / 86400000)
      surfacedItems.push({
        id: `commitment-${c.id}`,
        type: 'commitment_overdue',
        title: c.description,
        reasons: [
          `Due date was ${format(new Date(c.due_date), 'MMM d')} (${daysOverdue}d overdue)`,
          `Status: active, not yet resolved`,
          c.person ? `Involves ${(c.person as { name: string }).name}` : 'No person linked',
        ],
        link: c.source_memory_id ? `/continuity/threads/${c.source_memory_id}` : '#',
        severity: daysOverdue > 7 ? 'high' : 'medium',
      })
    } else if (c.due_date === todayStr) {
      surfacedItems.push({
        id: `commitment-today-${c.id}`,
        type: 'commitment_due_today',
        title: c.description,
        reasons: [
          `Due today (${format(new Date(), 'MMM d')})`,
          c.person ? `Involves ${(c.person as { name: string }).name}` : 'No person linked',
        ],
        link: '#',
        severity: 'medium',
      })
    }
  }

  for (const t of threads) {
    if (t.status === 'time_sensitive') {
      surfacedItems.push({
        id: `thread-ts-${t.id}`,
        type: 'thread_time_sensitive',
        title: t.title,
        reasons: [
          'Has a promise due within 48 hours',
          `${t.commitment_count} open promise${t.commitment_count === 1 ? '' : 's'}`,
          `Last activity: ${formatDistanceToNow(new Date(t.last_activity_at), { addSuffix: true })}`,
          `Flagged as time-sensitive`,
        ],
        link: `/continuity/threads/${t.id}`,
        severity: 'high',
      })
    }
    if (t.status === 'forgotten_risk') {
      surfacedItems.push({
        id: `thread-fr-${t.id}`,
        type: 'thread_forgotten_risk',
        title: t.title,
        reasons: [
          `Freshness: ${Math.round(t.continuity_retention * 100)}% — this is slipping from memory`,
          `Last activity: ${formatDistanceToNow(new Date(t.last_activity_at), { addSuffix: true })}`,
          `Flagged as slipping because it hasn't been touched recently`,
        ],
        link: `/continuity/threads/${t.id}`,
        severity: 'medium',
      })
    }
  }

  const activeThreads = threads.filter(t => !['completed', 'paused'].includes(t.status))
  const unresolvedCount = threads.filter(t => ['unresolved', 'forgotten_risk', 'time_sensitive'].includes(t.status)).length
  const cognitiveLoad = cognitiveLoadReading?.load_score ?? null

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 px-1">
        <div className="space-y-1">
          <div className="h-7 bg-slate-100/60 rounded w-40 animate-pulse" />
          <div className="h-4 bg-slate-50 rounded w-28 animate-pulse" />
        </div>
        <div className="h-12 bg-slate-50 rounded-xl animate-pulse" />
        <div className="h-28 bg-slate-50/60 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-64 bg-slate-50/60 rounded-xl animate-pulse" />
          <div className="h-64 bg-slate-50/60 rounded-xl animate-pulse" />
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
    <div className="max-w-4xl mx-auto space-y-8 px-1">
      {/* Greeting + date */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Good {getTimeOfDay()}</h1>
        <p className="text-sm text-slate-400 mt-0.5">{today}</p>
      </div>

      {/* Quick capture */}
      <QuickCaptureBar />

      {/* Continuity State Hero — radial gauge */}
      <ContinuityStateHero
        score={continuityScore}
        state={continuityState}
        activeThreads={activeThreads.length}
        unresolvedCount={unresolvedCount}
        cognitiveLoad={cognitiveLoad}
      />

      {/* Two-column chart row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CognitiveLoadChart reading={cognitiveLoadReading} />
        <ThreadDistributionChart threads={threads as Thread[]} view="type" />
      </div>

      {/* Attention Strip */}
      {surfacedItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Needs your attention</p>
          {surfacedItems.map(item => (
            <AttentionCard
              key={item.id}
              id={item.id}
              title={item.title}
              type={item.type}
              reasons={item.reasons}
              link={item.link}
              severity={item.severity}
            />
          ))}
        </div>
      )}

      {/* Active Threads */}
      {activeThreads.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Open loops</p>
            <Link href="/continuity/threads">
              <span className="text-xs text-slate-400 hover:text-slate-500 cursor-pointer flex items-center gap-1">
                See all <ChevronRight className="h-3 w-3" />
              </span>
            </Link>
          </div>
          <div className="space-y-2">
            {activeThreads.slice(0, 5).map(thread => (
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
                compact
              />
            ))}
          </div>
        </div>
      )}

      {/* People */}
      {peopleNeedingFollowUp.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">People</p>
          <div className="flex gap-3 mobile-scroll-x pb-1 -mx-1 px-1">
            {peopleNeedingFollowUp.map(person => (
              <RelationshipCard
                key={person.id}
                person={person}
                daysSince={person.days_since}
                compact
              />
            ))}
          </div>
        </div>
      )}

      {/* Clear state */}
      {activeThreads.length === 0 && surfacedItems.length === 0 && (
        <div className="text-center py-12">
          <CheckCircle2 className="h-6 w-6 text-emerald-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">All clear. Nothing needs your attention right now.</p>
          <Link href="/capture">
            <Button variant="ghost" size="sm" className="mt-3 text-xs text-slate-400">
              Capture a thought
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}

function getTimeOfDay(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}
