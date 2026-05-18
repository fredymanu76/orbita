interface ConfidenceBadgeProps {
  value: number
  max?: number
}

export function ConfidenceBadge({ value, max = 5 }: ConfidenceBadgeProps) {
  const filled = Math.round(value * max)
  return (
    <div className="flex gap-0.5" title={`${Math.round(value * 100)}%`}>
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i < filled ? 'bg-blue-400' : 'bg-slate-200'}`}
        />
      ))}
    </div>
  )
}
