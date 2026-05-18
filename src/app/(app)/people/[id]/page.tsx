'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { RetentionBar } from '@/components/charts/retention-bar'
import { TypeChip } from '@/components/ui/type-chip'
import {
  ArrowLeft,
  Brain,
  Handshake,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  GitBranch,
  Clock,
  Heart,
} from 'lucide-react'
import { formatDistanceToNow, format, parseISO } from 'date-fns'
import Link from 'next/link'
import type { Person, Commitment } from '@/lib/types'

interface MemorySummary {
  id: string
  type: string
  raw_content: string
  summary: string | null
  created_at: string
  importance: number | null
  emotional_tone: string | null
}

interface PersonThread {
  id: string
  title: string
  thread_type: string
  status: string
  continuity_retention: number
  last_activity_at: string
  commitment_count: number
}

interface EmotionalContext {
  dominant_tone: string | null
  recent_tones: string[]
}

export default function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [person, setPerson] = useState<Person | null>(null)
  const [memories, setMemories] = useState<MemorySummary[]>([])
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [threads, setThreads] = useState<PersonThread[]>([])
  const [emotionalContext, setEmotionalContext] = useState<EmotionalContext>({ dominant_tone: null, recent_tones: [] })
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function fetchPerson() {
      try {
        const res = await fetch(`/api/people/${id}`)
        if (!res.ok) {
          router.push('/people')
          return
        }
        const data = await res.json()
        setPerson(data.person)
        setMemories(data.memories || [])
        setCommitments(data.commitments || [])

        const threadsRes = await fetch(`/api/threads?person_id=${id}`)
        if (threadsRes.ok) {
          const threadsData = await threadsRes.json()
          setThreads(threadsData.threads || [])
        }

        const tones: string[] = (data.memories || [])
          .map((m: MemorySummary) => m.emotional_tone)
          .filter((t: string | null): t is string => t !== null && t !== 'neutral')
        setEmotionalContext({
          dominant_tone: tones.length > 0 ? mode(tones) : null,
          recent_tones: Array.from(new Set(tones.slice(0, 5))),
        })
      } catch {
        router.push('/people')
      } finally {
        setLoading(false)
      }
    }
    fetchPerson()
  }, [id, router])

  if (loading || !person) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 px-1">
        <div className="h-7 bg-slate-100/60 rounded w-48 animate-pulse" />
        <div className="h-32 bg-slate-50/60 rounded-xl animate-pulse" />
      </div>
    )
  }

  const daysSinceContact = person.last_mentioned_at
    ? Math.floor((Date.now() - new Date(person.last_mentioned_at).getTime()) / 86400000)
    : null

  const activeCommitments = commitments.filter(c => c.status === 'active')
  const overdueCommitments = commitments.filter(c => c.status === 'active' && c.due_date && c.due_date < format(new Date(), 'yyyy-MM-dd'))

  function getRecencyBg(days: number | null): string {
    if (days === null) return 'bg-blue-50 text-blue-500'
    if (days > 14) return 'bg-red-50 text-red-500'
    if (days > 7) return 'bg-amber-50 text-amber-500'
    return 'bg-blue-50 text-blue-500'
  }

  function getRecencyRing(days: number | null): string {
    if (days === null) return 'ring-slate-200'
    if (days > 14) return 'ring-red-300'
    if (days > 7) return 'ring-amber-300'
    return 'ring-emerald-300'
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 px-1">
      {/* Back */}
      <button onClick={() => router.back()} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-500">
        <ArrowLeft className="h-3 w-3" /> Back
      </button>

      {/* Person header */}
      <div className="flex items-center gap-4">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-medium ring-2 ${getRecencyRing(daysSinceContact)} ${getRecencyBg(daysSinceContact)}`}>
          {person.name[0]}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">{person.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
            {person.relationship && <span>{person.relationship}</span>}
            <span>{person.mention_count} mentions</span>
            {daysSinceContact !== null && (
              <span className={daysSinceContact > 14 ? 'text-red-400' : daysSinceContact > 7 ? 'text-amber-400' : ''}>
                Last {daysSinceContact}d ago
              </span>
            )}
          </div>
          {person.context && (
            <p className="text-sm text-slate-500 mt-1">{person.context}</p>
          )}
        </div>
      </div>

      {/* Context reconstruction summary */}
      <div className="rounded-xl bg-white/80 border border-slate-100 px-5 py-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" /> {threads.length} open loops</span>
            <span className="flex items-center gap-1"><Handshake className="h-3 w-3" /> {activeCommitments.length} active promises</span>
            {overdueCommitments.length > 0 && (
              <span className="flex items-center gap-1 text-red-400"><Clock className="h-3 w-3" /> {overdueCommitments.length} overdue</span>
            )}
          </div>
          {emotionalContext.dominant_tone && (
            <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {emotionalContext.dominant_tone}</span>
          )}
        </div>
      </div>

      {/* Threads */}
      {threads.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Open loops</p>
          <div className="space-y-2">
            {threads.map(thread => (
              <Link key={thread.id} href={`/continuity/threads/${thread.id}`}>
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/80 hover:bg-white transition-colors cursor-pointer">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <GitBranch className="h-3.5 w-3.5 text-slate-300" />
                    <span className="text-sm text-slate-600 truncate">{thread.title}</span>
                    <TypeChip type={thread.thread_type} />
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge variant="outline" className="text-[10px] py-0 border-0 bg-slate-50 text-slate-400">
                      {({active:'Active',unresolved:'Needs closure',paused:'On hold',completed:'Done',forgotten_risk:'Slipping',emotionally_sensitive:'Sensitive',time_sensitive:'Time-sensitive'} as Record<string,string>)[thread.status] || thread.status.replace(/_/g, ' ')}
                    </Badge>
                    <RetentionBar value={thread.continuity_retention} showLabel />
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
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Promises</p>
          <div className="space-y-1.5">
            {commitments.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/80 text-sm">
                <div className="flex items-center gap-2.5">
                  {c.direction === 'outgoing' ? (
                    <ArrowUpRight className="h-3.5 w-3.5 text-blue-400" />
                  ) : (
                    <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  <span className={c.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-600'}>
                    {c.description}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {c.due_date && (
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(c.due_date), 'MMM d')}
                    </span>
                  )}
                  <Badge variant="outline" className={`text-[10px] py-0 border-0 ${
                    c.status === 'active' ? 'bg-amber-50 text-amber-500' :
                    c.status === 'completed' ? 'bg-emerald-50 text-emerald-500' :
                    'bg-slate-50 text-slate-400'
                  }`}>
                    {c.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Memory timeline */}
      <div>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
          History
        </p>
        {memories.length === 0 ? (
          <p className="text-sm text-slate-300 py-6 text-center">No captures mentioning {person.name}.</p>
        ) : (
          <div className="pl-4 border-l border-slate-100 space-y-1">
            {memories.map(memory => (
              <div key={memory.id} className="flex items-start gap-2.5 py-2 px-2 rounded-lg">
                <div className="relative -ml-[21px] mt-1.5">
                  <div className="w-2 h-2 rounded-full bg-slate-200" />
                </div>
                <Brain className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-slate-300" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-600 line-clamp-2">
                    {memory.summary || memory.raw_content.substring(0, 150)}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-300">
                    <span>{format(parseISO(memory.created_at), 'MMM d, h:mm a')}</span>
                    {memory.emotional_tone && memory.emotional_tone !== 'neutral' && (
                      <span>{memory.emotional_tone}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function mode(arr: string[]): string {
  const counts: Record<string, number> = {}
  for (const v of arr) counts[v] = (counts[v] || 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || arr[0]
}
