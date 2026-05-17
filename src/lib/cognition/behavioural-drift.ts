import { createAdminClient } from '@/lib/supabase/admin'
import type { BehaviouralBaseline } from '@/lib/types'

/**
 * 5 behavioural metrics tracked over time:
 * 1. follow_through_rate — commitments completed / total
 * 2. capture_frequency — memories captured per day
 * 3. social_continuity — people interaction consistency
 * 4. emotional_stability — emotional volatility over window
 * 5. obligation_completion_rate — follow-ups completed / total
 *
 * Baseline established from first 14 days.
 * Drift = abs(current - baseline) / baseline
 * B_d > 0.3 → gentle observation in daily brief.
 */

const METRICS = [
  'follow_through_rate',
  'capture_frequency',
  'social_continuity',
  'emotional_stability',
  'obligation_completion_rate',
] as const

/**
 * Calculate current values for all behavioural metrics.
 */
async function measureCurrentMetrics(userId: string): Promise<Record<string, number>> {
  const supabase = createAdminClient()
  const now = new Date()
  const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // 1. Follow-through rate
  const [{ count: totalCommitments }, { count: completedCommitments }] = await Promise.all([
    supabase
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', windowStart.toISOString()),
    supabase
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('created_at', windowStart.toISOString()),
  ])

  const followThroughRate = (totalCommitments || 0) > 0
    ? (completedCommitments || 0) / (totalCommitments || 1)
    : 0.5

  // 2. Capture frequency (memories per day over last 7 days)
  const { count: recentMemories } = await supabase
    .from('memory_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', windowStart.toISOString())

  const captureFrequency = (recentMemories || 0) / 7

  // 3. Social continuity (distinct people mentioned per day)
  const { data: recentPeople } = await supabase
    .from('memory_people')
    .select('person_id, memory_items!inner(created_at, user_id)')
    .gte('memory_items.created_at', windowStart.toISOString())
    .eq('memory_items.user_id', userId)

  const distinctPeople = new Set((recentPeople || []).map(p => p.person_id)).size
  const socialContinuity = distinctPeople / 7

  // 4. Emotional stability (inverse of volatility)
  const { data: recentEmotions } = await supabase
    .from('emotional_readings')
    .select('intensity, valence')
    .eq('user_id', userId)
    .gte('measured_at', windowStart.toISOString())
    .order('measured_at', { ascending: true })

  let emotionalStability = 0.7
  if (recentEmotions && recentEmotions.length > 1) {
    let totalChange = 0
    for (let i = 1; i < recentEmotions.length; i++) {
      totalChange += Math.abs(recentEmotions[i].intensity - recentEmotions[i - 1].intensity)
    }
    const volatility = totalChange / (recentEmotions.length - 1)
    emotionalStability = Math.max(0, 1 - volatility)
  }

  // 5. Obligation completion rate (follow-ups)
  const [{ count: totalFollowUps }, { count: completedFollowUps }] = await Promise.all([
    supabase
      .from('follow_up_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', windowStart.toISOString()),
    supabase
      .from('follow_up_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('created_at', windowStart.toISOString()),
  ])

  const obligationCompletionRate = (totalFollowUps || 0) > 0
    ? (completedFollowUps || 0) / (totalFollowUps || 1)
    : 0.5

  return {
    follow_through_rate: followThroughRate,
    capture_frequency: captureFrequency,
    social_continuity: socialContinuity,
    emotional_stability: emotionalStability,
    obligation_completion_rate: obligationCompletionRate,
  }
}

/**
 * Update behavioural baselines and calculate drift.
 * Called by daily cron.
 */
export async function updateBehaviouralDrift(userId: string): Promise<{
  metrics: BehaviouralBaseline[]
  significantDrifts: string[]
}> {
  const supabase = createAdminClient()
  const current = await measureCurrentMetrics(userId)
  const significantDrifts: string[] = []
  const updatedMetrics: BehaviouralBaseline[] = []

  for (const metric of METRICS) {
    const currentValue = current[metric] ?? 0.5

    const { data: existing } = await supabase
      .from('behavioural_baselines')
      .select('*')
      .eq('user_id', userId)
      .eq('metric_name', metric)
      .single()

    if (existing) {
      const drift = existing.baseline_value > 0
        ? Math.abs(currentValue - existing.baseline_value) / existing.baseline_value
        : 0

      await supabase
        .from('behavioural_baselines')
        .update({
          current_value: currentValue,
          drift_score: drift,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      if (drift > 0.3) {
        significantDrifts.push(metric)
      }

      updatedMetrics.push({ ...existing, current_value: currentValue, drift_score: drift })
    } else {
      // First time: establish baseline
      const { data: created } = await supabase
        .from('behavioural_baselines')
        .insert({
          user_id: userId,
          metric_name: metric,
          baseline_value: currentValue,
          current_value: currentValue,
          drift_score: 0,
          window_days: 14,
        })
        .select('*')
        .single()

      if (created) updatedMetrics.push(created)
    }
  }

  return { metrics: updatedMetrics, significantDrifts }
}

/**
 * Get a human-readable drift observation for the daily brief.
 */
export function getDriftObservation(significantDrifts: string[]): string | null {
  if (significantDrifts.length === 0) return null

  const descriptions: Record<string, string> = {
    follow_through_rate: 'your follow-through on commitments',
    capture_frequency: 'how often you capture thoughts',
    social_continuity: 'your social interaction patterns',
    emotional_stability: 'your emotional patterns',
    obligation_completion_rate: 'your completion of follow-ups',
  }

  const items = significantDrifts
    .map(d => descriptions[d])
    .filter(Boolean)

  if (items.length === 1) {
    return `Your patterns have shifted recently — ${items[0]} has changed from your usual baseline.`
  }

  return `Your patterns have shifted recently, particularly in ${items.join(' and ')}.`
}
