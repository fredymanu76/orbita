'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Mic, Type, ImageIcon, ListTodo } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { MemoryItem } from '@/lib/types'
import Link from 'next/link'

const typeIcons = {
  voice: Mic,
  text: Type,
  image: ImageIcon,
  task: ListTodo,
}

const toneColors: Record<string, string> = {
  positive: 'bg-green-50 text-green-700 border-green-200',
  neutral: 'bg-slate-50 text-slate-600 border-slate-200',
  anxious: 'bg-amber-50 text-amber-700 border-amber-200',
  urgent: 'bg-red-50 text-red-700 border-red-200',
  reflective: 'bg-blue-50 text-blue-700 border-blue-200',
}

export function MemoryCard({ memory }: { memory: MemoryItem }) {
  const Icon = typeIcons[memory.type] || Type
  const timeAgo = formatDistanceToNow(new Date(memory.created_at), { addSuffix: true })

  return (
    <Link href={`/memories/${memory.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center">
                <Icon className="h-4 w-4 text-slate-500" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-800 line-clamp-3">
                {memory.summary || memory.raw_content}
              </p>

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-xs text-slate-400">{timeAgo}</span>

                {memory.emotional_tone && (
                  <Badge variant="outline" className={`text-xs ${toneColors[memory.emotional_tone] || ''}`}>
                    {memory.emotional_tone}
                  </Badge>
                )}

                {memory.importance && memory.importance >= 7 && (
                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                    Important
                  </Badge>
                )}

                {!memory.processed && (
                  <Badge variant="outline" className="text-xs">
                    Processing...
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
