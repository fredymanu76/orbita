'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { QuickCaptureBar } from '@/components/capture/quick-capture-bar'
import {
  Sun,
  Handshake,
  ListTodo,
  ArrowRight,
  Calendar,
  AlertCircle,
  ArrowUpRight,
  ArrowDownLeft,
  HeartPulse,
  Activity,
  GitBranch,
  X,
  RotateCcw,
} from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'
import type { Commitment, Task, InterruptedThread, ContinuityState } from '@/lib/types'

const STATE_COLORS: Record<ContinuityState, { bg: string; text: string; label: string }> = {
  stable: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Stable' },
  mild_fragmentation: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Mild fragmentation' },
  overload_emerging: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Overload emerging' },
  high_discontinuity: { bg: 'bg-orange-50', text: 'text-orange-600', label: 'High discontinuity' },
  critical: { bg: 'bg-red-50', text: 'text-red-600', label: 'Critical' },
}

const STATE_ARC_COLORS: Record<ContinuityState, string> = {
  stable: '#10b981',
  mild_fragmentation: '#3b82f6',
  overload_emerging: '#f59e0b',
  high_discontinuity: '#f97316',
  critical: '#ef4444',
}

export default function DashboardPage() {
  const [brief, setBrief] = useState<string | null>(null)
  const [briefLoading, setBriefLoading] = useState(true)
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [continuityScore, setContinuityScore] = useState<number | null>(null)
  const [continuityState, setContinuityState] = useState<ContinuityState>('stable')
  const [cognitiveLoad, setCognitiveLoad] = useState<number | null>(null)
  const [threads, setThreads] = useState<(InterruptedThread & { decay_adjusted_score: number })[]>([])

  useEffect(() => {
    async function fetchBrief() {
      try {
        const res = await fetch('/api/daily-brief')
        if (res.ok) {
          const data = await res.json()
          setBrief(data.brief)
        }
      } catch {
        // Silently fail
      } finally {
        setBriefLoading(false)
      }
    }

    async function fetchData() {
      try {
        const [commitmentsRes, tasksRes] = await Promise.all([
          fetch('/api/commitments?status=active'),
          fetch('/api/tasks?status=pending'),
        ])
        const commitmentsData = await commitmentsRes.json()
        const tasksData = await tasksRes.json()
        setCommitments(commitmentsData.commitments || [])
        setTasks(tasksData.tasks || [])
      } catch {
        // Silently fail
      } finally {
        setDataLoading(false)
      }
    }

    async function fetchContinuity() {
      try {
        const [continuityRes, loadRes, threadsRes] = await Promise.all([
          fetch('/api/continuity'),
          fetch('/api/cognitive-load'),
          fetch('/api/threads'),
        ])
        if (continuityRes.ok) {
          const data = await continuityRes.json()
          setContinuityScore(data.score)
          setContinuityState(data.state)
        }
        if (loadRes.ok) {
          const data = await loadRes.json()
          setCognitiveLoad(data.reading?.load_score ?? null)
        }
        if (threadsRes.ok) {
          const data = await threadsRes.json()
          setThreads((data.threads || []).slice(0, 3))
        }
      } catch {
        // Silently fail
      }
    }

    fetchBrief()
    fetchData()
    fetchContinuity()
  }, [])

  const today = format(new Date(), 'EEEE, MMMM d')
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const dueToday = commitments.filter(c => c.due_date === todayStr)
  const overdue = commitments.filter(c => c.due_date && c.due_date < todayStr)
  const urgentTasks = tasks.filter(t => t.priority === 'urgent' || t.priority === 'high').slice(0, 5)

  async function handleThreadAction(threadId: string, status: 'resolved' | 'dismissed') {
    try {
      await fetch(`/api/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setThreads(prev => prev.filter(t => t.id !== threadId))
    } catch {
      // Silently fail
    }
  }

  const stateStyle = STATE_COLORS[continuityState]
  const arcColor = STATE_ARC_COLORS[continuityState]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Good {getTimeOfDay()}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{today}</p>
      </div>

      {/* Quick capture */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <QuickCaptureBar />
        </CardContent>
      </Card>

      {/* Continuity Health + Cognitive Load */}
      {continuityScore !== null && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Continuity Health */}
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-4">
                <div className="relative w-16 h-16 flex-shrink-0">
                  <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="#e2e8f0"
                      strokeWidth="3"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke={arcColor}
                      strokeWidth="3"
                      strokeDasharray={`${continuityScore}, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-semibold text-slate-700">{Math.round(continuityScore)}</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <HeartPulse className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700">Continuity Health</span>
                  </div>
                  <Badge variant="outline" className={`mt-1 text-xs ${stateStyle.bg} ${stateStyle.text}`}>
                    {stateStyle.label}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cognitive Load */}
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">Cognitive Load</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3">
                <div
                  className="h-3 rounded-full transition-all duration-500"
                  style={{
                    width: `${(cognitiveLoad ?? 0) * 100}%`,
                    background: cognitiveLoad !== null
                      ? cognitiveLoad > 0.7
                        ? '#ef4444'
                        : cognitiveLoad > 0.5
                          ? '#f97316'
                          : cognitiveLoad > 0.3
                            ? '#f59e0b'
                            : '#10b981'
                      : '#e2e8f0',
                  }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {cognitiveLoad !== null
                  ? cognitiveLoad > 0.7
                    ? 'High — consider focusing on fewer threads'
                    : cognitiveLoad > 0.5
                      ? 'Elevated — approaching capacity'
                      : cognitiveLoad > 0.3
                        ? 'Moderate — manageable load'
                        : 'Low — capacity available'
                  : 'Measuring...'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Daily Brief */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sun className="h-4 w-4 text-amber-500" />
            Daily Continuity Brief
          </CardTitle>
        </CardHeader>
        <CardContent>
          {briefLoading ? (
            <div className="space-y-2">
              <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
              <div className="h-4 bg-slate-100 rounded animate-pulse w-1/2" />
              <div className="h-4 bg-slate-100 rounded animate-pulse w-2/3" />
            </div>
          ) : brief ? (
            <div className="prose prose-sm prose-slate max-w-none text-sm leading-relaxed">
              {brief.split('\n').map((line, i) => {
                if (line.startsWith('# ')) return <h3 key={i} className="text-base font-semibold mt-3 mb-1">{line.slice(2)}</h3>
                if (line.startsWith('## ')) return <h4 key={i} className="text-sm font-semibold mt-2 mb-1">{line.slice(3)}</h4>
                if (line.startsWith('- ')) return <li key={i} className="ml-4 text-slate-600">{line.slice(2)}</li>
                if (line.trim() === '') return <br key={i} />
                return <p key={i} className="text-slate-600 mb-1">{line}</p>
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Start capturing memories to receive your daily brief.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Interrupted Threads */}
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
              <div key={thread.id} className="flex items-start gap-2 p-2.5 rounded bg-violet-50/50 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-700 font-medium truncate">{thread.title}</p>
                  {thread.thread_summary && (
                    <p className="text-slate-500 text-xs mt-0.5 line-clamp-2">{thread.thread_summary}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">
                    Retention: {Math.round(thread.continuity_retention * 100)}%
                  </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleThreadAction(thread.id, 'resolved')}
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-emerald-600 transition-colors"
                    title="Mark resolved"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleThreadAction(thread.id, 'dismissed')}
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-red-500 transition-colors"
                    title="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <div className="pt-1">
              <Link href="/continuity">
                <Button variant="ghost" size="sm" className="text-xs text-slate-400">
                  View continuity details
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overdue / Due Today */}
      {(overdue.length > 0 || dueToday.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Handshake className="h-4 w-4 text-blue-500" />
              Commitments
              {overdue.length > 0 && (
                <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-xs">
                  {overdue.length} may need attention
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdue.map(c => (
              <div key={c.id} className="flex items-center gap-2 p-2 rounded bg-red-50/50 text-sm">
                <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                <span className="flex-1 text-slate-700">{c.description}</span>
                {c.due_date && (
                  <span className="text-xs text-red-400">
                    was due {format(new Date(c.due_date), 'MMM d')}
                  </span>
                )}
              </div>
            ))}
            {dueToday.map(c => (
              <div key={c.id} className="flex items-center gap-2 p-2 rounded bg-amber-50/50 text-sm">
                {c.direction === 'outgoing' ? (
                  <ArrowUpRight className="h-4 w-4 text-blue-500 flex-shrink-0" />
                ) : (
                  <ArrowDownLeft className="h-4 w-4 text-green-500 flex-shrink-0" />
                )}
                <span className="flex-1 text-slate-700">{c.description}</span>
                <Badge variant="outline" className="text-xs">due today</Badge>
              </div>
            ))}
            <div className="pt-1">
              <Link href="/commitments">
                <Button variant="ghost" size="sm" className="text-xs text-slate-400">
                  View all commitments
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Priority Tasks */}
      {urgentTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-purple-500" />
              Priority items
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {urgentTasks.map(task => (
              <div key={task.id} className="flex items-center justify-between p-2 rounded bg-slate-50 text-sm">
                <span className="text-slate-700">{task.title}</span>
                <div className="flex items-center gap-2">
                  {task.due_date && (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(task.due_date), 'MMM d')}
                    </span>
                  )}
                  <Badge
                    variant="outline"
                    className={`text-xs ${task.priority === 'urgent' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-orange-50 text-orange-600 border-orange-200'}`}
                  >
                    {task.priority}
                  </Badge>
                </div>
              </div>
            ))}
            <div className="pt-1">
              <Link href="/commitments">
                <Button variant="ghost" size="sm" className="text-xs text-slate-400">
                  View all
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state when nothing is due */}
      {!dataLoading && overdue.length === 0 && dueToday.length === 0 && urgentTasks.length === 0 && threads.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-slate-400 text-sm">
              Nothing pressing today. A good day to capture thoughts and reflect.
            </p>
            <Link href="/capture">
              <Button variant="outline" size="sm" className="mt-3">
                Capture something
              </Button>
            </Link>
          </CardContent>
        </Card>
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
