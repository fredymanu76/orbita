import { createAdminClient } from '@/lib/supabase/admin'
import { getEmotionalTrajectory } from '@/lib/cognition/emotional-mapping'
import { getLatestCognitiveLoad } from '@/lib/cognition/cognitive-load'
import type {
  MorningSynthesis,
  UserState,
  ContinuityState,
  UserPattern,
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
): string {
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

// --- Main synthesis function ---

export async function computeMorningSynthesis(userId: string): Promise<MorningSynthesis> {
  const supabase = createAdminClient()

  // Parallel data fetches — all from existing tables
  const [
    stateRes,
    cogLoadReading,
    continuityRes,
    commitmentsRes,
    threadsRes,
    emotionalResult,
    patternsRes,
    followUpsRes,
  ] = await Promise.all([
    supabase
      .from('user_state')
      .select('current_state, state_confidence')
      .eq('user_id', userId)
      .single(),
    getLatestCognitiveLoad(userId),
    supabase
      .from('continuity_snapshots')
      .select('continuity_score, state')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single(),
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
  ])

  const state = (stateRes.data?.current_state as UserState) || 'stable'
  const stateConfidence = stateRes.data?.state_confidence ?? 0
  const loadScore = cogLoadReading?.load_score ?? 0
  const continuityScore = continuityRes.data?.continuity_score ?? 0
  const continuityState = (continuityRes.data?.state as ContinuityState) || 'stable'
  const commitments = (commitmentsRes.data || []) as unknown as CommitmentRow[]
  const threads = (threadsRes.data || []) as unknown as ThreadRow[]
  const patterns = (patternsRes.data || []) as UserPattern[]
  const followUps = (followUpsRes.data || []) as unknown as FollowUpRow[]

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
    !!continuityRes.data,
    threads.length > 0,
    readingCount > 0,
    patterns.length > 0,
  )

  // --- State-adaptive filtering ---
  if (state === 'overwhelmed') {
    // Only show focus + critical threads. Cap relational to 1.
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

  // --- Build final synthesis ---
  return {
    cognitiveNarrative: {
      headline: STATE_HEADLINES[state] || STATE_HEADLINES.stable,
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
      narrativeLine: buildRelationalNarrative(relationalPeople),
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
  }
}
