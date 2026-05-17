'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  CalendarClock,
  MessageSquare,
  Mic,
  Image,
  MapPin,
  AlertTriangle,
  Heart,
  Handshake,
  Brain,
} from 'lucide-react'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import type { MemoryItem } from '@/lib/types'

const EVENT_TYPE_META: Record<string, { icon: typeof Brain; color: string; label: string }> = {
  thought: { icon: Brain, color: 'text-blue-500', label: 'Thought' },
  voice_note: { icon: Mic, color: 'text-violet-500', label: 'Voice note' },
  promise: { icon: Handshake, color: 'text-emerald-500', label: 'Commitment' },
  image: { icon: Image, color: 'text-amber-500', label: 'Image' },
  location: { icon: MapPin, color: 'text-rose-500', label: 'Location' },
  conversation: { icon: MessageSquare, color: 'text-cyan-500', label: 'Conversation' },
  interruption: { icon: AlertTriangle, color: 'text-orange-500', label: 'Interruption' },
  emotional_shift: { icon: Heart, color: 'text-pink-500', label: 'Emotional shift' },
  text: { icon: Brain, color: 'text-slate-500', label: 'Note' },
}

interface TimelineEvent extends MemoryItem {
  event_type?: string
  decay_coefficient?: number
  continuity_retention?: number
}

export default function TimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchTimeline() {
      try {
        const res = await fetch('/api/memories?limit=50')
        if (res.ok) {
          const data = await res.json()
          setEvents(data.memories || [])
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false)
      }
    }
    fetchTimeline()
  }, [])

  // Group events by date
  const grouped: { label: string; date: string; items: TimelineEvent[] }[] = []
  const dateMap = new Map<string, TimelineEvent[]>()

  for (const event of events) {
    const dateKey = format(parseISO(event.created_at), 'yyyy-MM-dd')
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, [])
    }
    dateMap.get(dateKey)!.push(event)
  }

  for (const [dateKey, items] of dateMap.entries()) {
    const date = parseISO(dateKey)
    let label = format(date, 'EEEE, MMMM d')
    if (isToday(date)) label = 'Today'
    else if (isYesterday(date)) label = 'Yesterday'
    grouped.push({ label, date: dateKey, items })
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-slate-800">Timeline</h1>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Timeline</h1>
        <p className="text-sm text-slate-500 mt-0.5">Your life stream — chronological continuity events</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-slate-700">{events.length}</p>
            <p className="text-xs text-slate-500">Total events</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-slate-700">{grouped.length}</p>
            <p className="text-xs text-slate-500">Days captured</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-slate-700">
              {events.filter(e => (e.importance ?? 0) >= 7).length}
            </p>
            <p className="text-xs text-slate-500">High importance</p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      {grouped.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <CalendarClock className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              Your timeline will populate as you capture life stream events.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.date}>
              <h2 className="text-sm font-semibold text-slate-600 mb-3 sticky top-0 bg-white py-1 z-10">
                {group.label}
              </h2>
              <div className="relative pl-6 border-l-2 border-slate-100 space-y-3">
                {group.items.map(event => {
                  const eventType = event.event_type || event.type || 'text'
                  const meta = EVENT_TYPE_META[eventType] || EVENT_TYPE_META['text']
                  const Icon = meta.icon

                  return (
                    <div key={event.id} className="relative">
                      {/* Timeline dot */}
                      <div className="absolute -left-[25px] w-3 h-3 rounded-full bg-white border-2 border-slate-200 top-1.5" />

                      <div className="p-3 rounded-lg bg-slate-50/50 hover:bg-slate-50 transition-colors">
                        <div className="flex items-start gap-2">
                          <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${meta.color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-sm text-slate-700 line-clamp-2">
                                {event.summary || event.raw_content.substring(0, 120)}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                              <span>{format(parseISO(event.created_at), 'h:mm a')}</span>
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                                {meta.label}
                              </Badge>
                              {event.emotional_tone && (
                                <span className="text-slate-400">{event.emotional_tone}</span>
                              )}
                              {event.importance !== null && event.importance >= 7 && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-amber-50 text-amber-600 border-amber-200">
                                  important
                                </Badge>
                              )}
                              {event.continuity_retention !== undefined && event.continuity_retention < 0.5 && (
                                <span className="text-red-400">Fading ({Math.round(event.continuity_retention * 100)}%)</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
