import { createAdminClient } from '@/lib/supabase/admin'
import { getEmotionalTrajectory } from '@/lib/cognition/emotional-mapping'
import { getLatestCognitiveLoad } from '@/lib/cognition/cognitive-load'
import { computeInterfaceState, deriveRecoveryIntelligence } from '@/lib/cognition/interface-adaptation'
import type {
  MorningSynthesis,
  UserState,
  ContinuityState,
  UserPattern,
  EmotionalReading,
} from '@/lib/types'

// Lightweight types for Supabase partial selects
interface CommitmentRow {
  id: string
  description: string
  status: string
  due_date: string | null
  direction: string
  importance: number | null
  person_id: string | null
  person: { id: string; name: string }[] | null
  source_memory_id?: string | null
}

interface ThreadRow {
  id: string
  title: string
  status: string
  continuity_retention: number
  last_activity_at: string
  importance: number
  commitment_count: number
  thread_type: string
}

interface FollowUpRow {
  id: string
  description: string
  follow_up_due_at: string | null
  status: string
}

interface ForgottenIntentRow {
  id: string
  intent_description: string
  probability_forgotten: number
  status: string
}

interface UserLifeProfileRow {
  roles: { role: string; confidence: number; evidence_count: number }[]
  active_persona: string | null
  persona_confidence: number
  daily_rhythm?: Record<string, unknown> | null
}

interface StateRow {
  current_state: string
  state_confidence: number
  state_signals: Record<string, unknown>[]
  previous_state: string | null
  state_changed_at: string
}

// --- State-to-headline mapping ---

const STATE_HEADLINES: Record<UserState, string> = {
  overwhelmed: "You're carrying a lot right now.",
  isolated: "It's been quiet lately.",
  drifting: 'Things feel a bit scattered.',
  in_flow: "You're in a good rhythm.",
  recovering: 'Things are settling down.',
  stable: 'Things are steady.',
  stretched: "You've got a full plate.",
}

// Nuanced headlines when state and emotional trajectory contradict
function buildHeadline(
  state: UserState,
  emotionalTrend: string,
  dominantSignal: string,
  loadScore: number,
): string {
  // Positive state but emotional signals declining — acknowledge both
  if ((state === 'in_flow' || state === 'stable') && emotionalTrend === 'declining') {
    if (dominantSignal === 'stress' || dominantSignal === 'frustration') {
      return "You're holding things together, though the emotional load has been rising."
    }
    return "You're maintaining momentum, but strain is beginning to accumulate."
  }

  // Positive state but elevated/high cognitive load
  if ((state === 'in_flow' || state === 'stable') && loadScore >= 0.7) {
    return "You're keeping pace, but the load is heavier than usual."
  }

  // Recovering but improving emotionally
  if (state === 'recovering' && emotionalTrend === 'improving') {
    return 'Things are settling, and the signals are moving in the right direction.'
  }

  // Stretched but emotional trend stable/improving
  if (state === 'stretched' && (emotionalTrend === 'stable' || emotionalTrend === 'improving')) {
    return "There's a lot on, but you're managing the weight."
  }

  return STATE_HEADLINES[state] || STATE_HEADLINES.stable
}

// --- Cognitive load label from score ---

function loadLabel(score: number): 'low' | 'moderate' | 'elevated' | 'high' {
  if (score < 0.3) return 'low'
  if (score < 0.5) return 'moderate'
  if (score < 0.7) return 'elevated'
  return 'high'
}

// --- Build subtext from signals ---

function buildSubtext(
  loadScore: number,
  overdueCount: number,
  continuityScore: number,
  continuityState: ContinuityState,
  activeThreadCount: number,
): string {
  const parts: string[] = []

  const label = loadLabel(loadScore)
  if (label === 'elevated' || label === 'high') {
    parts.push(`Cognitive load ${label}`)
  }

  if (overdueCount > 0) {
    parts.push(`${overdueCount} overdue commitment${overdueCount === 1 ? '' : 's'}`)
  }

  if (continuityState === 'high_discontinuity' || continuityState === 'critical') {
    parts.push(`continuity at ${Math.round(continuityScore)}%`)
  }

  if (parts.length === 0) {
    if (activeThreadCount === 0) return 'Nothing pressing right now.'
    return `${activeThreadCount} active thread${activeThreadCount === 1 ? '' : 's'}, continuity ${Math.round(continuityScore)}%.`
  }

  // Capitalize first letter of joined string
  const joined = parts.join(', ')
  return joined.charAt(0).toUpperCase() + joined.slice(1) + '.'
}

// --- Emotional trajectory narrative ---

function buildEmotionalNarrative(
  trend: string,
  persistence: number,
  dominantSignal: string,
  readingCount: number,
  days: number,
): string {
  if (readingCount === 0) return ''

  const signalLabel = dominantSignal === 'none' ? 'mixed signals' : `${dominantSignal} signals`

  if (persistence > 0.6 && readingCount >= 3) {
    const count = Math.round(persistence * readingCount)
    return `${signalLabel.charAt(0).toUpperCase() + signalLabel.slice(1)} present in ${count} of last ${readingCount} readings over ${days} days.`
  }

  if (trend === 'improving') return 'Emotional signals trending more positive.'
  if (trend === 'declining') return 'Emotional signals trending more negative.'
  return `${readingCount} emotional reading${readingCount === 1 ? '' : 's'} recorded, pattern stable.`
}

// --- Thread stability narrative ---

function buildThreadNarrative(
  stableCount: number,
  slippingCount: number,
  criticalCount: number,
  criticalNames: string[],
): string {
  const total = stableCount + slippingCount + criticalCount
  if (total === 0) return 'No active threads.'

  const parts: string[] = []
  if (criticalCount > 0) {
    parts.push(`${criticalCount} critical${criticalNames.length > 0 ? ` (${criticalNames.slice(0, 2).join(', ')})` : ''}`)
  }
  if (slippingCount > 0) {
    parts.push(`${slippingCount} slipping`)
  }
  if (stableCount > 0) {
    parts.push(`${stableCount} stable`)
  }

  return `${total} active thread${total === 1 ? '' : 's'}: ${parts.join(', ')}.`
}

// --- Relational pressure narrative ---

function buildRelationalNarrative(
  people: MorningSynthesis['relationalPressure']['people'],
  conflictPatterns?: { title: string; description: string; evidence_refs: Record<string, unknown>[]; confidence: number }[],
): string {
  if (people.length === 0 && (!conflictPatterns || conflictPatterns.length === 0)) return ''

  // If there's a high-confidence recurring conflict, surface it
  if (conflictPatterns && conflictPatterns.length > 0) {
    const topConflict = conflictPatterns[0]
    const ref = topConflict.evidence_refs[0] || {}
    const personName = ref.person_name as string | undefined
    const topics = ref.topic_cluster as string[] | undefined
    if (personName && topics && topics.length > 0) {
      return `Tension with ${personName} tends to re-emerge around ${topics.slice(0, 2).join(' and ')}.`
    }
  }

  if (people.length === 0) return ''

  const highCount = people.filter(p => p.pressure === 'high').length
  if (highCount > 0) {
    const names = people.filter(p => p.pressure === 'high').map(p => p.name).slice(0, 2)
    return `${names.join(' and ')} ${highCount === 1 ? 'is' : 'are'} associated with elevated pressure.`
  }

  return `${people.length} relationship${people.length === 1 ? '' : 's'} with moderate attention signals.`
}

// --- Data completeness assessment ---

function assessCompleteness(
  hasState: boolean,
  hasContinuity: boolean,
  hasThreads: boolean,
  hasEmotional: boolean,
  hasPatterns: boolean,
): MorningSynthesis['dataCompleteness'] {
  const signals = [hasState, hasContinuity, hasThreads, hasEmotional, hasPatterns]
  const count = signals.filter(Boolean).length

  if (count === 0) return 'empty'
  if (count <= 2) return 'minimal'
  if (count <= 4) return 'partial'
  return 'full'
}

// --- Cognitive Observation (Step 3) ---

function buildCognitiveObservation(
  overdueCommitments: CommitmentRow[],
  loadScore: number,
  emotionalTrend: string,
  dominantSignal: string,
  patterns: UserPattern[],
  forgottenIntents: ForgottenIntentRow[],
  threads: ThreadRow[],
  state: UserState,
  getPersonFromRow: (c: CommitmentRow) => { id: string; name: string } | null,
  stateChangedAt: string | null,
  recentReadings: EmotionalReading[],
): string | null {
  // Overdue commitment with person + elevated load
  const overdueWithPerson = overdueCommitments.filter(c => getPersonFromRow(c))
  if (overdueWithPerson.length > 0 && loadScore > 0.5) {
    const person = getPersonFromRow(overdueWithPerson[0])!
    return `${person.name} feels mentally louder than the other commitments right now.`
  }

  // Reconciliation check: stale negative state not reinforced recently
  const negativeStates: UserState[] = ['overwhelmed', 'stretched', 'drifting', 'isolated']
  if (negativeStates.includes(state) && stateChangedAt) {
    const hoursSinceStateChange = (Date.now() - new Date(stateChangedAt).getTime()) / 3600000
    if (hoursSinceStateChange > 24) {
      // Check if any reading in the last 12 hours matches the dominant signal
      const twelveHoursAgo = Date.now() - 12 * 3600000
      const recentReinforcement = recentReadings.some(
        r => new Date(r.measured_at).getTime() > twelveHoursAgo && r.emotion === dominantSignal
      )
      if (!recentReinforcement) {
        const signalLabel = dominantSignal !== 'none' ? dominantSignal : 'pressure'
        return `Yesterday's signals suggested elevated ${signalLabel}. Has that pressure eased?`
      }
    }
  }

  // Emotional trend declining + dominant signal
  if (emotionalTrend === 'declining' && dominantSignal !== 'none') {
    return `${dominantSignal.charAt(0).toUpperCase() + dominantSignal.slice(1)} has been the dominant emotional signal recently. The pattern appears to be building.`
  }

  // Avoidance pattern — soft observation, not accusation
  const avoidancePattern = patterns.find(p => {
    const refs = p.evidence_refs || []
    return refs.some((r: Record<string, unknown>) => {
      const score = r.avoidance_signal as number | undefined
      return score !== undefined && score > 0.4
    })
  })
  if (avoidancePattern) {
    const refs = avoidancePattern.evidence_refs || []
    const ref = refs.find((r: Record<string, unknown>) => r.avoidance_signal) as Record<string, unknown> | undefined
    const personName = ref?.person_name as string | undefined
    const deferralCount = ref?.deferral_count as number | undefined
    const description = ref?.item_type === 'commitment' || ref?.item_type === 'follow_up'
      ? avoidancePattern.title.replace('Avoidance cycle: ', '')
      : avoidancePattern.title

    if (deferralCount && deferralCount >= 3 && personName) {
      return `You've returned to "${description}" several times without closing it. ${personName} is connected to this.`
    }
    if (deferralCount && deferralCount >= 3) {
      return `You've returned to "${description}" several times without closing it.`
    }
    const name = personName || description
    return `${name} has remained cognitively present despite little recent engagement.`
  }

  // Forgotten intent with high probability
  const highProbForgotten = forgottenIntents.find(f => f.probability_forgotten > 0.6)
  if (highProbForgotten) {
    return `Something may have slipped off your radar \u2014 ${highProbForgotten.intent_description}.`
  }

  // Many threads + moderate load
  if (threads.length > 5 && loadScore > 0.3) {
    return 'Several threads are running concurrently. The background hum is elevated.'
  }

  // Recovering state
  if (state === 'recovering') {
    return 'Things appear to be settling after a heavier period.'
  }

  return null
}

// --- Pressure Signals (Step 4) ---

function buildPressureSignals(
  overdueCommitments: CommitmentRow[],
  forgottenIntents: ForgottenIntentRow[],
  threads: ThreadRow[],
  criticalThreads: { id: string; title: string }[],
  getPersonFromRow: (c: CommitmentRow) => { id: string; name: string } | null,
): MorningSynthesis['pressureSignals'] {
  const mentallyLoud: NonNullable<MorningSynthesis['pressureSignals']>['mentallyLoud'] = []

  // Overdue commitments with person — relational obligations weigh disproportionately
  for (const c of overdueCommitments) {
    const person = getPersonFromRow(c)
    if (person) {
      const intensity = Math.min(1, (c.importance ?? 5) / 10 + 0.3)
      mentallyLoud.push({
        description: c.description,
        sourceId: c.id,
        personName: person.name,
        intensity,
      })
    }
  }

  // Forgotten intents with probability > 0.5
  for (const f of forgottenIntents) {
    if (f.probability_forgotten > 0.5) {
      mentallyLoud.push({
        description: f.intent_description,
        sourceId: f.id,
        personName: null,
        intensity: f.probability_forgotten,
      })
    }
  }

  // Threads with emotionally_sensitive status
  for (const t of threads) {
    if (t.status === 'emotionally_sensitive') {
      mentallyLoud.push({
        description: t.title,
        sourceId: t.id,
        personName: null,
        intensity: 0.7,
      })
    }
  }

  if (mentallyLoud.length === 0) return null

  // Sort by intensity, cap to 2
  mentallyLoud.sort((a, b) => b.intensity - a.intensity)
  mentallyLoud.splice(2)

  // Reassurance — always present when pressureSignals is not null
  const hasOverdueOver7Days = overdueCommitments.some(c => {
    if (!c.due_date) return false
    const daysOverdue = Math.floor((Date.now() - new Date(c.due_date).getTime()) / 86400000)
    return daysOverdue > 7
  })

  let reassurance: string
  if (criticalThreads.length === 0 && !hasOverdueOver7Days) {
    reassurance = 'Nothing appears critically unstable right now.'
  } else if (hasOverdueOver7Days && criticalThreads.length === 0) {
    reassurance = 'These are present but none appear urgent enough to destabilise.'
  } else {
    reassurance = 'The load is real, but you have been here before and navigated it.'
  }

  // Narrative line — compressed, 1 sentence
  const loudest = mentallyLoud[0]
  const narrativeLine = loudest.personName
    ? `The ${loudest.personName} commitment appears loudest right now.`
    : `${loudest.description} keeps resurfacing.`

  return { mentallyLoud, reassurance, narrativeLine }
}

// --- Recovery Intelligence (Step 5) ---
// Now derived from InterfaceState via deriveRecoveryIntelligence() in interface-adaptation.ts

// --- Identity Snapshot (Step 6) ---

interface DailyRhythmWithTransitions {
  peak_hours?: number[]
  quiet_hours?: number[]
  weekend_pattern?: string | null
  dominant_morning_role?: string | null
  dominant_evening_role?: string | null
  transitions?: { from_role: string; to_role: string; typical_hour: number; frequency: number; emotional_cost: number }[]
}

function buildIdentitySnapshot(
  profile: UserLifeProfileRow | null,
  dailyRhythm?: DailyRhythmWithTransitions | null,
): MorningSynthesis['identitySnapshot'] {
  if (!profile || !profile.roles || profile.roles.length === 0) return null

  const ROLE_LABELS: Record<string, string> = {
    parent: 'parent',
    carer: 'carer',
    worker: 'professional',
    professional: 'professional',
    founder: 'founder',
    faith_community: 'community member',
    student: 'student',
  }

  // Sort by confidence * log2(evidence_count + 1)
  const scored = profile.roles
    .map(r => ({
      ...r,
      score: r.confidence * Math.log2(r.evidence_count + 1),
      label: ROLE_LABELS[r.role] || r.role,
    }))
    .sort((a, b) => b.score - a.score)

  const dominant = scored[0]
  const secondary = scored.length > 1 ? scored[1] : null

  let narrativeLine: string

  // Use transition data if available for richer narrative
  if (dailyRhythm?.dominant_morning_role && dailyRhythm?.dominant_evening_role &&
      dailyRhythm.dominant_morning_role !== dailyRhythm.dominant_evening_role) {
    const morningLabel = ROLE_LABELS[dailyRhythm.dominant_morning_role] || dailyRhythm.dominant_morning_role
    const eveningLabel = ROLE_LABELS[dailyRhythm.dominant_evening_role] || dailyRhythm.dominant_evening_role
    narrativeLine = `The ${morningLabel} part of you is most active in mornings. By mid-morning, the ${eveningLabel} takes over.`
  } else if (dominant.confidence > 0.5) {
    narrativeLine = `The ${dominant.label} part of you appears most active this week.`
    if (secondary && secondary.confidence > 0.3) {
      narrativeLine += ` ${secondary.label.charAt(0).toUpperCase() + secondary.label.slice(1)} also present.`
    }
  } else {
    narrativeLine = 'Your attention appears distributed across roles.'
  }

  // Include transitions if available
  const transitions = dailyRhythm?.transitions?.map(t => ({
    from_role: t.from_role,
    to_role: t.to_role,
    typical_hour: t.typical_hour,
    frequency: t.frequency,
    emotional_cost: t.emotional_cost,
  }))

  return {
    dominantRole: dominant.label,
    secondaryRole: secondary?.label ?? null,
    narrativeLine,
    ...(transitions && transitions.length > 0 ? { transitions } : {}),
  }
}

// --- Stabilization Score (Step 7) ---

function buildStabilizationScore(
  volatility: number,
  overdueCount: number,
  totalActiveCommitments: number,
  highPressurePeopleCount: number,
  loadScore: number,
  continuityState: ContinuityState,
  recentContinuityScores: number[],
): MorningSynthesis['stabilizationScore'] {
  // Each component is 0-1 where 1 = good
  const volatilityComponent = (1 - Math.min(1, volatility)) * 0.25
  const commitmentRatio = totalActiveCommitments > 0 ? overdueCount / totalActiveCommitments : 0
  const commitmentComponent = (1 - Math.min(1, commitmentRatio)) * 0.20
  const relationalComponent = (1 - Math.min(1, highPressurePeopleCount * 0.25)) * 0.15
  const loadComponent = (1 - Math.min(1, loadScore)) * 0.20

  const fragmentationPenalties: Record<string, number> = {
    critical: 0.4,
    high_discontinuity: 0.25,
    overload_emerging: 0.15,
    mild_fragmentation: 0.05,
    stable: 0,
  }
  const penalty = fragmentationPenalties[continuityState] ?? 0
  const fragmentationComponent = (1 - penalty) * 0.20

  const score = Math.round(
    100 * (volatilityComponent + commitmentComponent + relationalComponent + loadComponent + fragmentationComponent)
  )

  // Trend from recent continuity scores
  let trend: 'improving' | 'stable' | 'declining' = 'stable'
  if (recentContinuityScores.length >= 3) {
    const recent = recentContinuityScores.slice(-3)
    const allImproving = recent[1] > recent[0] && recent[2] > recent[1]
    const allDeclining = recent[1] < recent[0] && recent[2] < recent[1]
    if (allImproving) trend = 'improving'
    else if (allDeclining) trend = 'declining'
  }

  let narrativeLine: string
  if (score > 75) {
    narrativeLine = 'Your signals appear coherent.'
  } else if (score > 50) {
    narrativeLine = 'Some fragmentation present, but nothing destabilising.'
  } else if (score > 25) {
    narrativeLine = 'Several signals suggest building strain.'
  } else {
    narrativeLine = 'Your system appears under significant pressure.'
  }

  return { score, trend, narrativeLine }
}

// --- Main synthesis function ---

export async function computeMorningSynthesis(userId: string): Promise<MorningSynthesis> {
  const supabase = createAdminClient()

  // Parallel data fetches — all from existing tables (11 queries)
  const [
    stateRes,
    cogLoadReading,
    continuityRes,
    commitmentsRes,
    threadsRes,
    emotionalResult,
    patternsRes,
    followUpsRes,
    forgottenIntentsRes,
    profileRes,
    conflictPatternsRes,
  ] = await Promise.all([
    supabase
      .from('user_state')
      .select('current_state, state_confidence, state_signals, previous_state, state_changed_at')
      .eq('user_id', userId)
      .single(),
    getLatestCognitiveLoad(userId),
    supabase
      .from('continuity_snapshots')
      .select('continuity_score, state')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: false })
      .limit(5),
    supabase
      .from('commitments')
      .select('id, description, status, due_date, direction, importance, person_id, person:people(id, name)')
      .eq('user_id', userId)
      .eq('status', 'active'),
    supabase
      .from('threads')
      .select('id, title, status, continuity_retention, last_activity_at, importance, commitment_count, thread_type')
      .eq('user_id', userId)
      .not('status', 'in', '("completed","paused")'),
    getEmotionalTrajectory(userId, 7),
    supabase
      .from('user_patterns')
      .select('*')
      .eq('user_id', userId)
      .eq('pattern_type', 'relational_gravity')
      .in('status', ['emerging', 'established', 'confirmed']),
    supabase
      .from('follow_up_candidates')
      .select('id, description, follow_up_due_at, status')
      .eq('user_id', userId)
      .eq('status', 'pending'),
    supabase
      .from('forgotten_intent_predictions')
      .select('id, intent_description, probability_forgotten, status')
      .eq('user_id', userId)
      .in('status', ['predicted', 'surfaced'])
      .gt('probability_forgotten', 0.4)
      .order('probability_forgotten', { ascending: false })
      .limit(5),
    supabase
      .from('user_life_profile')
      .select('roles, active_persona, persona_confidence, daily_rhythm')
      .eq('user_id', userId)
      .single(),
    supabase
      .from('user_patterns')
      .select('title, description, evidence_refs, confidence')
      .eq('user_id', userId)
      .eq('pattern_type', 'relationship_pattern')
      .in('status', ['emerging', 'established', 'confirmed'])
      .order('confidence', { ascending: false })
      .limit(3),
  ])

  const stateData = stateRes.data as StateRow | null
  const state = (stateData?.current_state as UserState) || 'stable'
  const stateConfidence = stateData?.state_confidence ?? 0
  const previousState = (stateData?.previous_state as UserState) || null
  const loadScore = cogLoadReading?.load_score ?? 0
  const continuitySnapshots = (continuityRes.data || []) as { continuity_score: number; state: string }[]
  const latestSnapshot = continuitySnapshots[0] ?? null
  const continuityScore = latestSnapshot?.continuity_score ?? 0
  const continuityState = (latestSnapshot?.state as ContinuityState) || 'stable'
  const commitments = (commitmentsRes.data || []) as unknown as CommitmentRow[]
  const threads = (threadsRes.data || []) as unknown as ThreadRow[]
  const patterns = (patternsRes.data || []) as UserPattern[]
  const followUps = (followUpsRes.data || []) as unknown as FollowUpRow[]
  const forgottenIntents = (forgottenIntentsRes.data || []) as unknown as ForgottenIntentRow[]
  const profile = (profileRes.data as UserLifeProfileRow) || null

  const todayStr = new Date().toISOString().slice(0, 10)
  const now = Date.now()

  // --- Overdue commitments ---
  const overdueCommitments = commitments.filter(c => c.due_date && c.due_date < todayStr)
  const dueTodayCommitments = commitments.filter(c => c.due_date === todayStr)

  // --- Overdue follow-ups ---
  const overdueFollowUps = followUps.filter(f => f.follow_up_due_at && f.follow_up_due_at < new Date().toISOString())

  // --- Thread classification ---
  const stableThreads: MorningSynthesis['threadStability']['stable'] = []
  const slippingThreads: MorningSynthesis['threadStability']['slipping'] = []
  const criticalThreads: MorningSynthesis['threadStability']['critical'] = []

  for (const t of threads) {
    const retention = t.continuity_retention ?? 0
    const daysSinceActivity = Math.floor((now - new Date(t.last_activity_at).getTime()) / 86400000)

    if (retention >= 0.7) {
      stableThreads.push({ id: t.id, title: t.title, retention })
    } else if (retention >= 0.3) {
      slippingThreads.push({ id: t.id, title: t.title, retention, daysSinceActivity })
    } else {
      criticalThreads.push({ id: t.id, title: t.title, retention, commitmentCount: t.commitment_count })
    }
  }

  // Helper: Supabase join returns array for foreign key relations
  function getPersonFromRow(c: CommitmentRow): { id: string; name: string } | null {
    if (Array.isArray(c.person) && c.person.length > 0) return c.person[0]
    return null
  }

  // --- Focus recommendation (priority cascade) ---
  let focusRecommendation: MorningSynthesis['focusRecommendation'] = null

  // 1. Overdue commitment with a person
  const overdueWithPerson = overdueCommitments
    .filter(c => getPersonFromRow(c))
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
  if (overdueWithPerson.length > 0) {
    const c = overdueWithPerson[0]
    const person = getPersonFromRow(c)!
    const daysOverdue = Math.floor((now - new Date(c.due_date!).getTime()) / 86400000)
    focusRecommendation = {
      title: c.description,
      reason: `This is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue and involves ${person.name}, who is counting on you.`,
      sourceType: 'commitment',
      sourceId: c.id,
      link: c.source_memory_id ? `/continuity/threads/${c.source_memory_id}` : '#',
      personName: person.name,
    }
  }

  // 2. Overdue commitment without a person
  if (!focusRecommendation && overdueCommitments.length > 0) {
    const c = overdueCommitments.sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))[0]
    const daysOverdue = Math.floor((now - new Date(c.due_date!).getTime()) / 86400000)
    focusRecommendation = {
      title: c.description,
      reason: `This is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue.`,
      sourceType: 'commitment',
      sourceId: c.id,
      link: c.source_memory_id ? `/continuity/threads/${c.source_memory_id}` : '#',
      personName: null,
    }
  }

  // 3. Time-sensitive thread
  if (!focusRecommendation) {
    const timeSensitive = threads.filter(t => t.status === 'time_sensitive').sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    if (timeSensitive.length > 0) {
      const t = timeSensitive[0]
      focusRecommendation = {
        title: t.title,
        reason: `This thread is time-sensitive with ${t.commitment_count} open commitment${t.commitment_count === 1 ? '' : 's'}.`,
        sourceType: 'thread',
        sourceId: t.id,
        link: `/continuity/threads/${t.id}`,
        personName: null,
      }
    }
  }

  // 4. Commitment due today
  if (!focusRecommendation && dueTodayCommitments.length > 0) {
    const c = dueTodayCommitments.sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))[0]
    const person = getPersonFromRow(c)
    focusRecommendation = {
      title: c.description,
      reason: `This is due today.${person ? ` Involves ${person.name}.` : ''}`,
      sourceType: 'commitment',
      sourceId: c.id,
      link: c.source_memory_id ? `/continuity/threads/${c.source_memory_id}` : '#',
      personName: person?.name ?? null,
    }
  }

  // 5. Forgotten-risk thread (highest importance)
  if (!focusRecommendation) {
    const forgottenRisk = threads.filter(t => t.status === 'forgotten_risk').sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    if (forgottenRisk.length > 0) {
      const t = forgottenRisk[0]
      const daysSince = Math.floor((now - new Date(t.last_activity_at).getTime()) / 86400000)
      focusRecommendation = {
        title: t.title,
        reason: `This hasn't been touched in ${daysSince} day${daysSince === 1 ? '' : 's'} and is at risk of being forgotten.`,
        sourceType: 'thread',
        sourceId: t.id,
        link: `/continuity/threads/${t.id}`,
        personName: null,
      }
    }
  }

  // 6. Overdue follow-up
  if (!focusRecommendation && overdueFollowUps.length > 0) {
    const f = overdueFollowUps[0]
    focusRecommendation = {
      title: f.description,
      reason: 'This follow-up is overdue.',
      sourceType: 'follow_up',
      sourceId: f.id,
      link: '#',
      personName: null,
    }
  }

  // --- Emotional trajectory ---
  const emotionalTrend = emotionalResult.trend as MorningSynthesis['emotionalTrajectory']['trend']
  const readingCount = emotionalResult.readings.length
  const emotionalNarrative = buildEmotionalNarrative(
    emotionalResult.trend,
    emotionalResult.persistence,
    emotionalResult.dominant_signal,
    readingCount,
    7,
  )

  // --- Relational pressure ---
  const relationalPeople: MorningSynthesis['relationalPressure']['people'] = []

  for (const pattern of patterns) {
    // Extract person info from evidence_refs
    const refs = pattern.evidence_refs || []
    const personRef = refs.find((r: Record<string, unknown>) => r.person_id) as Record<string, unknown> | undefined
    if (!personRef) continue

    const personId = personRef.person_id as string
    const personName = (personRef.person_name as string) || pattern.title

    // Count active commitments for this person
    const personCommitmentCount = commitments.filter(c => c.person_id === personId).length

    // Derive stress association from pattern confidence
    const stressAssociation = pattern.confidence

    // Classify pressure
    let pressure: 'high' | 'moderate' | 'low' = 'low'
    if (stressAssociation > 0.7 || personCommitmentCount >= 3) pressure = 'high'
    else if (stressAssociation > 0.4 || personCommitmentCount >= 2) pressure = 'moderate'

    relationalPeople.push({
      name: personName,
      personId,
      pressure,
      reason: pattern.description,
      stressAssociation,
      commitmentCount: personCommitmentCount,
    })
  }

  // Sort by pressure level
  const pressureOrder = { high: 0, moderate: 1, low: 2 }
  relationalPeople.sort((a, b) => pressureOrder[a.pressure] - pressureOrder[b.pressure])

  // --- Data completeness ---
  const dataCompleteness = assessCompleteness(
    !!stateRes.data,
    !!latestSnapshot,
    threads.length > 0,
    readingCount > 0,
    patterns.length > 0,
  )

  // --- Interface state (computed FIRST, drives all adaptation) ---
  const interfaceState = computeInterfaceState(
    state,
    previousState,
    loadScore,
    emotionalResult.trend,
    emotionalResult.volatility,
  )
  const recoveryIntelligence = deriveRecoveryIntelligence(interfaceState)

  // --- State-adaptive filtering (driven by interface state) ---
  if (interfaceState.density === 'minimal' && interfaceState.tone === 'containing') {
    // Overwhelmed / stretched+high-load: only focus + critical threads
    slippingThreads.length = 0
    stableThreads.length = 0
    relationalPeople.splice(1)
  }

  if (state === 'in_flow') {
    // Minimal — don't interrupt
    focusRecommendation = null
    relationalPeople.length = 0
    slippingThreads.length = 0
  }

  // Reduced density with warm tone (depleted): cap lists
  if (interfaceState.density === 'reduced' && interfaceState.tone === 'warm') {
    slippingThreads.splice(2)
    relationalPeople.splice(1)
  }

  // --- Cognitive observation ---
  const cognitiveObservation = buildCognitiveObservation(
    overdueCommitments,
    loadScore,
    emotionalResult.trend,
    emotionalResult.dominant_signal,
    patterns,
    forgottenIntents,
    threads,
    state,
    getPersonFromRow,
    stateData?.state_changed_at ?? null,
    emotionalResult.readings,
  )

  // --- Pressure signals ---
  const pressureSignals = buildPressureSignals(
    overdueCommitments,
    forgottenIntents,
    threads,
    criticalThreads,
    getPersonFromRow,
  )

  // --- Identity snapshot ---
  const identitySnapshot = buildIdentitySnapshot(
    profile,
    profile?.daily_rhythm as DailyRhythmWithTransitions | null,
  )

  // --- Stabilization score ---
  const highPressureCount = relationalPeople.filter(p => p.pressure === 'high').length
  const recentScores = continuitySnapshots.map(s => s.continuity_score)
  const stabilizationScore = buildStabilizationScore(
    emotionalResult.volatility,
    overdueCommitments.length,
    commitments.length,
    highPressureCount,
    loadScore,
    continuityState,
    recentScores,
  )

  // --- Build final synthesis ---
  return {
    cognitiveNarrative: {
      headline: buildHeadline(state, emotionalResult.trend, emotionalResult.dominant_signal, loadScore),
      subtext: buildSubtext(loadScore, overdueCommitments.length, continuityScore, continuityState, threads.length),
      state,
      stateConfidence,
      continuityScore,
      continuityState,
      cognitiveLoadScore: loadScore,
      cognitiveLoadLabel: loadLabel(loadScore),
    },
    focusRecommendation,
    emotionalTrajectory: {
      trend: emotionalTrend === 'no_data' ? 'no_data' : emotionalTrend,
      volatility: emotionalResult.volatility,
      narrativeLine: emotionalNarrative,
      readingCount,
    },
    relationalPressure: {
      people: relationalPeople,
      narrativeLine: buildRelationalNarrative(
        relationalPeople,
        (conflictPatternsRes.data || []) as { title: string; description: string; evidence_refs: Record<string, unknown>[]; confidence: number }[],
      ),
    },
    threadStability: {
      stable: stableThreads,
      slipping: slippingThreads,
      critical: criticalThreads,
      narrativeLine: buildThreadNarrative(
        stableThreads.length,
        slippingThreads.length,
        criticalThreads.length,
        criticalThreads.map(t => t.title),
      ),
    },
    dataCompleteness,
    cognitiveObservation,
    pressureSignals,
    recoveryIntelligence,
    identitySnapshot,
    stabilizationScore,
    interfaceState,
  }
}
