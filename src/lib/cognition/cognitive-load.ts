import { createAdminClient } from '@/lib/supabase/admin'
import type { CognitiveLoadReading } from '@/lib/types'

/**
 * Measure cognitive load as a weighted sum of:
 * - Active contexts (ongoing threads/conversations)
 * - Unresolved obligations (commitments + follow-ups)
 * - Emotional intensity (recent emotional readings)
 * - Interruption frequency (threads created recently)
 * - Decision density (recent commitments/decisions)
 * - Communication burden (people interacted with recently)
 *
 * Returns 0-1 score. > 0.7 = high load → surface only highest-priority items.
 */
export async function measureCognitiveLoad(userId: string): Promise<CognitiveLoadReading> {
  const supabase = createAdminClient()
  const now = new Date()
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  // Active contexts: interrupted threads + recent memories
  const { count: activeContexts } = await supabase
    .from('interrupted_threads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'interrupted')

  // Unresolved obligations: active/overdue commitments + pending follow-ups
  const [{ count: activeCommitments }, { count: pendingFollowUps }] = await Promise.all([
    supabase
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['active', 'overdue']),
    supabase
      .from('follow_up_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending'),
  ])

  const unresolvedObligations = (activeCommitments || 0) + (pendingFollowUps || 0)

  // Emotional intensity: average from recent readings
  const { data: recentEmotions } = await supabase
    .from('emotional_readings')
    .select('intensity')
    .eq('user_id', userId)
    .gte('measured_at', threeDaysAgo.toISOString())
    .limit(20)

  const emotionalIntensity = recentEmotions && recentEmotions.length > 0
    ? recentEmotions.reduce((sum, e) => sum + e.intensity, 0) / recentEmotions.length
    : 0

  // Interruption frequency: threads created in last day
  const { count: recentInterruptions } = await supabase
    .from('interrupted_threads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', oneDayAgo.toISOString())

  // Decision density: commitments created in last 3 days
  const { count: recentDecisions } = await supabase
    .from('commitments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', threeDaysAgo.toISOString())

  // Communication burden: distinct people mentioned in last 3 days
  const { data: recentPeople } = await supabase
    .from('memory_people')
    .select('person_id, memory_items!inner(created_at, user_id)')
    .gte('memory_items.created_at', threeDaysAgo.toISOString())
    .eq('memory_items.user_id', userId)

  const distinctPeople = new Set((recentPeople || []).map(p => p.person_id)).size

  // Normalize each component to 0-1
  const normalizedContexts = Math.min(1, (activeContexts || 0) / 10)
  const normalizedObligations = Math.min(1, unresolvedObligations / 15)
  const normalizedEmotion = Math.min(1, emotionalIntensity)
  const normalizedInterruptions = Math.min(1, (recentInterruptions || 0) / 5)
  const normalizedDecisions = Math.min(1, (recentDecisions || 0) / 10)
  const normalizedCommunication = Math.min(1, distinctPeople / 8)

  // Weighted sum
  const loadScore = Math.min(1, Math.max(0,
    normalizedContexts * 0.20 +
    normalizedObligations * 0.25 +
    normalizedEmotion * 0.15 +
    normalizedInterruptions * 0.15 +
    normalizedDecisions * 0.15 +
    normalizedCommunication * 0.10
  ))

  // Save reading
  const { data: reading } = await supabase
    .from('cognitive_load_readings')
    .insert({
      user_id: userId,
      measured_at: now.toISOString(),
      active_contexts: activeContexts || 0,
      unresolved_obligations: unresolvedObligations,
      emotional_intensity: emotionalIntensity,
      interruption_frequency: recentInterruptions || 0,
      decision_density: recentDecisions || 0,
      communication_burden: distinctPeople,
      load_score: loadScore,
    })
    .select('*')
    .single()

  return reading!
}

/**
 * Get the most recent cognitive load reading.
 */
export async function getLatestCognitiveLoad(userId: string): Promise<CognitiveLoadReading | null> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('cognitive_load_readings')
    .select('*')
    .eq('user_id', userId)
    .order('measured_at', { ascending: false })
    .limit(1)
    .single()

  return data || null
}

/**
 * Check if cognitive load is high enough to activate adaptive UX.
 */
export function isHighLoad(loadScore: number): boolean {
  return loadScore > 0.7
}
