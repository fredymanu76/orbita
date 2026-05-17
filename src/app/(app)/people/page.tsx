'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Users } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import type { Person } from '@/lib/types'

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchPeople() {
      try {
        const res = await fetch('/api/people')
        if (!res.ok) throw new Error()
        const data = await res.json()
        setPeople(data.people || [])
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchPeople()
  }, [])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">People</h1>
        <p className="text-sm text-slate-500 mt-1">
          People mentioned in your memories
        </p>
      </div>

      {people.length === 0 ? (
        <div className="text-center py-16">
          <Users className="h-12 w-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400">No people detected yet.</p>
          <p className="text-sm text-slate-300 mt-1">
            As you capture conversations and notes, we&apos;ll automatically identify the people in your life.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {people.map((person) => (
            <Link key={person.id} href={`/people/${person.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-blue-100 text-blue-600 text-sm font-medium">
                        {person.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800">{person.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {person.relationship && (
                          <Badge variant="outline" className="text-xs">
                            {person.relationship}
                          </Badge>
                        )}
                        <span className="text-xs text-slate-400">
                          {person.mention_count} mention{person.mention_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {person.last_mentioned_at && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          Last mentioned {formatDistanceToNow(new Date(person.last_mentioned_at), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
