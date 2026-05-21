import { createAdminClient } from '@/lib/supabase/admin'
import { SIGNAL_VALENCE } from '@/lib/cognition/emotional-mapping'
import type { UserState } from '@/lib/types'

interface StateSignal {
  signal: string
  value: number
  weight: number
}

interface StateInference {
  state: UserState
  confidence: number
  signals: StateSignal[]
}

/**
 * Infers the user's current emotional/life state from signals.
 * Purely deterministic — no GPT calls.
 */
export async function inferUserState(userId: string): Promise<StateInference> {
  const supabase = createAdminClient()

  // Gather signals in parallel
  const [loadRes, threadsRes, commitmentsRes, emotionalRes, capturesRes] = await Promise.all([
    // Latest cognitive load
    supabase
      .from('cognitive_load_readings')
      .select('load_score, emotional_intensity')
      .eq('user_id', userId)
      .order('measured_at', { ascending: false })
      .limit(1)
      .single(),
    // Active threads
    supabase
      .from('threads')
      .select('id, status, last_activity_at, continuity_retention')
      .eq('user_id', userId)
      .in('status', ['active', 'unresolved', 'forgotten_risk', 'time_sensitive', 'emotionally_sensitive'])
      .order('last_activity_at', { ascending: false }),
    // Active commitments
    supabase
      .from('commitments')
      .select('id, status, due_date')
      .eq('user_id', userId)
      .eq('status', 'active'),
    // Recent emotional readings (30d)
    supabase
      .from('emotional_readings')
      .select('emotion, intensity, valence, measured_at')
      .eq('user_id', userId)
      .gte('measured_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('measured_at', { ascending: false })
      .limit(50),
    // Recent captures (7d) for frequency
    supabase
      .from('memory_items')
      .select('id, created_at')
      .eq('user_id', userId)
      .eq('processed', true)
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
  ])

  const cogLoad = loadRes.data?.load_score ?? 0.3
  const emotionalIntensity = loadRes.data?.emotional_intensity ?? 0.3
  const threads = threadsRes.data || []
  const commitments = commitmentsRes.data || []
  const emotions = emotionalRes.data || []
  const recentCaptures = capturesRes.data || []

  const now = Date.now()
  const todayStr = new Date().toISOString().split('T')[0]

  // Compute signals
  const overdueCount = commitments.filter(c => c.due_date && c.due_date < todayStr).length
  const forgottenThreads = threads.filter(t => t.status === 'forgotten_risk').length
  const staleThreads = threads.filter(t => t.continuity_retention < 0.3).length
  const activeThreadCount = threads.length
  const captureFrequency = recentCaptures.length / 7 // per day

  // People mentioned in last 5 days
  const fiveDaysAgo = new Date(now - 5 * 86400000).toISOString()
  const recentPeopleRes = await supabase
    .from('people')
    .select('id')
    .eq('user_id', userId)
    .gte('last_mentioned_at', fiveDaysAgo)
  const recentPeopleMentioned = recentPeopleRes.data?.length ?? 0

  // Continuity score
  const continuityRes = await supabase
    .from('continuity_snapshots')
    .select('continuity_score')
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()
  const continuityScore = continuityRes.data?.continuity_score ?? 50

  // Average emotional valence (recent)
  const avgValence = emotions.length > 0
    ? emotions.reduce((sum, e) => sum + (e.valence ?? 0), 0) / emotions.length
    : 0

  // Score each state
  const signals: StateSignal[] = []
  const stateScores: Record<UserState, number> = {
    overwhelmed: 0,
    isolated: 0,
    drifting: 0,
    in_flow: 0,
    recovering: 0,
    stable: 0,
    stretched: 0,
  }

  // Overwhelmed signals
  if (cogLoad > 0.7) {
    stateScores.overwhelmed += 0.35
    signals.push({ signal: 'high_cognitive_load', value: cogLoad, weight: 0.35 })
  }
  if (overdueCount > 3) {
    stateScores.overwhelmed += 0.25
    signals.push({ signal: 'many_overdue_commitments', value: overdueCount, weight: 0.25 })
  }
  if (emotionalIntensity > 0.7) {
    stateScores.overwhelmed += 0.2
    signals.push({ signal: 'high_emotional_intensity', value: emotionalIntensity, weight: 0.2 })
  }

  // Isolated signals
  if (recentPeopleMentioned === 0 && captureFrequency < 1) {
    stateScores.isolated += 0.4
    signals.push({ signal: 'no_people_mentioned_5d', value: recentPeopleMentioned, weight: 0.4 })
  }
  if (captureFrequency < 0.5) {
    stateScores.isolated += 0.2
    signals.push({ signal: 'low_capture_frequency', value: captureFrequency, weight: 0.2 })
  }

  // Drifting signals
  if (continuityScore < 50) {
    stateScores.drifting += 0.3
    signals.push({ signal: 'low_continuity_score', value: continuityScore, weight: 0.3 })
  }
  if (forgottenThreads > 2) {
    stateScores.drifting += 0.25
    signals.push({ signal: 'many_forgotten_threads', value: forgottenThreads, weight: 0.25 })
  }
  if (staleThreads > 3) {
    stateScores.drifting += 0.15
    signals.push({ signal: 'many_stale_threads', value: staleThreads, weight: 0.15 })
  }

  // In-flow signals
  if (captureFrequency >= 2 && overdueCount === 0) {
    stateScores.in_flow += 0.3
    signals.push({ signal: 'regular_captures_no_overdue', value: captureFrequency, weight: 0.3 })
  }
  if (continuityScore > 70) {
    stateScores.in_flow += 0.2
    signals.push({ signal: 'high_continuity', value: continuityScore, weight: 0.2 })
  }
  if (avgValence > 0.3) {
    stateScores.in_flow += 0.15
    signals.push({ signal: 'positive_emotional_trend', value: avgValence, weight: 0.15 })
  }

  // Stretched signals
  if (activeThreadCount > 6 && cogLoad > 0.4 && cogLoad <= 0.7) {
    stateScores.stretched += 0.35
    signals.push({ signal: 'many_threads_moderate_load', value: activeThreadCount, weight: 0.35 })
  }
  if (overdueCount > 0 && overdueCount <= 3) {
    stateScores.stretched += 0.15
    signals.push({ signal: 'some_overdue', value: overdueCount, weight: 0.15 })
  }

  // Recent emotional momentum — last 24h readings override stale structural signals
  const oneDayAgo = new Date(now - 86400000).toISOString()
  const recentEmotions = emotions.filter(e => e.measured_at >= oneDayAgo)
  if (recentEmotions.length >= 2) {
    const recentAvgValence = recentEmotions.reduce((s, e) => s + (e.valence ?? 0), 0) / recentEmotions.length
    if (recentAvgValence > 0.3) {
      // Recent positive signals dampen negative states
      stateScores.overwhelmed *= 0.6
      stateScores.stretched *= 0.6
      stateScores.drifting *= 0.7
      stateScores.isolated *= 0.7
      // Boost positive states
      stateScores.stable += 0.15
      stateScores.in_flow += 0.1
      signals.push({ signal: 'recent_positive_momentum', value: recentAvgValence, weight: 0.15 })
    } else if (recentAvgValence < -0.3) {
      // Recent negative signals dampen positive states
      stateScores.in_flow *= 0.6
      stateScores.stable *= 0.8
      signals.push({ signal: 'recent_negative_momentum', value: recentAvgValence, weight: 0.15 })
    }
  }

  // Determine winning state
  let bestState: UserState = 'stable'
  let bestScore = 0
  for (const [state, score] of Object.entries(stateScores)) {
    if (score > bestScore) {
      bestScore = score
      bestState = state as UserState
    }
  }

  // If no strong signal, default to stable
  if (bestScore < 0.25) {
    bestState = 'stable'
    bestScore = 0.5
  }

  // Check for recovering: if previous state was negative and now trending better
  const prevStateRes = await supabase
    .from('user_state')
    .select('current_state')
    .eq('user_id', userId)
    .single()

  const prevState = prevStateRes.data?.current_state as UserState | null
  if (prevState && ['overwhelmed', 'drifting', 'isolated'].includes(prevState) && bestState === 'stable') {
    bestState = 'recovering'
    bestScore = 0.6
  }

  const confidence = Math.min(bestScore, 1)

  // Upsert user_state
  const { error } = await supabase
    .from('user_state')
    .upsert({
      user_id: userId,
      current_state: bestState,
      state_confidence: confidence,
      state_signals: signals,
      previous_state: prevState,
      state_changed_at: prevState !== bestState ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) {
    console.error('[StateEngine] Failed to upsert state:', error.message)
  }

  return { state: bestState, confidence, signals }
}

/**
 * Check if strong signals warrant an immediate state update (during incremental pipeline).
 */
export async function checkStrongSignals(
  userId: string,
  emotionalSignals: { signal_type: string; intensity: number }[]
): Promise<boolean> {
  // Case 1: Any signal with intensity >= 0.8 triggers immediate recalculation
  const highIntensity = emotionalSignals.some(s => s.intensity >= 0.8)
  if (highIntensity) {
    await inferUserState(userId)
    return true
  }

  // Case 2: Positive counter-signal — a moderate positive signal while in a negative state
  const negativeStates: UserState[] = ['overwhelmed', 'stretched', 'drifting', 'isolated']
  const hasPositiveSignal = emotionalSignals.some(
    s => (SIGNAL_VALENCE[s.signal_type] ?? 0) > 0 && s.intensity >= 0.5
  )

  if (hasPositiveSignal) {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('user_state')
      .select('current_state')
      .eq('user_id', userId)
      .single()

    if (data && negativeStates.includes(data.current_state as UserState)) {
      await inferUserState(userId)
      return true
    }
  }

  return false
}
