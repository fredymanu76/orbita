'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Handshake, Check, Pause, Play } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { THREAD_TYPE_COLORS, THREAD_STATUS_COLORS, THREAD_STATUS_LABELS } from '@/lib/colors'
import { RetentionBar } from '@/components/charts/retention-bar'
import { TypeChip } from '@/components/ui/type-chip'
import { PersonAvatarGroup } from '@/components/ui/person-avatar-group'
import type { ThreadType, ThreadStatus } from '@/lib/types'

interface ThreadCardProps {
  id: string
  title: string
  threadType: ThreadType
  status: ThreadStatus
  captureCount: number
  commitmentCount: number
  lastActivityAt: string
  continuityRetention: number
  people?: { name: string }[]
  compact?: boolean
  onAction?: (threadId: string, status: string) => void
}

export function ThreadCard({
  id,
  title,
  threadType,
  status,
  captureCount,
  commitmentCount,
  lastActivityAt,
  continuityRetention,
  people,
  compact = false,
  onAction,
}: ThreadCardProps) {
  const typeColor = THREAD_TYPE_COLORS[threadType] || THREAD_TYPE_COLORS.general
  const statusColor = THREAD_STATUS_COLORS[status] || THREAD_STATUS_COLORS.active

  return (
    <div className={`border-l-[3px] ${typeColor.border} rounded-r-xl bg-white/90 hover:bg-white transition-colors`}>
      <div className={compact ? 'px-4 py-2.5' : 'px-4 py-3'}>
        <div className="flex items-center justify-between">
          <Link href={`/continuity/threads/${id}`} className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 cursor-pointer group">
              <h3 className="text-sm text-slate-700 truncate group-hover:text-slate-900 transition-colors">
                {title}
              </h3>
              <TypeChip type={threadType} />
            </div>
          </Link>
          <div className="flex items-center gap-2.5 flex-shrink-0">
            {people && people.length > 0 && (
              <PersonAvatarGroup people={people} max={2} />
            )}
            <RetentionBar value={continuityRetention} showLabel />
          </div>
        </div>

        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            {status !== 'active' && (
              <Badge variant="outline" className={`text-[10px] py-0 border-0 ${statusColor.bg} ${statusColor.text}`}>
                {THREAD_STATUS_LABELS[status] || status.replace(/_/g, ' ')}
              </Badge>
            )}
            {commitmentCount > 0 && (
              <span className="flex items-center gap-1">
                <Handshake className="h-3 w-3" /> {commitmentCount}
              </span>
            )}
            <span>{formatDistanceToNow(new Date(lastActivityAt), { addSuffix: true })}</span>
          </div>

          {/* Quick actions */}
          {onAction && !['completed'].includes(status) && (
            <div className="flex gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="text-[11px] h-6 px-2 text-emerald-500 hover:text-emerald-600"
                onClick={(e) => { e.preventDefault(); onAction(id, 'completed') }}
              >
                <Check className="h-3 w-3 mr-0.5" /> Close
              </Button>
              {status === 'active' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[11px] h-6 px-2 text-slate-400 hover:text-slate-500"
                  onClick={(e) => { e.preventDefault(); onAction(id, 'paused') }}
                >
                  <Pause className="h-3 w-3 mr-0.5" /> Pause
                </Button>
              )}
              {status === 'paused' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[11px] h-6 px-2 text-blue-500 hover:text-blue-600"
                  onClick={(e) => { e.preventDefault(); onAction(id, 'active') }}
                >
                  <Play className="h-3 w-3 mr-0.5" /> Resume
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
