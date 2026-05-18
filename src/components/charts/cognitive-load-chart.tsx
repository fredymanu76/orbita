'use client'

import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from 'recharts'
import type { CognitiveLoadReading } from '@/lib/types'

interface CognitiveLoadChartProps {
  reading: CognitiveLoadReading | null
}

export function CognitiveLoadChart({ reading }: CognitiveLoadChartProps) {
  if (!reading) {
    return (
      <div className="rounded-xl bg-white/80 border border-slate-100 p-5">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Mental Space</p>
        <div className="h-[200px] flex items-center justify-center text-sm text-slate-300">
          No reading available
        </div>
      </div>
    )
  }

  const data = [
    { axis: 'Open things', value: Math.min(reading.active_contexts / 10, 1) },
    { axis: 'Loose ends', value: Math.min(reading.unresolved_obligations / 10, 1) },
    { axis: 'Emotions', value: reading.emotional_intensity },
    { axis: 'Interruptions', value: reading.interruption_frequency },
    { axis: 'Decisions', value: reading.decision_density },
    { axis: 'Messages', value: reading.communication_burden },
  ]

  return (
    <div className="rounded-xl bg-white/80 border border-slate-100 p-5">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Mental Space</p>
      <p className="text-[11px] text-slate-300 mb-3">
        Score: {Math.round(reading.load_score * 100)}%
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
          />
          <Radar
            dataKey="value"
            stroke="#818cf8"
            fill="#818cf8"
            fillOpacity={0.2}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
