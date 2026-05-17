'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Brain,
  Handshake,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import Link from 'next/link'
import type { Person, Commitment } from '@/lib/types'

interface MemorySummary {
  id: string
  type: string
  raw_content: string
  summary: string | null
  created_at: string
  importance: number | null
}

export default function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [person, setPerson] = useState<Person | null>(null)
  const [memories, setMemories] = useState<MemorySummary[]>([])
  const [commitments, setCommitments] = useState<Commitment[]>([])
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
      <div className="max-w-2xl mx-auto">
        <div className="h-64 bg-slate-100 rounded-lg animate-pulse" />
      </div>
    )
  }

  const initials = person.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="max-w-2xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Back
      </Button>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-blue-100 text-blue-600 text-lg font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-semibold text-slate-800">{person.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                {person.relationship && (
                  <Badge variant="outline">{person.relationship}</Badge>
                )}
                <span className="text-sm text-slate-400">
                  {person.mention_count} mention{person.mention_count !== 1 ? 's' : ''}
                </span>
              </div>
              {person.context && (
                <p className="text-sm text-slate-500 mt-1">{person.context}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {commitments.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Handshake className="h-4 w-4" />
              Commitments with {person.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {commitments.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                <div className="flex items-center gap-2">
                  {c.direction === 'outgoing' ? (
                    <ArrowUpRight className="h-4 w-4 text-blue-500" />
                  ) : (
                    <ArrowDownLeft className="h-4 w-4 text-green-500" />
                  )}
                  <span>{c.description}</span>
                </div>
                <div className="flex items-center gap-2">
                  {c.due_date && (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(c.due_date), 'MMM d')}
                    </span>
                  )}
                  <Badge variant="outline" className="text-xs">{c.status}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Memories mentioning {person.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {memories.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No memories found.</p>
          ) : (
            <div className="space-y-3">
              {memories.map((memory) => (
                <Link key={memory.id} href={`/memories/${memory.id}`}>
                  <div className="p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                    <p className="text-sm text-slate-700 line-clamp-2">
                      {memory.summary || memory.raw_content}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {formatDistanceToNow(new Date(memory.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <Separator />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
