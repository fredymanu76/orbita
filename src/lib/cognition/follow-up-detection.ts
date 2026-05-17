import { createAdminClient } from '@/lib/supabase/admin'
import { getDecayedRetention } from './decay-engine'
import type { FollowUpCandidate, ExtractedEntities } from '@/lib/types'

/**
 * Create follow-up candidates from extracted follow-up intents.
 * Called during memory processing.
 */
export async function createFollowUpCandidates(
  userId: string,
  memoryId: string,
  intents: ExtractedEntities['follow_up_intents']
): Promise<void> {
  if (!intents || intents.length === 0) return

  const supabase = createAdminClient()

  for (const intent of intents) {
    if (intent.confidence < 0.3) continue

    // Parse expected timeframe to days
    const windowDays = parseTimeframeToDays(intent.expected_timeframe)
    const dueAt = new Date()
    dueAt.setDate(dueAt.getDate() + windowDays)

    // Set decay coefficient based on confidence: higher confidence = slower decay
    const decayCoefficient = 0.05 * (1 - intent.confidence * 0.5)

    await supabase.from('follow_up_candidates').insert({
      user_id: userId,
      source_memory_id: memoryId,
      description: intent.description,
      detected_intent: intent.description,
      expected_window_days: windowDays,
      detected_at: new Date().toISOString(),
      follow_up_due_at: dueAt.toISOString(),
      decay_coefficient: Math.max(0.01, decayCoefficient),
      continuity_retention: 1.0,
      status: 'pending',
    })
  }
}

/**
 * Parse natural language timeframe to days.
 */
function parseTimeframeToDays(timeframe: string | null): number {
  if (!timeframe) return 7

  const lower = timeframe.toLowerCase()

  if (lower.includes('today') || lower.includes('tonight')) return 1
  if (lower.includes('tomorrow')) return 1
  if (lower.includes('this week')) return 5
  if (lower.includes('next week')) return 7
  if (lower.includes('few days') || lower.includes('couple days')) return 3
  if (lower.includes('this month')) return 14
  if (lower.includes('next month')) return 30
  if (lower.includes('soon')) return 3

  // Try to parse "in X days/weeks"
  const daysMatch = lower.match(/in\s+(\d+)\s+days?/)
  if (daysMatch) return parseInt(daysMatch[1])

  const weeksMatch = lower.match(/in\s+(\d+)\s+weeks?/)
  if (weeksMatch) return parseInt(weeksMatch[1]) * 7

  return 7 // default
}

/**
 * Get pending follow-up candidates sorted by decay-adjusted urgency.
 */
export async function getPendingFollowUps(
  userId: string,
  limit: number = 10
): Promise<(FollowUpCandidate & { decay_adjusted_urgency: number })[]> {
  const supabase = createAdminClient()

  const { data: candidates } = await supabase
    .from('follow_up_candidates')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('follow_up_due_at', { ascending: true })
    .limit(limit * 2)

  if (!candidates) return []

  const now = new Date()

  return candidates
    .map(candidate => {
      const retention = getDecayedRetention({
        id: candidate.id,
        decay_coefficient: candidate.decay_coefficient,
        continuity_retention: candidate.continuity_retention,
        last_decay_at: candidate.updated_at || candidate.created_at,
      })

      // Urgency increases as due date approaches or passes
      let timeUrgency = 0.5
      if (candidate.follow_up_due_at) {
        const dueDate = new Date(candidate.follow_up_due_at)
        const daysUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        if (daysUntilDue < 0) timeUrgency = Math.min(1, 0.8 + Math.abs(daysUntilDue) * 0.02)
        else if (daysUntilDue < 1) timeUrgency = 0.7
        else if (daysUntilDue < 3) timeUrgency = 0.5
        else timeUrgency = 0.3
      }

      return {
        ...candidate,
        decay_adjusted_urgency: timeUrgency * retention,
      }
    })
    .filter(c => c.decay_adjusted_urgency > 0.05)
    .sort((a, b) => b.decay_adjusted_urgency - a.decay_adjusted_urgency)
    .slice(0, limit)
}

/**
 * Mark a follow-up as surfaced (shown to user).
 */
export async function surfaceFollowUp(followUpId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('follow_up_candidates')
    .update({
      status: 'surfaced',
      surfaced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', followUpId)
}
