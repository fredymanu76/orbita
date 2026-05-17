'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Mic, Type, ImageIcon, ListTodo, User, Handshake, CheckSquare } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import Link from 'next/link'

interface MemoryDetail {
  id: string
  type: string
  raw_content: string
  summary: string | null
  audio_url: string | null
  image_url: string | null
  emotional_tone: string | null
  importance: number | null
  processed: boolean
  created_at: string
}

const typeIcons: Record<string, typeof Type> = {
  voice: Mic,
  text: Type,
  image: ImageIcon,
  task: ListTodo,
}

export default function MemoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [memory, setMemory] = useState<MemoryDetail | null>(null)
  const [people, setPeople] = useState<{ id: string; name: string; role: string | null }[]>([])
  const [commitments, setCommitments] = useState<{ id: string; description: string; status: string; due_date: string | null }[]>([])
  const [tasks, setTasks] = useState<{ id: string; title: string; status: string; priority: string }[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function fetchMemory() {
      try {
        const res = await fetch(`/api/memories/${id}`)
        if (!res.ok) {
          router.push('/memories')
          return
        }
        const data = await res.json()
        setMemory(data.memory)
        setPeople(data.people || [])
        setCommitments(data.commitments || [])
        setTasks(data.tasks || [])
      } catch {
        router.push('/memories')
      } finally {
        setLoading(false)
      }
    }
    fetchMemory()
  }, [id, router])

  if (loading || !memory) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="h-64 bg-slate-100 rounded-lg animate-pulse" />
      </div>
    )
  }

  const Icon = typeIcons[memory.type] || Type

  return (
    <div className="max-w-2xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Back
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center">
                <Icon className="h-4 w-4 text-slate-500" />
              </div>
              <div>
                <CardTitle className="text-lg">
                  {memory.type.charAt(0).toUpperCase() + memory.type.slice(1)} memory
                </CardTitle>
                <p className="text-xs text-slate-400">
                  {format(new Date(memory.created_at), 'PPp')} ({formatDistanceToNow(new Date(memory.created_at), { addSuffix: true })})
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {memory.emotional_tone && (
                <Badge variant="outline">{memory.emotional_tone}</Badge>
              )}
              {memory.importance && (
                <Badge variant="outline">
                  Importance: {memory.importance}/10
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {memory.summary && (
            <div>
              <h3 className="text-sm font-medium text-slate-500 mb-1">Summary</h3>
              <p className="text-slate-800">{memory.summary}</p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-slate-500 mb-1">Original content</h3>
            <p className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-lg p-4">
              {memory.raw_content}
            </p>
          </div>

          {memory.audio_url && (
            <div>
              <h3 className="text-sm font-medium text-slate-500 mb-1">Audio recording</h3>
              <audio controls src={memory.audio_url} className="w-full" />
            </div>
          )}

          {memory.image_url && (
            <div>
              <h3 className="text-sm font-medium text-slate-500 mb-1">Image</h3>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={memory.image_url} alt="Memory" className="max-h-64 rounded-lg" />
            </div>
          )}

          {people.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium text-slate-500 mb-2 flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  People mentioned
                </h3>
                <div className="flex gap-2 flex-wrap">
                  {people.map((person) => (
                    <Link key={person.id} href={`/people/${person.id}`}>
                      <Badge variant="secondary" className="cursor-pointer">
                        {person.name}
                        {person.role && <span className="text-slate-400 ml-1">({person.role})</span>}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}

          {commitments.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium text-slate-500 mb-2 flex items-center gap-1.5">
                  <Handshake className="h-4 w-4" />
                  Commitments
                </h3>
                <div className="space-y-2">
                  {commitments.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-sm p-2 bg-slate-50 rounded">
                      <span>{c.description}</span>
                      <Badge variant="outline" className="text-xs">{c.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tasks.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium text-slate-500 mb-2 flex items-center gap-1.5">
                  <CheckSquare className="h-4 w-4" />
                  Tasks
                </h3>
                <div className="space-y-2">
                  {tasks.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-sm p-2 bg-slate-50 rounded">
                      <span>{t.title}</span>
                      <div className="flex gap-1">
                        <Badge variant="outline" className="text-xs">{t.priority}</Badge>
                        <Badge variant="outline" className="text-xs">{t.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
