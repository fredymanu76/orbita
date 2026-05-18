import { createAdminClient } from '@/lib/supabase/admin'
import type { EmotionalReading, ExtractedEntities } from '@/lib/types'

/**
 * Emotional Signal Detection — deterministic, shallow, factual only.
 *
 * Architecture:
 * - GPT detects explicit emotional markers in text (e.g., "frustrated", "stressed")
 * - This function stores those signals with the exact trigger text
 * - NO inferred emotional state
 * - NO simulated empathy
 * - NO psychological interpretation
 *
 * Signals are factual observations: "the word 'stressed' appeared at intensity 0.7"
 * They are NOT: "the user is probably feeling anxious about their relationship"
 *
 * The emotional_readings table is reused but semantics change:
 * - emotion = signal_type (frustration, urgency, stress, concern, excitement, relief)
 * - intensity = signal strength from language
 * - valence = derived deterministically (frustration/stress/concern = negative, excitement/relief = positive)
 */

type EmotionalSignal = ExtractedEntities['emotional_signals'][0]

// Deterministic valence mapping — no GPT interpretation
const SIGNAL_VALENCE: Record<string, number> = {
  frustration: -0.7,
  urgency: -0.3,
  stress: -0.8,
  concern: -0.5,
  excitement: 0.8,
  relief: 0.6,
}

/**
 * Create emotional signal records from extracted signals.
 * Each signal has explicit trigger_text — the exact words that caused detection.
 *
 * Replaces the old createEmotionalReading which stored GPT-interpreted psychological state.
 */
export async function createEmotionalSignals(
  userId: string,
  memoryId: string,
  signals: EmotionalSignal[]
): Promise<void> {
  const supabase = createAdminClient()

  for (const signal of signals) {
    // Derive valence deterministically — no GPT needed
    const valence = SIGNAL_VALENCE[signal.signal_type] ?? 0

    await supabase.from('emotional_readings').insert({
      user_id: userId,
      emotion: signal.signal_type,
      intensity: signal.intensity,
      valence,
      embedding: null, // No embeddings for emotional signals — they're factual markers, not semantic content
      source_memory_id: memoryId,
      measured_at: new Date().toISOString(),
    })
  }
}

/**
 * Legacy compat: createEmotionalReading for old-format emotional_analysis.
 * Only used if code path still references old format. Prefer createEmotionalSignals.
 */
export async function createEmotionalReading(
  userId: string,
  memoryId: string,
  emotionalAnalysis: NonNullable<{ primary_emotion: string; intensity: number; valence: number }>
): Promise<void> {
  const supabase = createAdminClient()

  await supabase.from('emotional_readings').insert({
    user_id: userId,
    emotion: emotionalAnalysis.primary_emotion,
    intensity: emotionalAnalysis.intensity,
    valence: emotionalAnalysis.valence,
    embedding: null,
    source_memory_id: memoryId,
    measured_at: new Date().toISOString(),
  })
}

/**
 * Get emotional signal trajectory over a period.
 * Returns factual signal history — not interpreted psychological state.
 */
export async function getEmotionalTrajectory(
  userId: string,
  days: number = 7
): Promise<{
  readings: EmotionalReading[]
  volatility: number
  trend: string
  persistence: number
  dominant_signal: string
}> {
  const supabase = createAdminClient()
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data: readings } = await supabase
    .from('emotional_readings')
    .select('*')
    .eq('user_id', userId)
    .gte('measured_at', since.toISOString())
    .order('measured_at', { ascending: true })

  if (!readings || readings.length === 0) {
    return {
      readings: [],
      volatility: 0,
      trend: 'no_data',
      persistence: 0,
      dominant_signal: 'none',
    }
  }

  // Volatility: average change in intensity between consecutive readings
  let volatility = 0
  if (readings.length > 1) {
    let totalChange = 0
    for (let i = 1; i < readings.length; i++) {
      totalChange += Math.abs(readings[i].intensity - readings[i - 1].intensity)
    }
    volatility = totalChange / (readings.length - 1)
  }

  // Trend: compare first half average valence to second half (deterministic)
  const midpoint = Math.floor(readings.length / 2)
  const firstHalf = readings.slice(0, midpoint)
  const secondHalf = readings.slice(midpoint)

  const firstAvgValence = firstHalf.reduce((s, r) => s + r.valence, 0) / (firstHalf.length || 1)
  const secondAvgValence = secondHalf.reduce((s, r) => s + r.valence, 0) / (secondHalf.length || 1)

  let trend = 'stable'
  if (secondAvgValence - firstAvgValence > 0.2) trend = 'improving'
  else if (firstAvgValence - secondAvgValence > 0.2) trend = 'declining'

  // Persistence: how often does the dominant signal repeat?
  const signalCounts: Record<string, number> = {}
  for (const r of readings) {
    signalCounts[r.emotion] = (signalCounts[r.emotion] || 0) + 1
  }
  const dominant_signal = Object.entries(signalCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none'
  const persistence = (signalCounts[dominant_signal] || 0) / readings.length

  return {
    readings,
    volatility: Math.min(1, volatility),
    trend,
    persistence,
    dominant_signal,
  }
}
