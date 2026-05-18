import { THREAD_TYPE_COLORS, THREAD_TYPE_LABELS } from '@/lib/colors'
import type { ThreadType } from '@/lib/types'

interface TypeChipProps {
  type: ThreadType | string
}

export function TypeChip({ type }: TypeChipProps) {
  const color = THREAD_TYPE_COLORS[type as ThreadType] || THREAD_TYPE_COLORS.general
  const label = THREAD_TYPE_LABELS[type] || type.replace(/_/g, ' ')

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium ${color.bg} ${color.text}`}>
      {label}
    </span>
  )
}
