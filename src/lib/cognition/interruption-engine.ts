import { createAdminClient } from '@/lib/supabase/admin'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { getDecayedRetention } from './decay-engine'
import type { InterruptedThread } from '@/lib/types'

/**
 * Thread Continuity Score:
 * TCS = (contextSimilarity × 0.35) + (temporalProximity × 0.25) +
 *       (entityOverlap × 0.20) + (obligationDependency × 0.20)
 */
function calculateTCS(
  contextSimilarity: number,
  temporalProximity: number,
  entityOverlap: number,
  obligationDependency: number
): number {
  return (
    contextSimilarity * 0.35 +
    temporalProximity * 0.25 +
    entityOverlap * 0.20 +
    obligationDependency * 0.20
  )
}

/**
 * Calculate temporal proximity score (0-1).
 * Closer events score higher.
 */
function getTemporalProximity(dateA: string, dateB: string): number {
  const diffMs = Math.abs(new Date(dateA).getTime() - new Date(dateB).getTime())
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  // Within 1 day = 1.0, 7 days = ~0.5, 30 days = ~0.1
  return Math.exp(-0.1 * diffDays)
}

/**
 * Calculate entity overlap between two sets of people.
 */
function getEntityOverlap(peopleA: string[], peopleB: string[]): number {
  if (peopleA.length === 0 && peopleB.length === 0) return 0
  const setA = new Set(peopleA)
  const intersection = peopleB.filter(p => setA.has(p))
  const union = new Set([...peopleA, ...peopleB])
  return union.size > 0 ? intersection.length / union.size : 0
}

/**
 * Detect interrupted threads for a newly processed memory.
 * Finds semantically similar recent events, clusters by entity overlap
 * and temporal proximity, detects threads with no completion evidence
 * and age > 48h.
 */
export async function detectInterruptedThreads(
  userId: string,
  memoryId: string
): Promise<void> {
  const supabase = createAdminClient()

  // Fetch the triggering memory
  const { data: memory } = await supabase
    .from('memory_items')
    .select('id, raw_content, summary, embedding, created_at, importance')
    .eq('id', memoryId)
    .single()

  if (!memory || !memory.embedding) return

  // Find semantically similar recent memories
  const { data: similar } = await supabase.rpc('match_memories', {
    query_embedding: memory.embedding,
    match_threshold: 0.4,
    match_count: 15,
    filter_user_id: userId,
  })

  if (!similar || similar.length < 2) return

  // Get people for each similar memory
  const memoryIds = similar.map((s: { id: string }) => s.id)
  const { data: memoryPeople } = await supabase
    .from('memory_people')
    .select('memory_id, person_id, people(name)')
    .in('memory_id', memoryIds)

  const peopleByMemory: Record<string, string[]> = {}
  for (const mp of memoryPeople || []) {
    if (!peopleByMemory[mp.memory_id]) peopleByMemory[mp.memory_id] = []
    peopleByMemory[mp.memory_id].push((mp.people as unknown as { name: string })?.name || mp.person_id)
  }

  // Check for commitments linked to similar memories that are still active
  const { data: activeCommitments } = await supabase
    .from('commitments')
    .select('id, source_memory_id, description')
    .eq('user_id', userId)
    .in('source_memory_id', memoryIds)
    .in('status', ['active', 'overdue'])

  const commitmentsByMemory: Record<string, string[]> = {}
  for (const c of activeCommitments || []) {
    if (c.source_memory_id) {
      if (!commitmentsByMemory[c.source_memory_id]) commitmentsByMemory[c.source_memory_id] = []
      commitmentsByMemory[c.source_memory_id].push(c.description)
    }
  }

  // Find clusters of related memories that might represent interrupted threads
  const now = new Date()
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000)

  for (const candidateMemory of similar) {
    if (candidateMemory.id === memoryId) continue

    const candidateDate = new Date(candidateMemory.created_at)
    // Only consider memories older than 48h with no recent continuation
    if (candidateDate > fortyEightHoursAgo) continue

    const contextSimilarity = candidateMemory.similarity || 0
    const temporalProximity = getTemporalProximity(memory.created_at, candidateMemory.created_at)
    const entityOverlap = getEntityOverlap(
      peopleByMemory[memory.id] || [],
      peopleByMemory[candidateMemory.id] || []
    )
    const hasUnresolvedObligation = (commitmentsByMemory[candidateMemory.id] || []).length > 0
    const obligationDependency = hasUnresolvedObligation ? 0.8 : 0.1

    const tcs = calculateTCS(contextSimilarity, temporalProximity, entityOverlap, obligationDependency)

    // Only create thread if TCS is meaningful
    if (tcs < 0.3) continue

    // Check if thread already exists for this memory
    const { data: existingThread } = await supabase
      .from('interrupted_threads')
      .select('id, related_memory_ids')
      .eq('user_id', userId)
      .eq('originating_memory_id', candidateMemory.id)
      .in('status', ['interrupted'])
      .single()

    if (existingThread) {
      // Update existing thread
      const relatedIds = new Set([...(existingThread.related_memory_ids || []), memoryId])
      await supabase
        .from('interrupted_threads')
        .update({
          related_memory_ids: Array.from(relatedIds),
          thread_continuity_score: tcs,
          interruption_score: tcs,
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingThread.id)
    } else {
      // Create new interrupted thread
      const title = candidateMemory.summary || candidateMemory.raw_content?.substring(0, 80) || 'Untitled thread'

      // Set decay coefficient inversely to importance
      const importance = candidateMemory.importance || 5
      const decayCoefficient = 0.05 * (1 - (importance - 1) * 0.089)

      await supabase.from('interrupted_threads').insert({
        user_id: userId,
        title,
        thread_summary: candidateMemory.summary,
        originating_memory_id: candidateMemory.id,
        related_memory_ids: [memoryId],
        interruption_score: tcs,
        recovery_probability: Math.min(1, tcs * 0.8),
        thread_continuity_score: tcs,
        decay_coefficient: Math.max(0.01, decayCoefficient),
        continuity_retention: 1.0,
        last_activity_at: candidateDate.toISOString(),
        status: 'interrupted',
      })
    }
  }
}

/**
 * Get interrupted threads sorted by decay-adjusted priority.
 */
export async function getInterruptedThreads(
  userId: string,
  limit: number = 10
): Promise<(InterruptedThread & { decay_adjusted_score: number })[]> {
  const supabase = createAdminClient()

  const { data: threads } = await supabase
    .from('interrupted_threads')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'interrupted')
    .order('last_activity_at', { ascending: false })
    .limit(limit * 2) // fetch more to account for filtering after decay

  if (!threads) return []

  return threads
    .map(thread => {
      const retention = getDecayedRetention({
        id: thread.id,
        decay_coefficient: thread.decay_coefficient,
        continuity_retention: thread.continuity_retention,
        last_decay_at: thread.updated_at,
        importance: null,
      })
      return {
        ...thread,
        decay_adjusted_score: thread.interruption_score * retention,
      }
    })
    .filter(t => t.decay_adjusted_score > 0.05)
    .sort((a, b) => b.decay_adjusted_score - a.decay_adjusted_score)
    .slice(0, limit)
}
