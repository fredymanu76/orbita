import { createAdminClient } from '@/lib/supabase/admin'
import { getDecayedRetention } from './decay-engine'
import type { ContinuityState, ContinuitySnapshot } from '@/lib/types'
import { generateEmbedding } from '@/lib/ai/embeddings'

/**
 * Continuity Score: C_s = 100 - (U_c + O_o + I_r + C_f + D_d)
 *
 * U_c: Unresolved commitments weighted by decay retention (max 25)
 * O_o: Overdue obligations weighted by decay (max 25)
 * I_r: Interrupted threads × retention score (max 20)
 * C_f: Cognitive fragmentation from embedding clustering (max 15)
 * D_d: Decision discontinuity (max 15)
 */
export async function calculateContinuityScore(userId: string): Promise<{
  score: number
  state: ContinuityState
  penalties: {
    unresolved_commitments: number
    overdue_obligations: number
    interruption_rate: number
    cognitive_fragmentation: number
    decision_discontinuity: number
  }
}> {
  const supabase = createAdminClient()

  // 1. Unresolved commitments penalty (max 25)
  const { data: activeCommitments } = await supabase
    .from('commitments')
    .select('id, importance, created_at')
    .eq('user_id', userId)
    .eq('status', 'active')

  const unresolvedCount = activeCommitments?.length || 0
  // Each unresolved commitment contributes based on importance
  const unresolvedPenalty = Math.min(25,
    (activeCommitments || []).reduce((sum, c) => {
      const importance = c.importance || 5
      return sum + (importance / 10) * 3
    }, 0)
  )

  // 2. Overdue obligations penalty (max 25)
  const { data: overdueCommitments } = await supabase
    .from('commitments')
    .select('id, importance, due_date')
    .eq('user_id', userId)
    .eq('status', 'overdue')

  const now = new Date()
  const overduePenalty = Math.min(25,
    (overdueCommitments || []).reduce((sum, c) => {
      const importance = c.importance || 5
      const daysOverdue = c.due_date
        ? Math.max(0, (now.getTime() - new Date(c.due_date).getTime()) / (1000 * 60 * 60 * 24))
        : 1
      return sum + (importance / 10) * Math.min(5, 1 + daysOverdue * 0.5)
    }, 0)
  )

  // 3. Interrupted threads penalty (max 20)
  const { data: interruptedThreads } = await supabase
    .from('interrupted_threads')
    .select('id, interruption_score, decay_coefficient, continuity_retention, updated_at')
    .eq('user_id', userId)
    .eq('status', 'interrupted')

  const interruptionPenalty = Math.min(20,
    (interruptedThreads || []).reduce((sum, t) => {
      const retention = getDecayedRetention({
        id: t.id,
        decay_coefficient: t.decay_coefficient,
        continuity_retention: t.continuity_retention,
        last_decay_at: t.updated_at,
      })
      return sum + t.interruption_score * retention * 4
    }, 0)
  )

  // 4. Cognitive fragmentation (max 15)
  // Measured by how many unrelated topics were captured in the last 48h
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000)
  const { data: recentMemories } = await supabase
    .from('memory_items')
    .select('id, summary')
    .eq('user_id', userId)
    .eq('processed', true)
    .gte('created_at', twoDaysAgo.toISOString())

  // Simple fragmentation: more distinct topics = more fragmented
  const distinctTopics = recentMemories?.length || 0
  const fragmentationPenalty = Math.min(15, Math.max(0, (distinctTopics - 5) * 1.5))

  // 5. Decision discontinuity (max 15)
  // Measured by follow-up candidates that are overdue
  const { data: overdueFollowUps } = await supabase
    .from('follow_up_candidates')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lt('follow_up_due_at', now.toISOString())

  const discontinuityPenalty = Math.min(15, (overdueFollowUps?.length || 0) * 3)

  const totalPenalty = unresolvedPenalty + overduePenalty + interruptionPenalty +
    fragmentationPenalty + discontinuityPenalty
  const score = Math.max(0, Math.min(100, 100 - totalPenalty))

  const state = classifyState(score)

  return {
    score,
    state,
    penalties: {
      unresolved_commitments: unresolvedPenalty,
      overdue_obligations: overduePenalty,
      interruption_rate: interruptionPenalty,
      cognitive_fragmentation: fragmentationPenalty,
      decision_discontinuity: discontinuityPenalty,
    },
  }
}

function classifyState(score: number): ContinuityState {
  if (score >= 85) return 'stable'
  if (score >= 70) return 'mild_fragmentation'
  if (score >= 50) return 'overload_emerging'
  if (score >= 30) return 'high_discontinuity'
  return 'critical'
}

/**
 * Save a daily continuity snapshot.
 */
export async function saveContinuitySnapshot(userId: string): Promise<ContinuitySnapshot> {
  const supabase = createAdminClient()
  const { score, state, penalties } = await calculateContinuityScore(userId)

  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('continuity_snapshots')
    .upsert({
      user_id: userId,
      snapshot_date: today,
      continuity_score: score,
      unresolved_commitments_penalty: penalties.unresolved_commitments,
      overdue_obligations_penalty: penalties.overdue_obligations,
      interruption_rate_penalty: penalties.interruption_rate,
      cognitive_fragmentation_penalty: penalties.cognitive_fragmentation,
      decision_discontinuity_penalty: penalties.decision_discontinuity,
      state,
    }, {
      onConflict: 'user_id,snapshot_date',
    })
    .select('*')
    .single()

  return data!
}

/**
 * Get recent snapshots for a user.
 */
export async function getRecentSnapshots(
  userId: string,
  days: number = 14
): Promise<ContinuitySnapshot[]> {
  const supabase = createAdminClient()
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data } = await supabase
    .from('continuity_snapshots')
    .select('*')
    .eq('user_id', userId)
    .gte('snapshot_date', since.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true })

  return data || []
}
