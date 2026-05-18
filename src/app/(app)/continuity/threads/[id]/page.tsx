'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft,
  GitBranch,
  Handshake,
  Users,
  Clock,
  Check,
  Pause,
  Play,
  Archive,
  Brain,
  MessageSquare,
  Mic,
  Heart,
  AlertTriangle,
  Image,
} from 'lucide-react'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import Link from 'next/link'

interface ThreadDetail {
  id: string
  title: string
  summary: string | null
  thread_type: string
  status: string
  capture_count: number
  commitment_count: number
  entity_count: number
  continuity_retention: number
  importance: number
  emotional_valence: number
  last_activity_at: string
  created_at: string
}

interface ThreadCapture {
  id: string
  memory_id: string
  link_confidence: number
  memory: {
    id: string
    type: string
    raw_content: string
    summary: string | null
    emotional_tone: string | null
    importance: number | null
    event_type: string | null
    created_at: string
  }
}

interface ThreadPerson {
  id: string
  name: string
  relationship: string | null
}

interface ThreadCommitment {
  id: string
  description: string
  status: string
  direction: string
  due_date: string | null
  person_id: string | null
}

const EVENT_ICONS: Record<string, typeof Brain> = {
  thought: Brain,
  voice_note: Mic,
  promise: Handshake,
  image: Image,
  conversation: MessageSquare,
  interruption: AlertTriangle,
  emotional_shift: Heart,
  text: Brain,
}

export default function ThreadDetailPage() {
  const params = useParams()
  const router = useRouter()
  const threadId = params.id as string

  const [thread, setThread] = useState<ThreadDetail | null>(null)
  const [captures, setCaptures] = useState<ThreadCapture[]>([])
  const [people, setPeople] = useState<ThreadPerson[]>([])
  const [commitments, setCommitments] = useState<ThreadCommitment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchThread() {
      try {
        const res = await fetch(`/api/threads/${threadId}`)
        if (res.ok) {
          const data = await res.json()
          const t = data.thread
          setThread(t)
          setCaptures(t?.captures || [])
          setPeople(t?.people || [])
          setCommitments(t?.commitments || [])
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false)
      }
    }
    if (threadId) fetchThread()
  }, [threadId])

  async function handleAction(status: string) {
    try {
      await fetch(`/api/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (thread) setThread({ ...thread, status })
    } catch {
      // Silently fail
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 px-1">
        <div className="h-7 bg-slate-100/60 rounded w-48 animate-pulse" />
        <div className="h-32 bg-slate-50/60 rounded-lg animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-slate-50/60 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!thread) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <p className="text-slate-400">Thread not found</p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 px-1">
      {/* Back + title */}
      <div>
        <button onClick={() => router.back()} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-500 mb-3">
          <ArrowLeft className="h-3 w-3" /> Back
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">{thread.title}</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="outline" className="text-xs py-0 border-0 bg-slate-50 text-slate-500">
                {thread.thread_type}
              </Badge>
              <Badge variant="outline" className={`text-xs py-0 border-0 ${
                thread.status === 'active' ? 'bg-emerald-50 text-emerald-600' :
                thread.status === 'completed' ? 'bg-slate-50 text-slate-400' :
                thread.status === 'time_sensitive' ? 'bg-amber-50 text-amber-600' :
                thread.status === 'forgotten_risk' ? 'bg-red-50 text-red-500' :
                thread.status === 'unresolved' ? 'bg-orange-50 text-orange-600' :
                'bg-slate-50 text-slate-400'
              }`}>
                {thread.status.replace('_', ' ')}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Thread state indicators — structured, deterministic */}
      <div className="flex items-center gap-6 text-xs text-slate-400">
        <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" /> {thread.capture_count} captures</span>
        {thread.commitment_count > 0 && (
          <span className="flex items-center gap-1"><Handshake className="h-3 w-3" /> {thread.commitment_count} commitments</span>
        )}
        {people.length > 0 && (
          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {people.length} people</span>
        )}
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDistanceToNow(new Date(thread.last_activity_at), { addSuffix: true })}</span>
      </div>

      {/* Retention indicator */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-slate-100 rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full transition-all duration-500"
            style={{
              width: `${thread.continuity_retention * 100}%`,
              backgroundColor: thread.continuity_retention > 0.6 ? '#10b981'
                : thread.continuity_retention > 0.3 ? '#f59e0b' : '#ef4444',
            }}
          />
        </div>
        <span className="text-xs text-slate-400">{Math.round(thread.continuity_retention * 100)}% retained</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {thread.status !== 'completed' && (
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => handleAction('completed')}>
            <Check className="h-3 w-3" /> Resolve
          </Button>
        )}
        {thread.status === 'active' && (
          <Button variant="ghost" size="sm" className="text-xs gap-1 text-slate-400" onClick={() => handleAction('paused')}>
            <Pause className="h-3 w-3" /> Pause
          </Button>
        )}
        {thread.status === 'paused' && (
          <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => handleAction('active')}>
            <Play className="h-3 w-3" /> Resume
          </Button>
        )}
        {!['completed', 'paused'].includes(thread.status) && (
          <Button variant="ghost" size="sm" className="text-xs gap-1 text-slate-400" onClick={() => handleAction('completed')}>
            <Archive className="h-3 w-3" /> Archive
          </Button>
        )}
      </div>

      {/* People involved */}
      {people.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">People</p>
          <div className="flex gap-3">
            {people.map(p => (
                <Link key={p.id} href={`/people/${p.id}`}>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
                    <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center text-xs font-medium text-blue-500">
                      {p.name[0]}
                    </div>
                    <div>
                      <span className="text-sm text-slate-600">{p.name}</span>
                      {p.relationship && (
                        <span className="text-[10px] text-slate-400 block">{p.relationship}</span>
                      )}
                    </div>
                  </div>
                </Link>
            ))}
          </div>
        </div>
      )}

      {/* Commitments */}
      {commitments.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Commitments</p>
          <div className="space-y-2">
            {commitments.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-50 text-sm">
                  <Handshake className={`h-4 w-4 flex-shrink-0 ${
                    c.status === 'active' ? 'text-amber-400' :
                    c.status === 'completed' ? 'text-emerald-400' : 'text-slate-300'
                  }`} />
                  <span className={`flex-1 ${c.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
                    {c.description}
                  </span>
                  <Badge variant="outline" className="text-[10px] py-0 border-0 bg-slate-100 text-slate-400">
                    {c.direction}
                  </Badge>
                  {c.due_date && (
                    <span className="text-xs text-slate-400">{format(new Date(c.due_date), 'MMM d')}</span>
                  )}
                </div>
            ))}
          </div>
        </div>
      )}

      {/* Capture history */}
      <div>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Captures</p>
        <div className="pl-4 border-l border-slate-100 space-y-1">
          {captures.map(tc => {
            const mem = tc.memory
            if (!mem) return null
            const eventType = mem.event_type || mem.type || 'text'
            const Icon = EVENT_ICONS[eventType] || Brain

            return (
              <div key={tc.id} className="flex items-start gap-2.5 py-2 px-2 rounded-md">
                <div className="relative -ml-[21px] mt-1.5">
                  <div className="w-2 h-2 rounded-full bg-slate-200" />
                </div>
                <Icon className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-slate-300" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-600 line-clamp-2">
                    {mem.summary || mem.raw_content.substring(0, 150)}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-300">
                    <span>{format(parseISO(mem.created_at), 'MMM d, h:mm a')}</span>
                    {mem.emotional_tone && mem.emotional_tone !== 'neutral' && (
                      <span>{mem.emotional_tone}</span>
                    )}
                    {tc.link_confidence < 0.9 && (
                      <span className="text-amber-300">moderate confidence</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {captures.length === 0 && (
            <p className="text-sm text-slate-300 py-4 pl-2">No captures linked to this thread yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
