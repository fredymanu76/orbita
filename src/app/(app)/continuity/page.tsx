'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  HeartPulse,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  AlertTriangle,
  GitBranch,
  ArrowRight,
  Clock,
  RotateCcw,
} from 'lucide-react'
import Link from 'next/link'
import type { ContinuitySnapshot, ContinuityState, RelationshipEdge, InterruptedThread } from '@/lib/types'

const STATE_COLORS: Record<ContinuityState, { bg: string; text: string; label: string }> = {
  stable: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Stable' },
  mild_fragmentation: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Mild fragmentation' },
  overload_emerging: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Overload emerging' },
  high_discontinuity: { bg: 'bg-orange-50', text: 'text-orange-600', label: 'High discontinuity' },
  critical: { bg: 'bg-red-50', text: 'text-red-600', label: 'Critical' },
}

const PENALTY_LABELS: Record<string, string> = {
  unresolved_commitments: 'Unresolved commitments',
  overdue_obligations: 'Overdue obligations',
  interruption_rate: 'Interrupted threads',
  cognitive_fragmentation: 'Cognitive fragmentation',
  decision_discontinuity: 'Decision discontinuity',
}

const PENALTY_MAX: Record<string, number> = {
  unresolved_commitments: 25,
  overdue_obligations: 25,
  interruption_rate: 20,
  cognitive_fragmentation: 15,
  decision_discontinuity: 15,
}

export default function ContinuityPage() {
  const [score, setScore] = useState<number | null>(null)
  const [state, setState] = useState<ContinuityState>('stable')
  const [penalties, setPenalties] = useState<Record<string, number>>({})
  const [history, setHistory] = useState<ContinuitySnapshot[]>([])
  const [neglected, setNeglected] = useState<RelationshipEdge[]>([])
  const [neglectedNames, setNeglectedNames] = useState<Record<string, { a: string; b: string }>>({})
  const [threads, setThreads] = useState<InterruptedThread[]>([])
  const [cognitiveLoad, setCognitiveLoad] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [continuityRes, neglectedRes, threadsRes, loadRes] = await Promise.all([
          fetch('/api/continuity'),
          fetch('/api/relationships?view=neglected'),
          fetch('/api/threads'),
          fetch('/api/cognitive-load'),
        ])

        if (continuityRes.ok) {
          const data = await continuityRes.json()
          setScore(data.score)
          setState(data.state)
          setPenalties(data.penalties || {})
          setHistory(data.history || [])
        }

        if (neglectedRes.ok) {
          const data = await neglectedRes.json()
          setNeglected(data.relationships || [])
        }

        if (threadsRes.ok) {
          const data = await threadsRes.json()
          setThreads((data.threads || []).slice(0, 5))
        }

        if (loadRes.ok) {
          const data = await loadRes.json()
          setCognitiveLoad(data.reading?.load_score ?? null)
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Compute trend from history
  const trend = (() => {
    if (history.length < 3) return 'stable'
    const recent = history.slice(-3).map(h => h.continuity_score)
    const older = history.slice(0, -3).map(h => h.continuity_score)
    if (older.length === 0) return 'stable'
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length
    if (recentAvg - olderAvg > 5) return 'improving'
    if (olderAvg - recentAvg > 5) return 'declining'
    return 'stable'
  })()

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-slate-800">Continuity</h1>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const stateStyle = STATE_COLORS[state]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Continuity</h1>
        <p className="text-sm text-slate-500 mt-0.5">Your cognitive continuity health over time</p>
      </div>

      {/* Score + State + Trend */}
      <Card>
        <CardContent className="pt-6 pb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20">
                <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none" stroke="#e2e8f0" strokeWidth="2.5"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none" stroke={stateStyle.text.replace('text-', '').includes('emerald') ? '#10b981' : stateStyle.text.replace('text-', '').includes('blue') ? '#3b82f6' : stateStyle.text.replace('text-', '').includes('amber') ? '#f59e0b' : stateStyle.text.replace('text-', '').includes('orange') ? '#f97316' : '#ef4444'}
                    strokeWidth="2.5"
                    strokeDasharray={`${score ?? 0}, 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold text-slate-700">{score !== null ? Math.round(score) : '--'}</span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <HeartPulse className="h-5 w-5 text-slate-400" />
                  <span className="text-lg font-semibold text-slate-700">Continuity Health</span>
                </div>
                <Badge variant="outline" className={`mt-1 ${stateStyle.bg} ${stateStyle.text}`}>
                  {stateStyle.label}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              {trend === 'improving' && <TrendingUp className="h-4 w-4 text-emerald-500" />}
              {trend === 'declining' && <TrendingDown className="h-4 w-4 text-red-500" />}
              {trend === 'stable' && <Minus className="h-4 w-4 text-slate-400" />}
              <span className="capitalize">{trend}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Score History Chart (CSS bars) */}
      {history.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Score History (Last 14 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-24">
              {history.map((snap, i) => {
                const height = `${snap.continuity_score}%`
                const color = snap.continuity_score >= 85 ? 'bg-emerald-400'
                  : snap.continuity_score >= 70 ? 'bg-blue-400'
                  : snap.continuity_score >= 50 ? 'bg-amber-400'
                  : snap.continuity_score >= 30 ? 'bg-orange-400'
                  : 'bg-red-400'
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full relative" style={{ height: '96px' }}>
                      <div
                        className={`absolute bottom-0 w-full rounded-t ${color} transition-all duration-300`}
                        style={{ height }}
                        title={`${snap.snapshot_date}: ${Math.round(snap.continuity_score)}`}
                      />
                    </div>
                    <span className="text-[9px] text-slate-400">
                      {new Date(snap.snapshot_date).getDate()}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Penalty Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Penalty Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(penalties).map(([key, value]) => (
            <div key={key}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">{PENALTY_LABELS[key] || key}</span>
                <span className="text-slate-400">{value.toFixed(1)} / {PENALTY_MAX[key] || 25}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-slate-400 transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (value / (PENALTY_MAX[key] || 25)) * 100)}%`,
                    backgroundColor: value > (PENALTY_MAX[key] || 25) * 0.6 ? '#ef4444' : value > (PENALTY_MAX[key] || 25) * 0.3 ? '#f59e0b' : '#94a3b8',
                  }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Cognitive Load */}
      {cognitiveLoad !== null && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-500" />
              Cognitive Load
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full bg-slate-100 rounded-full h-3 mb-2">
              <div
                className="h-3 rounded-full transition-all duration-500"
                style={{
                  width: `${cognitiveLoad * 100}%`,
                  background: cognitiveLoad > 0.7 ? '#ef4444'
                    : cognitiveLoad > 0.5 ? '#f97316'
                    : cognitiveLoad > 0.3 ? '#f59e0b'
                    : '#10b981',
                }}
              />
            </div>
            <p className="text-xs text-slate-500">
              {cognitiveLoad > 0.7
                ? 'High — you are carrying a significant cognitive burden. Focus on fewer threads.'
                : cognitiveLoad > 0.5
                  ? 'Elevated — approaching your capacity. Consider resolving or pausing some threads.'
                  : cognitiveLoad > 0.3
                    ? 'Moderate — your load is manageable.'
                    : 'Low — you have cognitive capacity available.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Active Threads */}
      {threads.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-violet-500" />
              Interrupted Threads
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {threads.map(thread => (
              <div key={thread.id} className="p-3 rounded-lg bg-violet-50/30">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-slate-700 truncate flex-1">{thread.title}</p>
                  <Badge variant="outline" className="text-[10px]">{thread.status}</Badge>
                </div>
                {thread.thread_summary && (
                  <p className="text-xs text-slate-500 line-clamp-1 mb-1">{thread.thread_summary}</p>
                )}
                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <span>Retention: {Math.round(thread.continuity_retention * 100)}%</span>
                  <span>Score: {(thread.interruption_score * 100).toFixed(0)}%</span>
                  <div className="flex-1" />
                  <div className="w-16 bg-slate-100 rounded-full h-1">
                    <div
                      className="h-1 rounded-full"
                      style={{
                        width: `${thread.continuity_retention * 100}%`,
                        backgroundColor: thread.continuity_retention > 0.6 ? '#10b981'
                          : thread.continuity_retention > 0.3 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
            <div className="pt-1">
              <Link href="/continuity/threads">
                <Button variant="ghost" size="sm" className="text-xs text-slate-400">
                  View all threads
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Relationship Insights */}
      {neglected.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Relationship Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-slate-400 mb-2">People you may want to reconnect with</p>
            {neglected.map(edge => {
              const daysSince = edge.last_interaction
                ? Math.floor((Date.now() - new Date(edge.last_interaction).getTime()) / (1000 * 60 * 60 * 24))
                : null
              return (
                <div key={edge.id} className="flex items-center justify-between p-2 rounded bg-blue-50/50 text-sm">
                  <span className="text-slate-600">
                    Strength: {(edge.relationship_strength * 100).toFixed(0)}%
                  </span>
                  <span className="text-xs text-slate-400">
                    {daysSince !== null ? `${daysSince}d since last interaction` : 'No recent interaction'}
                  </span>
                </div>
              )
            })}
            <div className="pt-1">
              <Link href="/people/graph">
                <Button variant="ghost" size="sm" className="text-xs text-slate-400">
                  View relationship graph
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
