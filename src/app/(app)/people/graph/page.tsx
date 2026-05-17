'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Users, ArrowRight, AlertTriangle, Heart, Link2 } from 'lucide-react'
import Link from 'next/link'
import type { Person, RelationshipEdge } from '@/lib/types'

interface RelationshipWithNames extends RelationshipEdge {
  person_a_details?: { name: string }
  person_b_details?: { name: string }
}

export default function PeopleGraphPage() {
  const [relationships, setRelationships] = useState<RelationshipWithNames[]>([])
  const [neglected, setNeglected] = useState<RelationshipEdge[]>([])
  const [emotional, setEmotional] = useState<RelationshipEdge[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [relRes, neglectedRes, emotionalRes, peopleRes] = await Promise.all([
          fetch('/api/relationships'),
          fetch('/api/relationships?view=neglected'),
          fetch('/api/relationships?view=emotional'),
          fetch('/api/people'),
        ])
        if (relRes.ok) {
          const data = await relRes.json()
          setRelationships(data.relationships || [])
        }
        if (neglectedRes.ok) {
          const data = await neglectedRes.json()
          setNeglected(data.relationships || [])
        }
        if (emotionalRes.ok) {
          const data = await emotionalRes.json()
          setEmotional(data.relationships || [])
        }
        if (peopleRes.ok) {
          const data = await peopleRes.json()
          setPeople(data.people || [])
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Build a people lookup
  const peopleLookup: Record<string, Person> = {}
  for (const p of people) {
    peopleLookup[p.id] = p
  }

  function getPersonName(id: string, rel: RelationshipWithNames): string {
    if (id === rel.person_a && rel.person_a_details?.name) return rel.person_a_details.name
    if (id === rel.person_b && rel.person_b_details?.name) return rel.person_b_details.name
    return peopleLookup[id]?.name || 'Unknown'
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-slate-800">Relationship Graph</h1>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Relationship Graph</h1>
          <p className="text-sm text-slate-500 mt-0.5">Continuity across your relationships</p>
        </div>
        <Link href="/people">
          <Button variant="outline" size="sm" className="text-xs">
            People list
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      </div>

      {/* Visual Graph — CSS-based force-directed approximation */}
      {relationships.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Connection Map
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative w-full h-80 bg-slate-50/50 rounded-lg overflow-hidden">
              {/* Render people as nodes in a circular layout */}
              {(() => {
                const uniquePeopleIds = new Set<string>()
                for (const r of relationships) {
                  uniquePeopleIds.add(r.person_a)
                  uniquePeopleIds.add(r.person_b)
                }
                const ids = Array.from(uniquePeopleIds)
                const cx = 50
                const cy = 50
                const radius = 35

                return (
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    {/* Edges */}
                    {relationships.map((rel, i) => {
                      const aIdx = ids.indexOf(rel.person_a)
                      const bIdx = ids.indexOf(rel.person_b)
                      const angleA = (2 * Math.PI * aIdx) / ids.length - Math.PI / 2
                      const angleB = (2 * Math.PI * bIdx) / ids.length - Math.PI / 2
                      const x1 = cx + radius * Math.cos(angleA)
                      const y1 = cy + radius * Math.sin(angleA)
                      const x2 = cx + radius * Math.cos(angleB)
                      const y2 = cy + radius * Math.sin(angleB)
                      const opacity = Math.max(0.15, Math.min(0.8, rel.relationship_strength))
                      const strokeWidth = Math.max(0.2, Math.min(1.2, rel.relationship_strength * 2))

                      return (
                        <line
                          key={i}
                          x1={x1} y1={y1} x2={x2} y2={y2}
                          stroke={rel.emotional_weight > 0.5 ? '#8b5cf6' : '#94a3b8'}
                          strokeWidth={strokeWidth}
                          opacity={opacity}
                        />
                      )
                    })}

                    {/* Nodes */}
                    {ids.map((id, i) => {
                      const angle = (2 * Math.PI * i) / ids.length - Math.PI / 2
                      const x = cx + radius * Math.cos(angle)
                      const y = cy + radius * Math.sin(angle)
                      const person = peopleLookup[id]
                      const name = person?.name || '?'
                      const initial = name.charAt(0).toUpperCase()

                      // Check if neglected
                      const isNeglected = neglected.some(n => n.person_a === id || n.person_b === id)

                      return (
                        <g key={id}>
                          <circle
                            cx={x} cy={y} r={3}
                            fill={isNeglected ? '#f59e0b' : '#3b82f6'}
                            stroke="white"
                            strokeWidth={0.5}
                          />
                          <text
                            x={x}
                            y={y + 5}
                            textAnchor="middle"
                            fontSize={2.2}
                            fill="#475569"
                            fontWeight="500"
                          >
                            {name.length > 10 ? name.substring(0, 10) + '…' : name}
                          </text>
                        </g>
                      )
                    })}
                  </svg>
                )
              })()}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" /> Connected
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> May need reconnection
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-0.5 bg-violet-500 rounded" /> Emotionally weighted
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Neglected Relationships */}
      {neglected.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              May Need Reconnection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {neglected.map(edge => {
              const nameA = peopleLookup[edge.person_a]?.name || 'Unknown'
              const nameB = peopleLookup[edge.person_b]?.name || 'Unknown'
              const daysSince = edge.last_interaction
                ? Math.floor((Date.now() - new Date(edge.last_interaction).getTime()) / (1000 * 60 * 60 * 24))
                : null

              return (
                <div key={edge.id} className="flex items-center justify-between p-3 rounded-lg bg-amber-50/50">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-amber-500" />
                    <span className="text-sm text-slate-700">{nameA} — {nameB}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>Strength: {(edge.relationship_strength * 100).toFixed(0)}%</span>
                    {daysSince !== null && <span>{daysSince}d since last interaction</span>}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Emotionally Important */}
      {emotional.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Heart className="h-4 w-4 text-violet-500" />
              Emotionally Significant
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {emotional.map(edge => {
              const nameA = peopleLookup[edge.person_a]?.name || 'Unknown'
              const nameB = peopleLookup[edge.person_b]?.name || 'Unknown'

              return (
                <div key={edge.id} className="flex items-center justify-between p-3 rounded-lg bg-violet-50/50">
                  <div className="flex items-center gap-2">
                    <Heart className="h-4 w-4 text-violet-400" />
                    <span className="text-sm text-slate-700">{nameA} — {nameB}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>Emotional weight: {(edge.emotional_weight * 100).toFixed(0)}%</span>
                    <span>Interactions: {edge.interaction_frequency}</span>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {relationships.length === 0 && !loading && (
        <Card>
          <CardContent className="py-8 text-center">
            <Users className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              Relationship connections will appear as people co-occur in your life stream.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
