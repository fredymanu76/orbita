interface RetentionBarProps {
  value: number
  size?: 'sm' | 'md'
  showLabel?: boolean
}

export function RetentionBar({ value, size = 'sm', showLabel = false }: RetentionBarProps) {
  const pct = Math.round(value * 100)
  const color = value > 0.6 ? '#10b981' : value > 0.3 ? '#f59e0b' : '#ef4444'
  const h = size === 'sm' ? 'h-1' : 'h-1.5'
  const w = size === 'sm' ? 'w-12' : 'w-20'

  return (
    <div className="flex items-center gap-2">
      <div className={`${w} bg-slate-100 rounded-full ${h}`}>
        <div
          className={`${h} rounded-full transition-all`}
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {showLabel && (
        <span className="text-[10px] text-slate-400">{pct}%</span>
      )}
    </div>
  )
}
