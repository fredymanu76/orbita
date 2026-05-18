'use client'

import { useEffect, useState } from 'react'
import { TimelineActivityChart } from '@/components/charts/timeline-activity-chart'
import { TypeChip } from '@/components/ui/type-chip'
import { THREAD_TYPE_COLORS } from '@/lib/colors'
import {
  CalendarClock,
  MessageSquare,
  Mic,
  Image,
  AlertTriangle,
  Heart,
  Handshake,
  Brain,
  GitBranch,
  Star,
  Layers,
  ChevronRight,
} from 'lucide-react'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import Link from 'next/link'
import type { MemoryItem, ThreadType } from '@/lib/types'

const EVENT_ICONS: Record<string, { icon: typeof Brain; color: string; bg: string }> = {
  thought: { icon: Brain, color: 'text-slate-500', bg: 'bg-slate-100' },
  voice_note: { icon: Mic, color: 'text-violet-500', bg: 'bg-violet-50' },
  promise: { icon: Handshake, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  image: { icon: Image, color: 'text-amber-500', bg: 'bg-amber-50' },
  conversation: { icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-50' },
  interruption: { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-50' },
  emotional_shift: { icon: Heart, color: 'text-pink-500', bg: 'bg-pink-50' },
  text: { icon: Brain, color: 'text-slate-500', bg: 'bg-slate-100' },
  voice: { icon: Mic, color: 'text-violet-500', bg: 'bg-violet-50' },
  task: { icon: Handshake, color: 'text-emerald-500', bg: 'bg-emerald-50' },
}

interface TimelineEvent extends MemoryItem {
  event_type?: string
  continuity_retention?: number
}

interface ThreadGroup {
  thread_id: string
  thread_title: string
  thread_type: string
  captures: TimelineEvent[]
}

type ViewMode = 'threads' | 'chronological'

export default function TimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [threadGroups, setThreadGroups] = useState<ThreadGroup[]>([])
  const [view, setView] = useState<ViewMode>('threads')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchTimeline() {
      try {
        const [memoriesRes, threadsRes] = await Promise.all([
          fetch('/api/memories?limit=50'),
          fetch('/api/threads?include_captures=true'),
        ])

        if (memoriesRes.ok) {
          const data = await memoriesRes.json()
          setEvents(data.memories || [])
        }

        if (threadsRes.ok) {
          const data = await threadsRes.json()
          const groups: ThreadGroup[] = []
          for (const thread of (data.threads || [])) {
            if (thread.captures && thread.captures.length > 0) {
              groups.push({
                thread_id: thread.id,
                thread_title: thread.title,
                thread_type: thread.thread_type,
                captures: thread.captures.map((c: { memory: TimelineEvent }) => c.memory).filter(Boolean),
              })
            }
          }
          setThreadGroups(groups)
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false)
      }
    }
    fetchTimeline()
  }, [])

  // Build activity chart data
  const activityMap = new Map<string, number>()
  for (const event of events) {
    const dateKey = format(parseISO(event.created_at), 'MMM d')
    activityMap.set(dateKey, (activityMap.get(dateKey) || 0) + 1)
  }
  const activityData = Array.from(activityMap.entries())
    .map(([date, count]) => ({ date, count }))
    .reverse()

  // Group chronological events by date
  const dateGroups: { label: string; date: string; items: TimelineEvent[] }[] = []
  const dateMap = new Map<string, TimelineEvent[]>()

  for (const event of events) {
    const dateKey = format(parseISO(event.created_at), 'yyyy-MM-dd')
    if (!dateMap.has(dateKey)) dateMap.set(dateKey, [])
    dateMap.get(dateKey)!.push(event)
  }

  for (const [dateKey, items] of dateMap.entries()) {
    const date = parseISO(dateKey)
    let label = format(date, 'EEEE, MMMM d')
    if (isToday(date)) label = 'Today'
    else if (isYesterday(date)) label = 'Yesterday'
    dateGroups.push({ label, date: dateKey, items })
  }

  const highImportanceCount = events.filter(e => (e.importance ?? 0) >= 7).length

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="h-7 bg-slate-100/60 rounded w-32 animate-pulse" />
        <div className="h-[160px] bg-slate-50/60 rounded-xl animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-slate-50/60 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Activity</h1>
          <p className="text-sm text-slate-400 mt-0.5">Everything you&apos;ve captured, day by day</p>
        </div>
        {/* View toggle */}
        <div className="flex bg-white/80 rounded-lg p-0.5 border border-slate-100">
          <button
            onClick={() => setView('threads')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              view === 'threads' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400'
            }`}
          >
            By topic
          </button>
          <button
            onClick={() => setView('chronological')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              view === 'chronological' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400'
            }`}
          >
            Chronological
          </button>
        </div>
      </div>

      {/* Activity chart */}
      <TimelineActivityChart data={activityData} />

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl bg-white/80 border border-slate-100 p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-500" />
          </div>
          <div className="min-w-0">
            <p className="text-base sm:text-lg font-bold text-slate-700">{events.length}</p>
            <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">Captures</p>
          </div>
        </div>
        <div className="rounded-xl bg-white/80 border border-slate-100 p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <CalendarClock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
          </div>
          <div className="min-w-0">
            <p className="text-base sm:text-lg font-bold text-slate-700">{dateGroups.length}</p>
            <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">Days</p>
          </div>
        </div>
        <div className="rounded-xl bg-white/80 border border-slate-100 p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
            <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
          </div>
          <div className="min-w-0">
            <p className="text-base sm:text-lg font-bold text-slate-700">{highImportanceCount}</p>
            <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">Important</p>
          </div>
        </div>
      </div>

      {/* Thread View */}
      {view === 'threads' && (
        <>
          {threadGroups.length === 0 ? (
            <EmptyTimeline />
          ) : (
            <div className="space-y-4">
              {threadGroups.map(group => {
                const typeColor = THREAD_TYPE_COLORS[group.thread_type as ThreadType] || THREAD_TYPE_COLORS.general
                return (
                  <div key={group.thread_id} className={`rounded-xl bg-white/80 border border-slate-100 overflow-hidden`}>
                    {/* Thread header with color accent */}
                    <Link href={`/continuity/threads/${group.thread_id}`}>
                      <div className={`border-l-[3px] ${typeColor.border} px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/90 transition-colors`}>
                        <div className="flex items-center gap-2.5">
                          <GitBranch className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-sm font-medium text-slate-700">
                            {group.thread_title}
                          </span>
                          <TypeChip type={group.thread_type} />
                          <span className="text-[11px] text-slate-400">{group.captures.length} captures</span>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                      </div>
                    </Link>
                    {/* Captures */}
                    <div className="px-4 pb-3 pt-1 space-y-0.5">
                      {group.captures.slice(0, 4).map(event => (
                        <CaptureRow key={event.id} event={event} />
                      ))}
                      {group.captures.length > 4 && (
                        <Link href={`/continuity/threads/${group.thread_id}`}>
                          <p className="text-[11px] text-indigo-500 hover:text-indigo-600 pl-10 py-1 cursor-pointer">
                            +{group.captures.length - 4} more captures
                          </p>
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Chronological View */}
      {view === 'chronological' && (
        <>
          {dateGroups.length === 0 ? (
            <EmptyTimeline />
          ) : (
            <div className="space-y-4">
              {dateGroups.map(group => (
                <div key={group.date} className="rounded-xl bg-white/80 border border-slate-100 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-50">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                      {group.label}
                    </p>
                  </div>
                  <div className="px-4 py-2 space-y-0.5">
                    {group.items.map(event => (
                      <CaptureRow key={event.id} event={event} showThread />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CaptureRow({ event, showThread }: { event: TimelineEvent; showThread?: boolean }) {
  const eventType = event.event_type || event.type || 'text'
  const meta = EVENT_ICONS[eventType] || EVENT_ICONS['text']
  const Icon = meta.icon

  return (
    <div className="flex items-start gap-3 py-2.5 px-1 rounded-lg hover:bg-slate-50/50 transition-colors">
      <div className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
        <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-600 line-clamp-2">
          {event.summary || event.raw_content.substring(0, 120)}
        </p>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
          <span>{format(parseISO(event.created_at), 'h:mm a')}</span>
          {event.emotional_tone && event.emotional_tone !== 'neutral' && (
            <span className="px-1.5 py-0.5 rounded bg-slate-50 text-slate-500">{event.emotional_tone}</span>
          )}
          {event.importance !== null && event.importance >= 7 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">important</span>
          )}
          {event.continuity_retention !== undefined && event.continuity_retention < 0.5 && (
            <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-500">slipping</span>
          )}
          {showThread && event.primary_thread_id && (
            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500">linked</span>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyTimeline() {
  return (
    <div className="text-center py-12 rounded-xl bg-white/80 border border-slate-100">
      <CalendarClock className="h-6 w-6 text-slate-200 mx-auto mb-3" />
      <p className="text-sm text-slate-400">
        Your activity feed will fill up as you capture thoughts.
      </p>
    </div>
  )
}
