'use client'

import { format } from 'date-fns'
import Link from 'next/link'
import type { MorningSynthesis } from '@/lib/types'

// --- Load dot color ---
function loadDotColor(label: MorningSynthesis['cognitiveNarrative']['cognitiveLoadLabel']): string {
  switch (label) {
    case 'low': return 'bg-emerald-400'
    case 'moderate': return 'bg-amber-400'
    case 'elevated': return 'bg-orange-400'
    case 'high': return 'bg-red-400'
  }
}

// --- Pressure ring color ---
function pressureRingColor(pressure: 'high' | 'moderate' | 'low'): string {
  switch (pressure) {
    case 'high': return 'ring-red-400'
    case 'moderate': return 'ring-amber-400'
    case 'low': return 'ring-emerald-400'
  }
}

// --- Trend icon ---
function trendIndicator(trend: MorningSynthesis['emotionalTrajectory']['trend']): string {
  switch (trend) {
    case 'improving': return '\u2197'
    case 'declining': return '\u2198'
    case 'stable': return '\u2192'
    case 'no_data': return '\u2014'
  }
}

// --- Stability bar segment ---
function StabilitySegment({ count, total, color }: { count: number; total: number; color: string }) {
  if (count === 0 || total === 0) return null
  const width = Math.max(4, Math.round((count / total) * 100))
  return <div className={`h-2 rounded-full ${color}`} style={{ width: `${width}%` }} />
}

// ============================================================
// Main Component
// ============================================================

interface MorningBriefingProps {
  synthesis: MorningSynthesis
}

export function MorningBriefing({ synthesis }: MorningBriefingProps) {
  const { dataCompleteness } = synthesis

  // Empty state — new user
  if (dataCompleteness === 'empty') {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">
          Good {getTimeOfDay()}
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">{format(new Date(), 'EEEE, MMMM d')}</p>
        <p className="text-sm text-slate-500 mt-6">
          Capture a few thoughts and Orbita will start building your picture.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <CognitiveStateCard narrative={synthesis.cognitiveNarrative} />

      {synthesis.focusRecommendation && (
        <FocusCard recommendation={synthesis.focusRecommendation} />
      )}

      {synthesis.emotionalTrajectory.readingCount > 0 && (
        <EmotionalTrajectoryBar trajectory={synthesis.emotionalTrajectory} />
      )}

      {synthesis.relationalPressure.people.length > 0 && (
        <RelationalPressureRow pressure={synthesis.relationalPressure} />
      )}

      <ThreadStabilityBar stability={synthesis.threadStability} />
    </div>
  )
}

// ============================================================
// CognitiveStateCard
// ============================================================

function CognitiveStateCard({ narrative }: { narrative: MorningSynthesis['cognitiveNarrative'] }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">
        {narrative.headline}
      </h1>
      <p className="text-sm text-slate-500 mt-1">{narrative.subtext}</p>
      <div className="flex items-center gap-3 mt-2">
        <p className="text-xs text-slate-400">{format(new Date(), 'EEEE, MMMM d')}</p>
        <span className="text-slate-200">|</span>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${loadDotColor(narrative.cognitiveLoadLabel)}`} />
          {narrative.cognitiveLoadLabel} load
        </span>
        <span className="text-slate-200">|</span>
        <span className="text-xs text-slate-400">
          {Math.round(narrative.continuityScore)}% continuity
        </span>
      </div>
    </div>
  )
}

// ============================================================
// FocusCard
// ============================================================

function FocusCard({ recommendation }: { recommendation: NonNullable<MorningSynthesis['focusRecommendation']> }) {
  return (
    <div className="rounded-xl bg-slate-50/80 border border-slate-100 px-4 py-3">
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">Focus on this</p>
      <Link
        href={recommendation.link}
        className="text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
      >
        {recommendation.title}
      </Link>
      <p className="text-xs text-slate-400 mt-0.5">{recommendation.reason}</p>
      {recommendation.personName && (
        <span className="inline-block mt-1.5 text-[10px] bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
          {recommendation.personName}
        </span>
      )}
    </div>
  )
}

// ============================================================
// EmotionalTrajectoryBar
// ============================================================

function EmotionalTrajectoryBar({ trajectory }: { trajectory: MorningSynthesis['emotionalTrajectory'] }) {
  return (
    <div className="flex items-center gap-3 text-xs text-slate-400 py-2 px-3 rounded-lg bg-slate-50/50">
      <span className="text-base leading-none">{trendIndicator(trajectory.trend)}</span>
      <span className="flex-1">{trajectory.narrativeLine}</span>
    </div>
  )
}

// ============================================================
// RelationalPressureRow
// ============================================================

function RelationalPressureRow({ pressure }: { pressure: MorningSynthesis['relationalPressure'] }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-1.5">
        {pressure.people.map(person => (
          <Link
            key={person.personId}
            href={`/people/${person.personId}`}
            className="flex flex-col items-center gap-1 group"
          >
            <div className={`w-9 h-9 rounded-full bg-slate-100 ring-2 ${pressureRingColor(person.pressure)} flex items-center justify-center text-xs font-medium text-slate-500 group-hover:bg-slate-200 transition-colors`}>
              {person.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-[10px] text-slate-400 truncate max-w-[60px]">{person.name.split(' ')[0]}</span>
          </Link>
        ))}
      </div>
      {pressure.narrativeLine && (
        <p className="text-xs text-slate-400">{pressure.narrativeLine}</p>
      )}
    </div>
  )
}

// ============================================================
// ThreadStabilityBar
// ============================================================

function ThreadStabilityBar({ stability }: { stability: MorningSynthesis['threadStability'] }) {
  const total = stability.stable.length + stability.slipping.length + stability.critical.length
  if (total === 0) return null

  return (
    <div>
      <div className="flex gap-0.5 mb-2">
        <StabilitySegment count={stability.stable.length} total={total} color="bg-emerald-400" />
        <StabilitySegment count={stability.slipping.length} total={total} color="bg-amber-400" />
        <StabilitySegment count={stability.critical.length} total={total} color="bg-red-400" />
      </div>
      <p className="text-xs text-slate-400">{stability.narrativeLine}</p>
      {stability.critical.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {stability.critical.map(thread => (
            <Link
              key={thread.id}
              href={`/continuity/threads/${thread.id}`}
              className="text-[11px] text-red-500 hover:text-red-700 underline underline-offset-2 transition-colors"
            >
              {thread.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Utility
// ============================================================

function getTimeOfDay(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}
