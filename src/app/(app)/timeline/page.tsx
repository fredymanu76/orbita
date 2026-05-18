'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
} from 'lucide-react'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import Link from 'next/link'
import type { MemoryItem } from '@/lib/types'

const EVENT_ICONS: Record<string, { icon: typeof Brain; color: string }> = {
  thought: { icon: Brain, color: 'text-slate-400' },
  voice_note: { icon: Mic, color: 'text-violet-400' },
  promise: { icon: Handshake, color: 'text-emerald-400' },
  image: { icon: Image, color: 'text-amber-400' },
  conversation: { icon: MessageSquare, color: 'text-blue-400' },
  interruption: { icon: AlertTriangle, color: 'text-orange-400' },
  emotional_shift: { icon: Heart, color: 'text-pink-400' },
  text: { icon: Brain, color: 'text-slate-400' },
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

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="h-7 bg-slate-100/60 rounded w-32 animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-slate-50/60 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Timeline</h1>
          <p className="text-sm text-slate-400 mt-0.5">Your continuity stream</p>
        </div>
        {/* View toggle */}
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => setView('threads')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              view === 'threads' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400'
            }`}
          >
            By thread
          </button>
          <button
            onClick={() => setView('chronological')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              view === 'chronological' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400'
            }`}
          >
            Chronological
          </button>
        </div>
      </div>

      {/* Stats — minimal */}
      <div className="flex items-center gap-6 text-xs text-slate-400">
        <span>{events.length} captures</span>
        <span>{dateGroups.length} days</span>
        <span>{events.filter(e => (e.importance ?? 0) >= 7).length} high importance</span>
      </div>

      {/* Thread View */}
      {view === 'threads' && (
        <>
          {threadGroups.length === 0 ? (
            <EmptyTimeline />
          ) : (
            <div className="space-y-6">
              {threadGroups.map(group => (
                <div key={group.thread_id}>
                  <Link href={`/continuity/threads/${group.thread_id}`}>
                    <div className="flex items-center gap-2 mb-2 cursor-pointer group">
                      <GitBranch className="h-3.5 w-3.5 text-slate-300" />
                      <span className="text-sm font-medium text-slate-600 group-hover:text-slate-800 transition-colors">
                        {group.thread_title}
                      </span>
                      <Badge variant="outline" className="text-[10px] py-0 border-0 bg-slate-50 text-slate-400">
                        {group.thread_type}
                      </Badge>
                    </div>
                  </Link>
                  <div className="pl-5 border-l border-slate-100 space-y-1.5">
                    {group.captures.slice(0, 5).map(event => (
                      <CaptureRow key={event.id} event={event} />
                    ))}
                    {group.captures.length > 5 && (
                      <p className="text-[11px] text-slate-300 pl-2">
                        +{group.captures.length - 5} more
                      </p>
                    )}
                  </div>
                </div>
              ))}
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
            <div className="space-y-6">
              {dateGroups.map(group => (
                <div key={group.date}>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 sticky top-0 bg-white/80 backdrop-blur-sm py-1 z-10">
                    {group.label}
                  </p>
                  <div className="pl-5 border-l border-slate-100 space-y-1.5">
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
    <div className="flex items-start gap-2.5 py-2 px-2 rounded-md hover:bg-slate-50/50 transition-colors">
      <div className="relative -ml-[23px] mt-1.5">
        <div className="w-2 h-2 rounded-full bg-slate-200" />
      </div>
      <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${meta.color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-600 line-clamp-2">
          {event.summary || event.raw_content.substring(0, 120)}
        </p>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-300">
          <span>{format(parseISO(event.created_at), 'h:mm a')}</span>
          {event.emotional_tone && event.emotional_tone !== 'neutral' && (
            <span>{event.emotional_tone}</span>
          )}
          {event.importance !== null && event.importance >= 7 && (
            <span className="text-amber-400">important</span>
          )}
          {event.continuity_retention !== undefined && event.continuity_retention < 0.5 && (
            <span className="text-rose-300">fading</span>
          )}
          {showThread && event.primary_thread_id && (
            <span className="text-slate-300">threaded</span>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyTimeline() {
  return (
    <div className="text-center py-12">
      <CalendarClock className="h-6 w-6 text-slate-200 mx-auto mb-3" />
      <p className="text-sm text-slate-400">
        Your timeline will populate as you capture thoughts.
      </p>
    </div>
  )
}
