'use client'

import { useState } from 'react'
import { useMemories } from '@/hooks/use-memories'
import { MemoryList } from '@/components/memories/memory-list'
import { SearchBar } from '@/components/memories/search-bar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import type { MemoryItem } from '@/lib/types'

const filterTypes = [
  { value: null, label: 'All' },
  { value: 'text', label: 'Text' },
  { value: 'voice', label: 'Voice' },
  { value: 'image', label: 'Image' },
  { value: 'task', label: 'Task' },
]

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

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Memories</h1>
          <p className="text-sm text-slate-500 mt-1">
            {total} memories captured
          </p>
        </div>
        <Link href="/capture">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Capture
          </Button>
        </Link>
      </div>

      <div className="space-y-4">
        <SearchBar
          onSearch={handleSearch}
          onClear={handleClearSearch}
          isSearching={isSearching}
        />

        {!searchResults && (
          <div className="flex gap-2 flex-wrap">
            {filterTypes.map((filter) => (
              <Badge
                key={filter.label}
                variant={typeFilter === filter.value ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => {
                  setTypeFilter(filter.value)
                  setPage(1)
                }}
              >
                {filter.label}
              </Badge>
            ))}
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
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
