'use client'

import { useState } from 'react'
import { useMemories } from '@/hooks/use-memories'
import { MemoryList } from '@/components/memories/memory-list'
import { SearchBar } from '@/components/memories/search-bar'
import { Button } from '@/components/ui/button'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import {
  Plus,
  Type,
  Mic,
  ImageIcon,
  ListTodo,
  Layers,
} from 'lucide-react'
import Link from 'next/link'
import type { MemoryItem } from '@/lib/types'

const filterTypes = [
  { value: null, label: 'All', icon: Layers },
  { value: 'text', label: 'Text', icon: Type },
  { value: 'voice', label: 'Voice', icon: Mic },
  { value: 'image', label: 'Image', icon: ImageIcon },
  { value: 'task', label: 'Task', icon: ListTodo },
]

const TYPE_CHART_COLORS: Record<string, string> = {
  text: '#94a3b8',
  voice: '#8b5cf6',
  image: '#f59e0b',
  task: '#10b981',
}

const TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  voice: 'Voice',
  image: 'Image',
  task: 'Task',
}

export default function MemoriesPage() {
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [searchResults, setSearchResults] = useState<MemoryItem[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const { memories, total, loading } = useMemories({
    type: typeFilter,
    page,
    limit: 20,
  })

  async function handleSearch(query: string) {
    setIsSearching(true)
    try {
      const res = await fetch('/api/memories/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 20 }),
      })
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      setSearchResults(data.results)
    } catch {
      setSearchResults(null)
    } finally {
      setIsSearching(false)
    }
  }

  function handleClearSearch() {
    setSearchResults(null)
  }

  const displayMemories = searchResults || memories
  const totalPages = Math.ceil(total / 20)

  // Counts per type from ALL memories (not just filtered page)
  const typeCounts: Record<string, number> = {}
  for (const m of memories) {
    typeCounts[m.type] = (typeCounts[m.type] || 0) + 1
  }

  // Build chart data
  const chartData = Object.entries(typeCounts)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => ({
      name: TYPE_LABELS[type] || type,
      value: count,
      fill: TYPE_CHART_COLORS[type] || '#9ca3af',
    }))
    .sort((a, b) => b.value - a.value)

  const mostUsed = chartData[0]
  const leastUsed = chartData[chartData.length - 1]

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Memories</h1>
          <p className="text-sm text-slate-500 mt-1">
            {total} things captured
          </p>
        </div>
        <Link href="/capture">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Capture
          </Button>
        </Link>
      </div>

      {/* Capture method chart */}
      {chartData.length > 0 && !searchResults && (
        <div className="rounded-xl bg-white/80 border border-slate-100 p-5 mb-5">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Capture methods</p>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={130} height={130}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={32}
                  outerRadius={55}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={(value) => [`${value}`, 'memories']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {chartData.map((entry) => {
                const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0
                return (
                  <div key={entry.name} className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.fill }} />
                    <span className="text-xs text-slate-600 w-12">{entry.name}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: entry.fill }}
                      />
                    </div>
                    <span className="text-xs text-slate-400 w-16 text-right">{entry.value} ({pct}%)</span>
                  </div>
                )
              })}
              {chartData.length >= 2 && (
                <div className="pt-2 border-t border-slate-100 flex items-center gap-4 text-[11px] text-slate-400">
                  <span>Most used: <span className="font-medium text-slate-600">{mostUsed?.name}</span></span>
                  <span>Least used: <span className="font-medium text-slate-600">{leastUsed?.name}</span></span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <SearchBar
          onSearch={handleSearch}
          onClear={handleClearSearch}
          isSearching={isSearching}
        />

        {!searchResults && (
          <div className="flex gap-2 flex-wrap">
            {filterTypes.map((filter) => {
              const Icon = filter.icon
              const isActive = typeFilter === filter.value
              return (
                <button
                  key={filter.label}
                  onClick={() => {
                    setTypeFilter(filter.value)
                    setPage(1)
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'bg-white/80 text-slate-500 hover:bg-slate-100 border border-slate-100'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {filter.label}
                  {filter.value && typeCounts[filter.value] ? (
                    <span className={isActive ? 'text-slate-300' : 'text-slate-400'}>
                      {typeCounts[filter.value]}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}

        {searchResults && (
          <p className="text-sm text-slate-500">
            {searchResults.length} semantic matches found
          </p>
        )}

        <MemoryList
          memories={displayMemories}
          loading={loading && !searchResults}
        />

        {!searchResults && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="bg-white/80"
            >
              Previous
            </Button>
            <span className="text-sm text-slate-500">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="bg-white/80"
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
