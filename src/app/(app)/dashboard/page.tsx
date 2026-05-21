'use client'

import { useEffect, useState, useCallback } from 'react'
import { QuickCaptureBar } from '@/components/capture/quick-capture-bar'
import { ThreadCard } from '@/components/cards/thread-card'
import { RelationshipCard } from '@/components/cards/relationship-card'
import { MorningBriefing } from '@/components/morning/morning-briefing'
import {
  CheckCircle2,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { Commitment, Person, Thread, MorningSynthesis } from '@/lib/types'

export default function DashboardPage() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [peopleNeedingFollowUp, setPeopleNeedingFollowUp] = useState<(Person & { days_since: number })[]>([])
  const [synthesis, setSynthesis] = useState<MorningSynthesis | null>(null)
  const [loading, setLoading] = useState(true)
  const [threadsExpanded, setThreadsExpanded] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [threadsRes, commitmentsRes, morningRes] = await Promise.all([
        fetch('/api/threads?include_people=true'),
        fetch('/api/commitments?status=active'),
        fetch('/api/self-model/morning'),
      ])

      if (threadsRes.ok) {
        const data = await threadsRes.json()
        setThreads((data.threads || []).slice(0, 8))
      }
      if (commitmentsRes.ok) {
        const data = await commitmentsRes.json()
        setCommitments(data.commitments || [])
      }
      if (morningRes.ok) {
        const data = await morningRes.json()
        setSynthesis(data.synthesis || null)

        // Derive people needing follow-up from threads data if relational pressure is empty
        if (!data.synthesis?.relationalPressure?.people?.length) {
          // Fetch people separately only when needed
          const peopleRes = await fetch('/api/people')
          if (peopleRes.ok) {
            const pData = await peopleRes.json()
            const now = new Date()
            const sorted = (pData.people || [])
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
        }
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const activeThreads = threads.filter(t => !['completed', 'paused'].includes(t.status))
  const displayedThreads = threadsExpanded ? activeThreads : activeThreads.slice(0, 3)
  const hasRelationalPressure = (synthesis?.relationalPressure?.people?.length ?? 0) > 0

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 px-1">
        <div className="space-y-1">
          <div className="h-7 bg-slate-100/60 rounded w-64 animate-pulse" />
          <div className="h-4 bg-slate-50 rounded w-28 animate-pulse" />
        </div>
        <div className="h-12 bg-slate-50 rounded-xl animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-slate-50/60 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 px-1">
      {/* Cognitive synthesis */}
      {synthesis ? (
        <MorningBriefing synthesis={synthesis} />
      ) : (
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Good {getTimeOfDay()}</h1>
          <p className="text-sm text-slate-400 mt-0.5">Capture a few thoughts and Orbita will start building your picture.</p>
        </div>
      )}

      {/* Quick capture */}
      <QuickCaptureBar onCapture={fetchData} />

      {/* Open loops — collapsed by default, max 3 shown */}
      {activeThreads.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setThreadsExpanded(!threadsExpanded)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-400 uppercase tracking-wider hover:text-slate-500 transition-colors"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${threadsExpanded ? 'rotate-180' : ''}`} />
              Still in motion ({activeThreads.length})
            </button>
            <Link href="/continuity/threads">
              <span className="text-xs text-slate-400 hover:text-slate-500 cursor-pointer flex items-center gap-1">
                See all <ChevronRight className="h-3 w-3" />
              </span>
            </Link>
          </div>
          <div className="space-y-2">
            {displayedThreads.map(thread => (
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

      {/* People — only if relational pressure section is empty (avoid duplication) */}
      {!hasRelationalPressure && peopleNeedingFollowUp.length > 0 && (
        <div>
          <div className="space-y-2">
            {peopleNeedingFollowUp.slice(0, 3).map(person => (
              <RelationshipCard
                key={person.id}
                person={person}
                daysSince={person.days_since}
                compact
                narrative={buildPersonNarrative(person.name.split(' ')[0], person.days_since, person.mention_count)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Clear state */}
      {activeThreads.length === 0 && !synthesis?.focusRecommendation && (
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

function buildPersonNarrative(firstName: string, daysSince: number, mentionCount: number): string {
  if (daysSince > 14 && mentionCount > 3) {
    return `${firstName} has remained cognitively present despite little recent engagement.`
  }
  if (daysSince > 14) {
    return `It's been a while since ${firstName} came up.`
  }
  if (daysSince > 7 && mentionCount > 5) {
    return `${firstName}-related threads have surfaced repeatedly.`
  }
  if (daysSince > 7) {
    return `${firstName} hasn't come up in over a week.`
  }
  return `${firstName} has been present in recent thinking.`
}

function getTimeOfDay(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}
