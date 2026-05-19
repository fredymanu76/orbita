'use client'

interface MorningSectionProps {
  label: string
  children: React.ReactNode
}

export function MorningSection({ label, children }: MorningSectionProps) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">{label}</p>
      <div className="space-y-2">
        {children}
      </div>
    </div>
  )
}
