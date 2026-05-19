'use client'

interface MorningSummaryBarProps {
  activeThreads: number
  unresolvedCount: number
  continuityScore: number
}

export function MorningSummaryBar({ activeThreads, unresolvedCount, continuityScore }: MorningSummaryBarProps) {
  return (
    <div className="flex items-center gap-4 text-xs text-slate-400 py-2 px-3 rounded-lg bg-slate-50/50">
      <span>{activeThreads} open loop{activeThreads !== 1 ? 's' : ''}</span>
      <span className="text-slate-200">|</span>
      {unresolvedCount > 0 && (
        <>
          <span className="text-amber-500">{unresolvedCount} needing attention</span>
          <span className="text-slate-200">|</span>
        </>
      )}
      <span>Continuity: {Math.round(continuityScore)}%</span>
    </div>
  )
}
