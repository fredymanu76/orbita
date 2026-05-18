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

/**
 * Get effective decay coefficient adjusted by importance.
 * Importance 1-10: higher importance = slower decay.
 */
export function getEffectiveDecayCoefficient(
  baseCoefficient: number,
  importance: number | null | undefined
): number {
  if (!importance || importance <= 0) return baseCoefficient
  // importance 10 → coefficient * 0.2 (very slow decay)
  // importance 1 → coefficient * 1.0 (normal decay)
  const importanceFactor = 1 - (importance - 1) * 0.089
  return baseCoefficient * Math.max(0.2, importanceFactor)
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
 * Batch apply decay to all active items in a table.
 * Used by daily cron.
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

  let updated = 0
  for (const item of items) {
    const newRetention = getDecayedRetention(item as DecayableItem)
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
