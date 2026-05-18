'use client'

import { useEffect, useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { QuickCaptureBar } from '@/components/capture/quick-capture-bar'
import {
  Handshake,
  AlertCircle,
  Clock,
  CheckCircle2,
  ChevronRight,
  Timer,
  Info,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import type { Commitment, ContinuityState, Person } from '@/lib/types'

interface DashboardThread {
  id: string
  title: string
  summary: string | null
  thread_type: string
  status: string
  capture_count: number
  commitment_count: number
  last_activity_at: string
  continuity_retention: number
  importance: number
  emotional_valence: number
  people?: { name: string }[]
}

// Deterministic surfacing reason — every item exposes "why am I seeing this?"
interface SurfacedItem {
  id: string
  type: 'commitment_overdue' | 'commitment_due_today' | 'thread_time_sensitive' | 'thread_forgotten_risk' | 'person_neglected'
  title: string
  reasons: string[] // deterministic explainability
  link: string
  severity: 'high' | 'medium' | 'low'
  data_source: string // which table/entity this came from
}

const STATE_META: Record<ContinuityState, { label: string; color: string; bg: string; description: string }> = {
  stable: { label: 'Stable', color: 'text-emerald-600', bg: 'bg-emerald-50', description: 'Your threads are well-maintained' },
  mild_fragmentation: { label: 'Mildly fragmented', color: 'text-blue-600', bg: 'bg-blue-50', description: 'Some threads may need attention' },
  overload_emerging: { label: 'Saturated', color: 'text-amber-600', bg: 'bg-amber-50', description: 'Many active contexts competing for attention' },
  high_discontinuity: { label: 'Drifting', color: 'text-orange-600', bg: 'bg-orange-50', description: 'Several threads are decaying without resolution' },
  critical: { label: 'Overloaded', color: 'text-red-600', bg: 'bg-red-50', description: 'Significant continuity pressure — consider resolving some threads' },
}

const THREAD_TYPE_COLORS: Record<string, string> = {
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

export default function DashboardPage() {
  const [threads, setThreads] = useState<DashboardThread[]>([])
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [continuityState, setContinuityState] = useState<ContinuityState>('stable')
  const [cognitiveLoad, setCognitiveLoad] = useState<number | null>(null)
  const [peopleNeedingFollowUp, setPeopleNeedingFollowUp] = useState<(Person & { days_since: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set())

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
      }
      if (loadRes.ok) {
        const data = await loadRes.json()
        setCognitiveLoad(data.reading?.load_score ?? null)
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
  const stateMeta = STATE_META[continuityState]

  // Build surfaced items with deterministic reasons
  const surfacedItems: SurfacedItem[] = []

  // Overdue commitments
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
          c.person ? `Involves ${c.person.name}` : 'No person linked',
          `Source: commitments table`,
        ],
        link: c.source_memory_id ? `/continuity/threads/${c.source_memory_id}` : '#',
        severity: daysOverdue > 7 ? 'high' : 'medium',
        data_source: 'commitments',
      })
    } else if (c.due_date === todayStr) {
      surfacedItems.push({
        id: `commitment-today-${c.id}`,
        type: 'commitment_due_today',
        title: c.description,
        reasons: [
          `Due today (${format(new Date(), 'MMM d')})`,
          c.person ? `Involves ${c.person.name}` : 'No person linked',
          `Source: commitments table`,
        ],
        link: '#',
        severity: 'medium',
        data_source: 'commitments',
      })
    }
  }

  // Time-sensitive threads
  for (const t of threads) {
    if (t.status === 'time_sensitive') {
      surfacedItems.push({
        id: `thread-ts-${t.id}`,
        type: 'thread_time_sensitive',
        title: t.title,
        reasons: [
          'Contains commitment due within 48 hours',
          `${t.commitment_count} active commitment${t.commitment_count === 1 ? '' : 's'}`,
          `Last activity: ${formatDistanceToNow(new Date(t.last_activity_at), { addSuffix: true })}`,
          `Source: threads table, status = time_sensitive`,
        ],
        link: `/continuity/threads/${t.id}`,
        severity: 'high',
        data_source: 'threads',
      })
    }
    if (t.status === 'forgotten_risk') {
      surfacedItems.push({
        id: `thread-fr-${t.id}`,
        type: 'thread_forgotten_risk',
        title: t.title,
        reasons: [
          `Continuity retention: ${Math.round(t.continuity_retention * 100)}% (below 30% threshold)`,
          `Last activity: ${formatDistanceToNow(new Date(t.last_activity_at), { addSuffix: true })}`,
          `Status transitioned to forgotten_risk by decay engine`,
          `Source: threads table, continuity_retention decay`,
        ],
        link: `/continuity/threads/${t.id}`,
        severity: 'medium',
        data_source: 'threads',
      })
    }
  }

  const activeThreads = threads.filter(t => !['completed', 'paused'].includes(t.status))
  const unresolvedCount = threads.filter(t => ['unresolved', 'forgotten_risk', 'time_sensitive'].includes(t.status)).length

  const toggleReasons = (id: string) => {
    setExpandedReasons(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-8 px-1">
        <div className="space-y-1">
          <div className="h-7 bg-slate-100/60 rounded w-40 animate-pulse" />
          <div className="h-4 bg-slate-50 rounded w-28 animate-pulse" />
        </div>
        <div className="h-12 bg-slate-50 rounded-lg animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-slate-50/60 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 px-1">
      {/* Greeting + state */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Good {getTimeOfDay()}</h1>
        <p className="text-sm text-slate-400 mt-0.5">{today}</p>
      </div>

      {/* Quick capture */}
      <QuickCaptureBar />

      {/* Continuity state — ambient, not numeric */}
      <div className={`rounded-lg px-5 py-4 ${stateMeta.bg} border border-transparent`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-sm font-medium ${stateMeta.color}`}>{stateMeta.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{stateMeta.description}</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            {activeThreads.length > 0 && (
              <span>{activeThreads.length} active {activeThreads.length === 1 ? 'thread' : 'threads'}</span>
            )}
            {unresolvedCount > 0 && (
              <span className="text-amber-500">{unresolvedCount} unresolved</span>
            )}
            {cognitiveLoad !== null && cognitiveLoad > 0.5 && (
              <span className="text-orange-500">Load elevated</span>
            )}
          </div>
        </div>
      </div>

      {/* Surfaced items — with deterministic "why this appeared" */}
      {surfacedItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Needs attention</p>
          {surfacedItems.map(item => {
            const isExpanded = expandedReasons.has(item.id)
            const iconColor = item.severity === 'high' ? 'text-red-400' : item.severity === 'medium' ? 'text-amber-400' : 'text-slate-400'
            const bgColor = item.severity === 'high' ? 'bg-red-50/50' : item.severity === 'medium' ? 'bg-amber-50/50' : 'bg-slate-50/50'

            return (
              <div key={item.id} className={`rounded-lg ${bgColor}`}>
                <div className="flex items-center gap-3 px-4 py-3 text-sm">
                  {item.type === 'thread_time_sensitive' ? (
                    <Timer className={`h-4 w-4 ${iconColor} flex-shrink-0`} />
                  ) : (
                    <AlertCircle className={`h-4 w-4 ${iconColor} flex-shrink-0`} />
                  )}
                  <Link href={item.link} className="flex-1 text-slate-600 hover:text-slate-800 transition-colors">
                    {item.title}
                  </Link>
                  {/* "Why this appeared" toggle */}
                  <button
                    onClick={() => toggleReasons(item.id)}
                    className="text-slate-300 hover:text-slate-500 transition-colors p-1"
                    title="Why am I seeing this?"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* Deterministic explainability — reasons panel */}
                {isExpanded && (
                  <div className="px-4 pb-3 pt-0">
                    <div className="pl-7 border-l-2 border-slate-200 space-y-1">
                      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Why this appeared</p>
                      {item.reasons.map((reason, i) => (
                        <p key={i} className="text-[11px] text-slate-400">{reason}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Active threads — calm, spatial layout */}
      {activeThreads.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Active threads</p>
            <Link href="/continuity/threads">
              <span className="text-xs text-slate-400 hover:text-slate-500 cursor-pointer flex items-center gap-1">
                All threads <ChevronRight className="h-3 w-3" />
              </span>
            </Link>
          </div>
          <div className="space-y-2">
            {activeThreads.slice(0, 5).map(thread => {
              const borderColor = THREAD_TYPE_COLORS[thread.thread_type] || THREAD_TYPE_COLORS.general

              return (
                <Link key={thread.id} href={`/continuity/threads/${thread.id}`}>
                  <div className={`border-l-[3px] ${borderColor} px-4 py-3 rounded-r-lg bg-white hover:bg-slate-50/50 transition-colors cursor-pointer`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <h3 className="text-sm text-slate-700 truncate">{thread.title}</h3>
                        {thread.status !== 'active' && (
                          <Badge variant="outline" className="text-[10px] py-0 border-0 bg-slate-50 text-slate-400">
                            {thread.status.replace('_', ' ')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {/* Person initials */}
                        {thread.people && thread.people.length > 0 && (
                          <div className="flex items-center -space-x-1">
                            {thread.people.slice(0, 2).map((p, i) => (
                              <div
                                key={i}
                                className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-medium text-slate-500 ring-1 ring-white"
                                title={p.name}
                              >
                                {p.name[0]}
                              </div>
                            ))}
                          </div>
                        )}
                        <span className="text-[11px] text-slate-300">
                          {formatDistanceToNow(new Date(thread.last_activity_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    {/* Commitment indicator */}
                    {thread.commitment_count > 0 && (
                      <div className="flex items-center gap-1 mt-1.5 text-[11px] text-slate-400">
                        <Handshake className="h-3 w-3" />
                        {thread.commitment_count} {thread.commitment_count === 1 ? 'commitment' : 'commitments'}
                      </div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* People — ambient follow-up signals with deterministic reasons */}
      {peopleNeedingFollowUp.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">People</p>
          <div className="flex gap-4">
            {peopleNeedingFollowUp.map(person => (
              <Link key={person.id} href={`/people/${person.id}`}>
                <div className="flex flex-col items-center cursor-pointer group" title={`Last mentioned ${person.days_since} days ago`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-transform group-hover:scale-105 ${
                    person.days_since > 14 ? 'bg-red-50 text-red-500' :
                    person.days_since > 7 ? 'bg-amber-50 text-amber-500' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {person.name[0]}
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1.5">{person.name.split(' ')[0]}</span>
                  <span className={`text-[10px] ${
                    person.days_since > 14 ? 'text-red-400' :
                    person.days_since > 7 ? 'text-amber-400' :
                    'text-slate-300'
                  }`}>
                    {person.days_since}d ago
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Clear state */}
      {activeThreads.length === 0 && surfacedItems.length === 0 && (
        <div className="text-center py-12">
          <CheckCircle2 className="h-6 w-6 text-emerald-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Your threads are clear. Continuity is stable.</p>
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
