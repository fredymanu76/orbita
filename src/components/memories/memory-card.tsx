'use client'

import { Badge } from '@/components/ui/badge'
import { Mic, Type, ImageIcon, ListTodo } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { MemoryItem } from '@/lib/types'
import Link from 'next/link'

const typeConfig: Record<string, { icon: typeof Type; color: string; border: string; bg: string }> = {
  voice: { icon: Mic, color: 'text-violet-500', border: 'border-l-violet-400', bg: 'bg-violet-50' },
  text: { icon: Type, color: 'text-slate-500', border: 'border-l-slate-300', bg: 'bg-slate-50' },
  image: { icon: ImageIcon, color: 'text-amber-500', border: 'border-l-amber-400', bg: 'bg-amber-50' },
  task: { icon: ListTodo, color: 'text-emerald-500', border: 'border-l-emerald-400', bg: 'bg-emerald-50' },
}

const toneColors: Record<string, string> = {
  positive: 'bg-green-50 text-green-700',
  neutral: 'bg-slate-50 text-slate-600',
  anxious: 'bg-amber-50 text-amber-700',
  urgent: 'bg-red-50 text-red-700',
  reflective: 'bg-blue-50 text-blue-700',
}

export function MemoryCard({ memory }: { memory: MemoryItem }) {
  const config = typeConfig[memory.type] || typeConfig['text']
  const Icon = config.icon
  const timeAgo = formatDistanceToNow(new Date(memory.created_at), { addSuffix: true })

  return (
    <Link href={`/memories/${memory.id}`}>
      <div className={`rounded-xl bg-white/90 hover:bg-white transition-all cursor-pointer border-l-[3px] ${config.border}`}>
        <div className="px-4 py-3.5">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <div className={`h-8 w-8 rounded-lg ${config.bg} flex items-center justify-center`}>
                <Icon className={`h-4 w-4 ${config.color}`} />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-700 line-clamp-3">
                {memory.summary || memory.raw_content}
              </p>

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-xs text-slate-400">{timeAgo}</span>

                {memory.emotional_tone && (
                  <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-medium ${toneColors[memory.emotional_tone] || 'bg-slate-50 text-slate-500'}`}>
                    {memory.emotional_tone}
                  </span>
                )}

                {memory.importance && memory.importance >= 7 && (
                  <span className="inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-purple-50 text-purple-600">
                    Important
                  </span>
                )}

                {!memory.processed && (
                  <Badge variant="outline" className="text-xs">
                    Processing...
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
