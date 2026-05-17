import { createAdminClient } from '@/lib/supabase/admin'
import { getDecayedRetention } from './decay-engine'
import type { ForgottenIntentPrediction } from '@/lib/types'

/**
 * Predict forgotten intents:
 * P_f = (I_u × 0.35) + (T_e × 0.25) + (C_l × 0.20) + (H_p × 0.20)
 *
 * I_u = Intent urgency (from follow-up due date proximity)
 * T_e = Time elapsed since detection
 * C_l = Cognitive load at time of detection
 * H_p = Historical pattern score (how often similar intents get forgotten)
 *
 * Decay-adjusted: multiply by D(t)
 * Surface when P_f > 0.5
 */
export async function predictForgottenIntents(userId: string): Promise<ForgottenIntentPrediction[]> {
  const supabase = createAdminClient()
  const now = new Date()

  // Get pending follow-up candidates
  const { data: followUps } = await supabase
    .from('follow_up_candidates')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('follow_up_due_at', { ascending: true })

  if (!followUps || followUps.length === 0) return []

  // Get latest cognitive load
  const { data: latestLoad } = await supabase
    .from('cognitive_load_readings')
    .select('load_score')
    .eq('user_id', userId)
    .order('measured_at', { ascending: false })
    .limit(1)
    .single()

  const cognitiveLoad = latestLoad?.load_score || 0.5

  // Calculate historical forget pattern
  const historicalPattern = await calculateHistoricalForgetPattern(userId)

  const predictions: ForgottenIntentPrediction[] = []

  for (const followUp of followUps) {
    // I_u: Intent urgency (higher when overdue or close to due)
    let intentUrgency = 0.3
    if (followUp.follow_up_due_at) {
      const dueDate = new Date(followUp.follow_up_due_at)
      const daysUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      if (daysUntilDue < -3) intentUrgency = 0.9
      else if (daysUntilDue < 0) intentUrgency = 0.7
      else if (daysUntilDue < 1) intentUrgency = 0.5
      else intentUrgency = 0.3
    }

    // T_e: Time elapsed since detection (longer = more likely forgotten)
    const daysSinceDetection = (now.getTime() - new Date(followUp.detected_at).getTime()) / (1000 * 60 * 60 * 24)
    const timeElapsed = Math.min(1, daysSinceDetection / 14)

    // Apply decay
    const retention = getDecayedRetention({
      id: followUp.id,
      decay_coefficient: followUp.decay_coefficient,
      continuity_retention: followUp.continuity_retention,
      last_decay_at: followUp.updated_at || followUp.created_at,
    })

    // P_f formula
    const pf = (intentUrgency * 0.35) +
      (timeElapsed * 0.25) +
      (cognitiveLoad * 0.20) +
      (historicalPattern * 0.20)

    const decayAdjustedPriority = pf * retention

    // Only predict if P_f > 0.5
    if (pf > 0.5) {
      // Check if prediction already exists
      const { data: existing } = await supabase
        .from('forgotten_intent_predictions')
        .select('id')
        .eq('user_id', userId)
        .eq('source_follow_up_id', followUp.id)
        .in('status', ['predicted', 'surfaced'])
        .single()

      if (existing) {
        // Update existing
        await supabase
          .from('forgotten_intent_predictions')
          .update({
            probability_forgotten: pf,
            intent_urgency: intentUrgency,
            cognitive_load_at_detection: cognitiveLoad,
            historical_pattern_score: historicalPattern,
            decay_adjusted_priority: decayAdjustedPriority,
            updated_at: now.toISOString(),
          })
          .eq('id', existing.id)
      } else {
        // Create new prediction
        const { data: prediction } = await supabase
          .from('forgotten_intent_predictions')
          .insert({
            user_id: userId,
            intent_description: followUp.description,
            probability_forgotten: pf,
            intent_urgency: intentUrgency,
            cognitive_load_at_detection: cognitiveLoad,
            historical_pattern_score: historicalPattern,
            decay_adjusted_priority: decayAdjustedPriority,
            source_follow_up_id: followUp.id,
            status: 'predicted',
          })
          .select('*')
          .single()

        if (prediction) predictions.push(prediction)
      }
    }
  }

  // Also fetch existing predictions
  const { data: existingPredictions } = await supabase
    .from('forgotten_intent_predictions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['predicted', 'surfaced'])
    .order('decay_adjusted_priority', { ascending: false })
    .limit(10)

  return existingPredictions || predictions
}

/**
 * Analyse historical patterns of dismissed/expired follow-ups
 * to score how likely the user is to forget things.
 */
async function calculateHistoricalForgetPattern(userId: string): Promise<number> {
  const supabase = createAdminClient()

  const [{ count: totalFollowUps }, { count: dismissedOrExpired }] = await Promise.all([
    supabase
      .from('follow_up_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('follow_up_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['dismissed']),
  ])

  if (!totalFollowUps || totalFollowUps === 0) return 0.3 // default baseline

  return Math.min(1, (dismissedOrExpired || 0) / totalFollowUps)
}

/**
 * Get predictions that should be surfaced (P_f > 0.5, not yet surfaced).
 */
export async function getSurfaceablePredictions(
  userId: string
): Promise<ForgottenIntentPrediction[]> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('forgotten_intent_predictions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'predicted')
    .gt('probability_forgotten', 0.5)
    .order('decay_adjusted_priority', { ascending: false })
    .limit(5)

  return data || []
}
