'use client'

import { MemoryCard } from './memory-card'
import type { MemoryItem } from '@/lib/types'
import { Brain } from 'lucide-react'

export function MemoryList({ memories, loading }: { memories: MemoryItem[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (memories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Brain className="h-12 w-12 text-slate-200 mb-4" />
        <h3 className="text-lg font-medium text-slate-600">No memories yet</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-sm">
          Start capturing your thoughts, conversations, and commitments. They&apos;ll appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {memories.map((memory) => (
        <MemoryCard key={memory.id} memory={memory} />
      ))}
    </div>
  )
}
