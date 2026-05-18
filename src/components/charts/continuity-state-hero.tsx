'use client'

import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts'
import { CONTINUITY_STATE_META } from '@/lib/colors'
import type { ContinuityState } from '@/lib/types'

interface ContinuityStateHeroProps {
  score: number
  state: ContinuityState
  activeThreads: number
  unresolvedCount: number
  cognitiveLoad: number | null
}

export function ContinuityStateHero({ score, state, activeThreads, unresolvedCount, cognitiveLoad }: ContinuityStateHeroProps) {
  const meta = CONTINUITY_STATE_META[state]
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)))

  const data = [{ value: clampedScore, fill: meta.fill }]

  return (
    <div className={`rounded-xl px-4 py-4 sm:px-6 sm:py-5 ${meta.bg} border border-transparent`}>
      <div className="flex items-center gap-4 sm:gap-6">
        {/* Radial gauge */}
        <div className="flex-shrink-0">
          <div className="relative w-[80px] h-[80px] sm:w-[100px] sm:h-[100px]">
            <RadialBarChart
              width={100}
              height={100}
              cx={50}
              cy={50}
              innerRadius={34}
              outerRadius={46}
              barSize={10}
              data={data}
              startAngle={90}
              endAngle={-270}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
              <RadialBar
                dataKey="value"
                cornerRadius={5}
                background={{ fill: 'rgba(255,255,255,0.5)' }}
              />
            </RadialBarChart>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-lg font-bold ${meta.color}`}>{clampedScore}</span>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${meta.color}`}>{meta.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 sm:mt-3 text-[11px] sm:text-xs text-slate-500">
            {activeThreads > 0 && (
              <span>{activeThreads} open {activeThreads === 1 ? 'loop' : 'loops'}</span>
            )}
            {unresolvedCount > 0 && (
              <span className="text-amber-600 font-medium">{unresolvedCount} need closure</span>
            )}
            {cognitiveLoad !== null && cognitiveLoad > 0.5 && (
              <span className="text-orange-600 font-medium">Feeling full</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
