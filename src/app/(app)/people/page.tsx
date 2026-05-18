'use client'

import { useEffect, useState } from 'react'
import { RelationshipCard } from '@/components/cards/relationship-card'
import { Users } from 'lucide-react'
import type { Person } from '@/lib/types'

type SortMode = 'mentions' | 'recency' | 'name'

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortMode>('mentions')

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

  const sorted = [...people].sort((a, b) => {
    if (sort === 'mentions') return b.mention_count - a.mention_count
    if (sort === 'recency') {
      const aTime = a.last_mentioned_at ? new Date(a.last_mentioned_at).getTime() : 0
      const bTime = b.last_mentioned_at ? new Date(b.last_mentioned_at).getTime() : 0
      return bTime - aTime
    }
    return a.name.localeCompare(b.name)
  })

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-3">
        <div className="h-7 bg-slate-100/60 rounded w-32 animate-pulse" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-slate-50/60 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">People</h1>
          <p className="text-sm text-slate-500 mt-1">
            People in your life
          </p>
        </div>

        {/* Sort toggle */}
        {people.length > 0 && (
          <div className="flex bg-white/80 rounded-lg p-0.5 border border-slate-100">
            {(['mentions', 'recency', 'name'] as SortMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setSort(mode)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors capitalize ${
                  sort === mode ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        )}
      </div>

      {people.length === 0 ? (
        <div className="text-center py-16">
          <Users className="h-12 w-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400">No people spotted yet.</p>
          <p className="text-sm text-slate-300 mt-1">
            As you capture conversations and notes, the people you mention will show up here.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sorted.map((person) => (
            <RelationshipCard key={person.id} person={person} />
          ))}
        </div>
      )}
    </div>
  )
}
