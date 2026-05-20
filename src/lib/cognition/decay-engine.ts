import { createAdminClient } from '@/lib/supabase/admin'

interface DecayableItem {
  id: string
  decay_coefficient: number
  continuity_retention: number
  last_decay_at: string
  importance?: number | null
}

/**
 * Core decay formula: D(t) = e^(-λt)
 * λ = decay_coefficient, t = days elapsed since last decay
 * Higher importance → lower λ (decays slower)
 */
export function calculateDecay(lambda: number, daysSinceLastDecay: number): number {
  return Math.exp(-lambda * daysSinceLastDecay)
}

export interface DecayModifiers {
  emotional_charge?: number    // 0-1, high = slower decay
  identity_relevance?: number  // 0-1, high = slower decay
  is_unresolved?: boolean      // open commitments resist decay
}

/**
 * Get effective decay coefficient adjusted by importance and optional modifiers.
 * Importance 1-10: higher importance = slower decay.
 *
 * Enhanced formula:
 *   effective_λ = base × importance_factor × emotional_factor × identity_factor × resolution_factor
 *
 *   emotional_factor  = 1 - (emotional_charge × 0.3)    — high emotion → 30% slower
 *   identity_factor   = 1 - (identity_relevance × 0.25) — high identity → 25% slower
 *   resolution_factor = is_unresolved ? 0.5 : 1.0       — unresolved → 50% slower
 */
export function getEffectiveDecayCoefficient(
  baseCoefficient: number,
  importance: number | null | undefined,
  modifiers?: DecayModifiers
): number {
  if (!importance || importance <= 0) {
    // Still apply modifiers even without importance
    let effective = baseCoefficient
    if (modifiers) {
      const emotionalFactor = 1 - ((modifiers.emotional_charge ?? 0) * 0.3)
      const identityFactor = 1 - ((modifiers.identity_relevance ?? 0) * 0.25)
      const resolutionFactor = modifiers.is_unresolved ? 0.5 : 1.0
      effective = baseCoefficient * emotionalFactor * identityFactor * resolutionFactor
    }
    return Math.max(0.005, effective)
  }

  // importance 10 → coefficient * 0.2 (very slow decay)
  // importance 1 → coefficient * 1.0 (normal decay)
  const importanceFactor = 1 - (importance - 1) * 0.089
  let effective = baseCoefficient * Math.max(0.2, importanceFactor)

  if (modifiers) {
    const emotionalFactor = 1 - ((modifiers.emotional_charge ?? 0) * 0.3)
    const identityFactor = 1 - ((modifiers.identity_relevance ?? 0) * 0.25)
    const resolutionFactor = modifiers.is_unresolved ? 0.5 : 1.0
    effective = effective * emotionalFactor * identityFactor * resolutionFactor
  }

  return Math.max(0.005, effective)
}

/**
 * Calculate current retention without writing to database.
 */
export function getDecayedRetention(item: DecayableItem): number {
  const lastDecay = new Date(item.last_decay_at)
  const now = new Date()
  const daysSince = (now.getTime() - lastDecay.getTime()) / (1000 * 60 * 60 * 24)

  if (daysSince <= 0) return item.continuity_retention

  const effectiveLambda = getEffectiveDecayCoefficient(
    item.decay_coefficient,
    item.importance
  )
  const decayFactor = calculateDecay(effectiveLambda, daysSince)
  return Math.max(0, Math.min(1, item.continuity_retention * decayFactor))
}

/**
 * Apply decay to an item and update in database.
 */
export async function applyDecay(
  table: string,
  item: DecayableItem
): Promise<number> {
  const newRetention = getDecayedRetention(item)
  const supabase = createAdminClient()

  await supabase
    .from(table)
    .update({
      continuity_retention: newRetention,
      last_decay_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', item.id)

  return newRetention
}

/**
 * Reset retention to 1.0 when an item is recalled, mentioned, or continued.
 */
export async function resetRetention(table: string, itemId: string): Promise<void> {
  const supabase = createAdminClient()

  await supabase
    .from(table)
    .update({
      continuity_retention: 1.0,
      last_decay_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
}

/**
 * Batch-fetch decay modifiers for a set of items from a given table.
 * Fetches emotional averages and unresolved commitment status in bulk queries
 * to avoid N+1 problems.
 */
export async function getDecayModifiers(
  userId: string,
  itemIds: string[],
  table: string
): Promise<Map<string, DecayModifiers>> {
  if (itemIds.length === 0) return new Map()

  const supabase = createAdminClient()
  const modifiersMap = new Map<string, DecayModifiers>()

  // Initialize all items with empty modifiers
  for (const id of itemIds) {
    modifiersMap.set(id, {})
  }

  if (table === 'threads') {
    // Batch fetch: average emotional intensity per thread via thread_captures → emotional_readings
    const { data: captures } = await supabase
      .from('thread_captures')
      .select('thread_id, memory_id')
      .in('thread_id', itemIds)

    if (captures && captures.length > 0) {
      const memoryIds = [...new Set(captures.map(c => c.memory_id))]

      const { data: readings } = await supabase
        .from('emotional_readings')
        .select('source_memory_id, intensity')
        .eq('user_id', userId)
        .in('source_memory_id', memoryIds)

      if (readings && readings.length > 0) {
        // Build memory → thread mapping
        const memoryToThreads = new Map<string, string[]>()
        for (const c of captures) {
          const threads = memoryToThreads.get(c.memory_id) || []
          threads.push(c.thread_id)
          memoryToThreads.set(c.memory_id, threads)
        }

        // Accumulate intensity per thread
        const threadIntensitySums = new Map<string, { sum: number; count: number }>()
        for (const r of readings) {
          if (!r.source_memory_id) continue
          const threadIds = memoryToThreads.get(r.source_memory_id) || []
          for (const tid of threadIds) {
            const acc = threadIntensitySums.get(tid) || { sum: 0, count: 0 }
            acc.sum += r.intensity
            acc.count++
            threadIntensitySums.set(tid, acc)
          }
        }

        for (const [tid, acc] of threadIntensitySums) {
          const mod = modifiersMap.get(tid) || {}
          mod.emotional_charge = acc.sum / acc.count
          modifiersMap.set(tid, mod)
        }
      }
    }

    // Batch fetch: unresolved commitments per thread via thread_entities
    const { data: threadEntities } = await supabase
      .from('thread_entities')
      .select('thread_id, entity_id')
      .in('thread_id', itemIds)
      .eq('entity_type', 'commitment')

    if (threadEntities && threadEntities.length > 0) {
      const commitmentIds = threadEntities.map(te => te.entity_id)

      const { data: activeCommitments } = await supabase
        .from('commitments')
        .select('id')
        .in('id', commitmentIds)
        .eq('status', 'active')

      if (activeCommitments && activeCommitments.length > 0) {
        const activeSet = new Set(activeCommitments.map(c => c.id))
        for (const te of threadEntities) {
          if (activeSet.has(te.entity_id)) {
            const mod = modifiersMap.get(te.thread_id) || {}
            mod.is_unresolved = true
            modifiersMap.set(te.thread_id, mod)
          }
        }
      }
    }
  }

  return modifiersMap
}

/**
 * Batch apply decay to all active items in a table.
 * Used by daily cron. Now applies emotional/identity/resolution modifiers.
 */
export async function applyDecayBatch(
  table: string,
  userId: string,
  statusField: string = 'status',
  activeStatuses: string[] = ['interrupted', 'pending']
): Promise<number> {
  const supabase = createAdminClient()

  const { data: items } = await supabase
    .from(table)
    .select('id, decay_coefficient, continuity_retention, last_decay_at, importance')
    .eq('user_id', userId)
    .in(statusField, activeStatuses)

  if (!items || items.length === 0) return 0

  // Pre-fetch modifiers for all items in batch
  const itemIds = items.map(i => i.id)
  const modifiersMap = await getDecayModifiers(userId, itemIds, table)

  let updated = 0
  for (const item of items) {
    const mods = modifiersMap.get(item.id)

    // Recalculate with modifiers
    const effectiveLambda = getEffectiveDecayCoefficient(
      item.decay_coefficient,
      item.importance,
      mods
    )
    const lastDecay = new Date(item.last_decay_at)
    const daysSince = (Date.now() - lastDecay.getTime()) / (1000 * 60 * 60 * 24)

    if (daysSince <= 0) continue

    const decayFactor = calculateDecay(effectiveLambda, daysSince)
    const newRetention = Math.max(0, Math.min(1, item.continuity_retention * decayFactor))

    if (Math.abs(newRetention - item.continuity_retention) > 0.001) {
      await supabase
        .from(table)
        .update({
          continuity_retention: newRetention,
          last_decay_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
      updated++
    }
  }

  return updated
}

/**
 * Run all decay operations for a user. Called by daily cron.
 * Covers: threads (primary), interrupted_threads (legacy), follow_ups, memories.
 */
export async function runDailyDecay(userId: string): Promise<{
  threadsDecayed: number
  legacyThreadsDecayed: number
  followUpsDecayed: number
  memoriesDecayed: number
}> {
  const [threadsDecayed, legacyThreadsDecayed, followUpsDecayed, memoriesDecayed] = await Promise.all([
    applyDecayBatch('threads', userId, 'status', ['active', 'unresolved', 'paused', 'time_sensitive', 'forgotten_risk']),
    applyDecayBatch('interrupted_threads', userId, 'status', ['interrupted']),
    applyDecayBatch('follow_up_candidates', userId, 'status', ['pending']),
    applyDecayMemories(userId),
  ])

  return { threadsDecayed, legacyThreadsDecayed, followUpsDecayed, memoriesDecayed }
}

/**
 * Apply decay specifically to memory items that have decay tracking.
 */
async function applyDecayMemories(userId: string): Promise<number> {
  const supabase = createAdminClient()

  const { data: items } = await supabase
    .from('memory_items')
    .select('id, decay_coefficient, continuity_retention, last_decay_at, importance')
    .eq('user_id', userId)
    .eq('processed', true)
    .gt('continuity_retention', 0.01)

  if (!items || items.length === 0) return 0

  let updated = 0
  for (const item of items) {
    if (!item.decay_coefficient || !item.last_decay_at) continue
    const newRetention = getDecayedRetention(item as DecayableItem)
    if (Math.abs(newRetention - (item.continuity_retention || 1)) > 0.001) {
      await supabase
        .from('memory_items')
        .update({
          continuity_retention: newRetention,
          last_decay_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
      updated++
    }
  }

  return updated
}
