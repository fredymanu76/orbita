import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Memory Confidence Score:
 * M_c = (corroboration × 0.4) + (temporal_consistency × 0.3) +
 *       (emotional_certainty × 0.2) + (recurrence × 0.1)
 *
 * Called after embedding generation — checks for similar memories
 * that corroborate this one.
 */
export async function calculateMemoryConfidence(
  userId: string,
  memoryId: string
): Promise<number> {
  const supabase = createAdminClient()

  // Fetch the memory
  const { data: memory } = await supabase
    .from('memory_items')
    .select('id, embedding, emotional_tone, importance, created_at')
    .eq('id', memoryId)
    .single()

  if (!memory || !memory.embedding) return 0.5

  // Find corroborating memories (similar content)
  const { data: similar } = await supabase.rpc('match_memories', {
    query_embedding: memory.embedding,
    match_threshold: 0.6,
    match_count: 5,
    filter_user_id: userId,
  })

  // Exclude self
  const corroborating = (similar || []).filter((s: { id: string }) => s.id !== memoryId)
  const corroborationScore = Math.min(1, corroborating.length * 0.3)

  // Update corroboration counts on similar memories
  for (const sim of corroborating) {
    await supabase
      .from('memory_items')
      .update({
        corroboration_count: (sim.corroboration_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sim.id)
  }

  // Temporal consistency: how close in time are corroborating memories?
  let temporalConsistency = 0.5
  if (corroborating.length > 0) {
    const memDate = new Date(memory.created_at).getTime()
    const avgDistance = corroborating.reduce((sum: number, s: { created_at: string }) => {
      return sum + Math.abs(new Date(s.created_at).getTime() - memDate) / (1000 * 60 * 60 * 24)
    }, 0) / corroborating.length
    temporalConsistency = Math.exp(-0.05 * avgDistance)
  }

  // Emotional certainty: stronger emotional tone = higher certainty
  const emotionalCertainty = memory.emotional_tone && memory.emotional_tone !== 'neutral' ? 0.7 : 0.4

  // Recurrence: check if similar content has been captured before
  const recurrenceScore = Math.min(1, corroborating.length * 0.2)

  // Calculate final confidence
  const confidence = Math.min(1, Math.max(0,
    corroborationScore * 0.4 +
    temporalConsistency * 0.3 +
    emotionalCertainty * 0.2 +
    recurrenceScore * 0.1
  ))

  // Update the memory with confidence score
  await supabase
    .from('memory_items')
    .update({
      confidence_score: confidence,
      recurrence_count: corroborating.length,
      updated_at: new Date().toISOString(),
    })
    .eq('id', memoryId)

  return confidence
}
