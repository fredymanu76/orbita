'use client'

import { MemoryCard } from './memory-card'
import type { MemoryItem } from '@/lib/types'
import { Brain } from 'lucide-react'

export function MemoryList({ memories, loading }: { memories: MemoryItem[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-slate-50/60 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (memories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
          <Brain className="h-8 w-8 text-slate-200" />
        </div>
        <h3 className="text-lg font-medium text-slate-600">No memories yet</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-sm">
          Start capturing your thoughts, conversations, and commitments. They&apos;ll appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {memories.map((memory) => (
        <MemoryCard key={memory.id} memory={memory} />
      ))}
    </div>
  )
}
