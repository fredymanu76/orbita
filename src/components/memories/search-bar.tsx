'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'

interface SearchBarProps {
  onSearch: (query: string) => void
  onClear: () => void
  isSearching: boolean
}

export function SearchBar({ onSearch, onClear, isSearching }: SearchBarProps) {
  const [query, setQuery] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) {
      onSearch(query.trim())
    }
  }

  function handleClear() {
    setQuery('')
    onClear()
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search memories semantically..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
          </button>
        )}
      </div>
      <Button type="submit" disabled={!query.trim() || isSearching} size="sm">
        {isSearching ? 'Searching...' : 'Search'}
      </Button>
    </form>
  )
}
