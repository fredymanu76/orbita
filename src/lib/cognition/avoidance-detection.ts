import { createAdminClient } from '@/lib/supabase/admin'
import type { AvoidanceCycle } from '@/lib/types'

/**
 * Detect avoidance cycles — items that have been repeatedly deferred, re-engaged
 * then abandoned, or left unresolved for extended periods.
 *
 * Scoring formula:
 *   A_s = (D_r * 0.30) + (T_c * 0.25) + (E_c * 0.25) + (P_e * 0.20)
 *
 * Where:
 *   D_r = min(1, deferral_count / 5)        — deferrals normalised
 *   T_c = min(1, days_in_cycle / 21)         — time in cycle normalised
 *   E_c = emotional_charge (0-1)             — emotional weight
 *   P_e = min(1, partial_engagements / 3)    — re-engagement without resolution
 *
 * Surfaces when A_s > 0.5.
 *
 * Data sources (all existing tables):
 *   - follow_up_candidates: pending items where (now - detected_at) > 14 days
 *   - commitments: overdue active items cross-referenced with re-mentions
 *   - threads: retention oscillation pattern (reset then decay again)
 *   - emotional_readings: joined via memory_people/thread_captures for emotional charge
 *
 * Storage: user_patterns with pattern_type = 'commitment_pattern' (fits CHECK constraint).
 */
export async function detectAvoidanceCycles(userId: string): Promise<AvoidanceCycle[]> {
  const supabase = createAdminClient()
  const now = Date.now()
  const fourteenDaysAgo = new Date(now - 14 * 86400000).toISOString()
  const cycles: AvoidanceCycle[] = []

  // --- 1. Stale follow-ups (pending for >14 days) ---
  const { data: staleFollowUps } = await supabase
    .from('follow_up_candidates')
    .select('id, description, detected_at, follow_up_due_at, source_memory_id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lt('detected_at', fourteenDaysAgo)

  for (const fu of staleFollowUps || []) {
    const daysInCycle = Math.floor((now - new Date(fu.detected_at).getTime()) / 86400000)

    // Check for partial engagements — how many times the source memory's thread had retention reset
    let partialEngagements = 0
    if (fu.source_memory_id) {
      const { data: captures } = await supabase
        .from('thread_captures')
        .select('thread_id')
        .eq('memory_id', fu.source_memory_id)
        .limit(1)

      if (captures && captures.length > 0) {
        // Count how many times retention was reset on this thread (via capture count as proxy)
        const { data: thread } = await supabase
          .from('threads')
          .select('capture_count, continuity_retention')
          .eq('id', captures[0].thread_id)
          .single()

        if (thread) {
          // If capture count > 1 but retention is still low, the user re-engaged but didn't resolve
          if (thread.capture_count > 1 && thread.continuity_retention < 0.5) {
            partialEngagements = Math.min(thread.capture_count - 1, 5)
          }
        }
      }
    }

    // Emotional charge — average intensity from emotional readings near this item
    const emotionalCharge = await getEmotionalChargeForMemory(supabase, userId, fu.source_memory_id)

    // Deferral count approximated by days / 7 (weekly review cycles)
    const deferralCount = Math.floor(daysInCycle / 7)

    const score = computeAvoidanceScore(deferralCount, daysInCycle, emotionalCharge, partialEngagements)

    if (score > 0.5) {
      cycles.push({
        item_id: fu.id,
        item_type: 'follow_up',
        description: fu.description,
        deferral_count: deferralCount,
        days_in_cycle: daysInCycle,
        emotional_charge: emotionalCharge,
        person_name: null,
        avoidance_score: score,
      })
    }
  }

  // --- 2. Overdue commitments with person association ---
  const { data: overdueCommitments } = await supabase
    .from('commitments')
    .select('id, description, due_date, person_id, source_memory_id, person:people(name)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .lt('due_date', new Date().toISOString().split('T')[0])

  for (const c of (overdueCommitments || []) as Array<{
    id: string
    description: string
    due_date: string
    person_id: string | null
    source_memory_id: string | null
    person: { name: string }[] | null
  }>) {
    const daysOverdue = Math.floor((now - new Date(c.due_date).getTime()) / 86400000)
    if (daysOverdue < 14) continue // Only flag if significantly overdue

    const emotionalCharge = await getEmotionalChargeForMemory(supabase, userId, c.source_memory_id)

    // Check for re-mentions in recent memories (partial engagements)
    let partialEngagements = 0
    if (c.source_memory_id) {
      const { data: relatedCaptures } = await supabase
        .from('thread_captures')
        .select('thread_id')
        .eq('memory_id', c.source_memory_id)
        .limit(1)

      if (relatedCaptures && relatedCaptures.length > 0) {
        const { data: thread } = await supabase
          .from('threads')
          .select('capture_count, continuity_retention')
          .eq('id', relatedCaptures[0].thread_id)
          .single()

        if (thread && thread.capture_count > 1 && thread.continuity_retention < 0.5) {
          partialEngagements = Math.min(thread.capture_count - 1, 5)
        }
      }
    }

    const deferralCount = Math.floor(daysOverdue / 7)
    const score = computeAvoidanceScore(deferralCount, daysOverdue, emotionalCharge, partialEngagements)

    const personName = Array.isArray(c.person) && c.person.length > 0 ? c.person[0].name : null

    if (score > 0.5) {
      cycles.push({
        item_id: c.id,
        item_type: 'commitment',
        description: c.description,
        deferral_count: deferralCount,
        days_in_cycle: daysOverdue,
        emotional_charge: emotionalCharge,
        person_name: personName,
        avoidance_score: score,
      })
    }
  }

  // --- 3. Threads with retention oscillation (reset then decay repeatedly) ---
  const { data: oscillatingThreads } = await supabase
    .from('threads')
    .select('id, title, capture_count, continuity_retention, last_activity_at, created_at')
    .eq('user_id', userId)
    .in('status', ['active', 'unresolved', 'forgotten_risk'])
    .gt('capture_count', 2)
    .lt('continuity_retention', 0.4)

  for (const t of oscillatingThreads || []) {
    const daysInCycle = Math.floor((now - new Date(t.created_at).getTime()) / 86400000)
    if (daysInCycle < 14) continue

    // Partial engagements = captures beyond the first that didn't resolve
    const partialEngagements = Math.min(t.capture_count - 1, 5)
    const deferralCount = Math.max(1, Math.floor(daysInCycle / 7))

    // Emotional charge from thread's emotional readings
    const { data: threadMemoryIds } = await supabase
      .from('thread_captures')
      .select('memory_id')
      .eq('thread_id', t.id)
      .limit(10)

    let emotionalCharge = 0
    if (threadMemoryIds && threadMemoryIds.length > 0) {
      const memIds = threadMemoryIds.map(tm => tm.memory_id)
      const { data: readings } = await supabase
        .from('emotional_readings')
        .select('intensity')
        .eq('user_id', userId)
        .in('source_memory_id', memIds)

      if (readings && readings.length > 0) {
        emotionalCharge = readings.reduce((sum, r) => sum + r.intensity, 0) / readings.length
      }
    }

    const score = computeAvoidanceScore(deferralCount, daysInCycle, emotionalCharge, partialEngagements)

    if (score > 0.5) {
      cycles.push({
        item_id: t.id,
        item_type: 'thread',
        description: t.title,
        deferral_count: deferralCount,
        days_in_cycle: daysInCycle,
        emotional_charge: emotionalCharge,
        person_name: null,
        avoidance_score: score,
      })
    }
  }

  // Sort by avoidance score descending, cap to 5
  cycles.sort((a, b) => b.avoidance_score - a.avoidance_score)
  return cycles.slice(0, 5)
}

/**
 * Store detected avoidance cycles as user_patterns with pattern_type = 'commitment_pattern'.
 */
export async function storeAvoidanceCycles(userId: string, cycles: AvoidanceCycle[]): Promise<void> {
  if (cycles.length === 0) return

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  for (const cycle of cycles) {
    // Check if pattern already exists for this item
    const { data: existing } = await supabase
      .from('user_patterns')
      .select('id, evidence_count, user_response')
      .eq('user_id', userId)
      .eq('pattern_type', 'commitment_pattern')
      .eq('title', `Avoidance cycle: ${cycle.description}`)
      .single()

    if (existing) {
      if (existing.user_response === 'dismissed' || existing.user_response === 'corrected') continue

      await supabase
        .from('user_patterns')
        .update({
          confidence: cycle.avoidance_score,
          evidence_count: existing.evidence_count + 1,
          evidence_refs: [{
            item_id: cycle.item_id,
            item_type: cycle.item_type,
            deferral_count: cycle.deferral_count,
            days_in_cycle: cycle.days_in_cycle,
            emotional_charge: cycle.emotional_charge,
            person_name: cycle.person_name,
            avoidance_signal: cycle.avoidance_score,
          }],
          updated_at: now,
        })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('user_patterns')
        .insert({
          user_id: userId,
          pattern_type: 'commitment_pattern',
          title: `Avoidance cycle: ${cycle.description}`,
          description: cycle.person_name
            ? `You've returned to "${cycle.description}" (involving ${cycle.person_name}) several times without closing it.`
            : `You've returned to "${cycle.description}" several times without closing it.`,
          confidence: cycle.avoidance_score,
          evidence_count: 1,
          evidence_refs: [{
            item_id: cycle.item_id,
            item_type: cycle.item_type,
            deferral_count: cycle.deferral_count,
            days_in_cycle: cycle.days_in_cycle,
            emotional_charge: cycle.emotional_charge,
            person_name: cycle.person_name,
            avoidance_signal: cycle.avoidance_score,
          }],
          status: cycle.avoidance_score > 0.7 ? 'established' : 'emerging',
        })
    }
  }
}

// --- Helpers ---

function computeAvoidanceScore(
  deferralCount: number,
  daysInCycle: number,
  emotionalCharge: number,
  partialEngagements: number
): number {
  const D_r = Math.min(1, deferralCount / 5)
  const T_c = Math.min(1, daysInCycle / 21)
  const E_c = emotionalCharge
  const P_e = Math.min(1, partialEngagements / 3)

  return D_r * 0.30 + T_c * 0.25 + E_c * 0.25 + P_e * 0.20
}

async function getEmotionalChargeForMemory(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  sourceMemoryId: string | null
): Promise<number> {
  if (!sourceMemoryId) return 0

  const { data: readings } = await supabase
    .from('emotional_readings')
    .select('intensity')
    .eq('user_id', userId)
    .eq('source_memory_id', sourceMemoryId)

  if (!readings || readings.length === 0) return 0
  return readings.reduce((sum, r) => sum + r.intensity, 0) / readings.length
}
