'use client'

import { useState } from 'react'
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

// --- Stabilization trend arrow ---
function stabilizationTrendArrow(trend: 'improving' | 'stable' | 'declining'): string {
  switch (trend) {
    case 'improving': return '\u2197'
    case 'declining': return '\u2198'
    case 'stable': return '\u2192'
  }
}

// --- Stability bar segment ---
function StabilitySegment({ count, total, color }: { count: number; total: number; color: string }) {
  if (count === 0 || total === 0) return null
  const width = Math.max(4, Math.round((count / total) * 100))
  return <div className={`h-2 rounded-full ${color}`} style={{ width: `${width}%` }} />
}

// --- Recovery banner color ---
function recoveryBannerClasses(mode: 'overloaded' | 'depleted' | 'fatigued'): string {
  switch (mode) {
    case 'overloaded': return 'bg-red-50 border-red-200 text-red-700'
    case 'depleted': return 'bg-violet-50 border-violet-200 text-violet-700'
    case 'fatigued': return 'bg-slate-50 border-slate-200 text-slate-600'
  }
}

// ============================================================
// Main Component
// ============================================================

interface MorningBriefingProps {
  synthesis: MorningSynthesis
}

export function MorningBriefing({ synthesis }: MorningBriefingProps) {
  const { dataCompleteness, recoveryIntelligence } = synthesis

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

  const suppressed = new Set(recoveryIntelligence?.suppressedSections ?? [])

  // --- Max 3 visible signal sections (slots) ---
  // Priority: FocusCard (1), PressureSignals (2), StabilizationScore/EmotionalTrajectory/IdentitySnapshot (3)
  const slots: React.ReactNode[] = []

  // Slot 1: FocusCard
  if (synthesis.focusRecommendation) {
    slots.push(<FocusCard key="focus" recommendation={synthesis.focusRecommendation} />)
  }

  // Slot 2: PressureSignals (only if not suppressed)
  if (synthesis.pressureSignals && !suppressed.has('pressureSignals')) {
    slots.push(<PressureSignalsSection key="pressure" signals={synthesis.pressureSignals} />)
  }

  // Slot 3: First available of stabilization, emotional, identity
  if (slots.length < 3 && synthesis.stabilizationScore) {
    slots.push(<StabilizationBar key="stabilization" score={synthesis.stabilizationScore} />)
  }
  if (slots.length < 3 && synthesis.emotionalTrajectory.readingCount > 0) {
    slots.push(<EmotionalTrajectoryBar key="emotional" trajectory={synthesis.emotionalTrajectory} />)
  }

  // Cap to 3
  const visibleSlots = slots.slice(0, 3)

  // --- Collapsible detail sections (below open loops) ---
  const detailSections: React.ReactNode[] = []

  if (synthesis.relationalPressure.people.length > 0) {
    detailSections.push(
      <RelationalPressureRow key="relational" pressure={synthesis.relationalPressure} />
    )
  }

  if (!suppressed.has('threadStability')) {
    const total = synthesis.threadStability.stable.length + synthesis.threadStability.slipping.length + synthesis.threadStability.critical.length
    if (total > 0) {
      detailSections.push(<ThreadStabilityBar key="threads" stability={synthesis.threadStability} />)
    }
  }

  if (synthesis.identitySnapshot && !suppressed.has('identitySnapshot')) {
    detailSections.push(<IdentitySnapshotBar key="identity" snapshot={synthesis.identitySnapshot} />)
  }

  // Add emotional trajectory to details if it wasn't shown in slots
  if (!visibleSlots.some(s => s !== null && typeof s === 'object' && 'key' in s && (s as React.ReactElement).key === 'emotional') && synthesis.emotionalTrajectory.readingCount > 0) {
    detailSections.push(<EmotionalTrajectoryBar key="emotional-detail" trajectory={synthesis.emotionalTrajectory} />)
  }

  // Add stabilization to details if it wasn't shown in slots
  if (!visibleSlots.some(s => s !== null && typeof s === 'object' && 'key' in s && (s as React.ReactElement).key === 'stabilization') && synthesis.stabilizationScore) {
    detailSections.push(<StabilizationBar key="stabilization-detail" score={synthesis.stabilizationScore} />)
  }

  return (
    <div className="space-y-6">
      {/* Recovery banner — always shown if active, doesn't count toward 3 */}
      {recoveryIntelligence?.isActive && (
        <RecoveryBanner recovery={recoveryIntelligence} />
      )}

      {/* Cognitive state card with inline stabilization */}
      <CognitiveStateCard
        narrative={synthesis.cognitiveNarrative}
        stabilization={synthesis.stabilizationScore}
      />

      {/* Cognitive observation — always shown if not null, doesn't count toward 3 */}
      {synthesis.cognitiveObservation && (
        <CognitiveObservationBlock observation={synthesis.cognitiveObservation} />
      )}

      {/* Max 3 signal sections */}
      {visibleSlots}

      {/* Collapsible detail sections */}
      {detailSections.length > 0 && (
        <DetailSection>{detailSections}</DetailSection>
      )}
    </div>
  )
}

// ============================================================
// RecoveryBanner
// ============================================================

function RecoveryBanner({ recovery }: { recovery: NonNullable<MorningSynthesis['recoveryIntelligence']> }) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${recoveryBannerClasses(recovery.mode)}`}>
      {recovery.instruction}
    </div>
  )
}

// ============================================================
// CognitiveStateCard (with inline stabilization)
// ============================================================

function CognitiveStateCard({
  narrative,
  stabilization,
}: {
  narrative: MorningSynthesis['cognitiveNarrative']
  stabilization: MorningSynthesis['stabilizationScore']
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">
        {narrative.headline}
      </h1>
      <p className="text-sm text-slate-500 mt-1">{narrative.subtext}</p>
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        <p className="text-xs text-slate-400">{format(new Date(), 'EEEE, MMMM d')}</p>
        <span className="text-slate-200">|</span>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${loadDotColor(narrative.cognitiveLoadLabel)}`} />
          {narrative.cognitiveLoadLabel} load
        </span>
        {stabilization && (
          <>
            <span className="text-slate-200">|</span>
            <span className="text-xs text-slate-400">
              {stabilization.score}% coherence {stabilizationTrendArrow(stabilization.trend)}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================
// CognitiveObservationBlock
// ============================================================

function CognitiveObservationBlock({ observation }: { observation: string }) {
  return (
    <div className="border-l-2 border-slate-200 pl-3">
      <p className="text-sm text-slate-600 leading-relaxed">{observation}</p>
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
// PressureSignalsSection
// ============================================================

function PressureSignalsSection({ signals }: { signals: NonNullable<MorningSynthesis['pressureSignals']> }) {
  return (
    <div className="rounded-xl bg-slate-50/80 border border-slate-100 px-4 py-3 space-y-2">
      <p className="text-sm text-slate-600">{signals.narrativeLine}</p>
      <div className="space-y-1.5">
        {signals.mentallyLoud.map(item => (
          <div key={item.sourceId} className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            <span className="flex-1">{item.description}</span>
            {item.personName && (
              <span className="text-[10px] bg-slate-100 text-slate-400 rounded-full px-1.5 py-0.5">{item.personName}</span>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">{signals.reassurance}</p>
    </div>
  )
}

// ============================================================
// StabilizationBar
// ============================================================

function StabilizationBar({ score }: { score: NonNullable<MorningSynthesis['stabilizationScore']> }) {
  const barColor = score.score > 75 ? 'bg-emerald-400' : score.score > 50 ? 'bg-amber-400' : score.score > 25 ? 'bg-orange-400' : 'bg-red-400'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${score.score}%` }} />
        </div>
        <span className="text-xs text-slate-400">{stabilizationTrendArrow(score.trend)}</span>
      </div>
      <p className="text-xs text-slate-400">{score.narrativeLine}</p>
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
// IdentitySnapshotBar
// ============================================================

function IdentitySnapshotBar({ snapshot }: { snapshot: NonNullable<MorningSynthesis['identitySnapshot']> }) {
  return (
    <p className="text-xs text-slate-400">{snapshot.narrativeLine}</p>
  )
}

// ============================================================
// DetailSection (collapsible)
// ============================================================

function DetailSection({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-slate-400 hover:text-slate-500 transition-colors"
      >
        {open ? 'Less detail' : 'More detail'}
      </button>
      {open && <div className="mt-3 space-y-4">{children}</div>}
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
