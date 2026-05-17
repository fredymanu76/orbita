import { createAdminClient } from '@/lib/supabase/admin'
import type { RelationshipEdge } from '@/lib/types'

/**
 * Relationship strength formula:
 * R_s = (I_f × 0.4) + (E_w × 0.3) + (C_d × 0.3)
 * I_f = interaction frequency (normalized)
 * E_w = emotional weight (from emotional readings)
 * C_d = commitment density (shared obligations)
 */

/**
 * Update relationship edges when 2+ people co-occur in a memory.
 * Called from linkPeople() after people linking.
 */
export async function updateRelationshipEdges(
  userId: string,
  peopleIds: string[]
): Promise<void> {
  if (peopleIds.length < 2) return

  const supabase = createAdminClient()

  // Create/update edges for every pair
  for (let i = 0; i < peopleIds.length; i++) {
    for (let j = i + 1; j < peopleIds.length; j++) {
      // Ensure consistent ordering
      const [personA, personB] = [peopleIds[i], peopleIds[j]].sort()

      const { data: existing } = await supabase
        .from('relationship_edges')
        .select('*')
        .eq('user_id', userId)
        .eq('person_a', personA)
        .eq('person_b', personB)
        .single()

      if (existing) {
        const newFrequency = existing.interaction_frequency + 1
        const strength = calculateStrength(
          newFrequency,
          existing.emotional_weight,
          existing.continuity_score
        )

        await supabase
          .from('relationship_edges')
          .update({
            interaction_frequency: newFrequency,
            relationship_strength: strength,
            last_interaction: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
      } else {
        await supabase.from('relationship_edges').insert({
          user_id: userId,
          person_a: personA,
          person_b: personB,
          interaction_frequency: 1,
          relationship_strength: 0.1,
          emotional_weight: 0,
          continuity_score: 0,
          last_interaction: new Date().toISOString(),
        })
      }
    }
  }
}

function calculateStrength(
  interactionFrequency: number,
  emotionalWeight: number,
  commitmentDensity: number
): number {
  // Normalize interaction frequency (log scale, cap at ~50 interactions)
  const normalizedFrequency = Math.min(1, Math.log(interactionFrequency + 1) / Math.log(50))
  const normalizedEmotion = Math.min(1, emotionalWeight)
  const normalizedCommitment = Math.min(1, commitmentDensity)

  return normalizedFrequency * 0.4 + normalizedEmotion * 0.3 + normalizedCommitment * 0.3
}

/**
 * Get neglected relationships: people with declining interaction
 * and non-trivial relationship strength.
 */
export async function getNeglectedRelationships(
  userId: string,
  daysSinceLastInteraction: number = 14
): Promise<RelationshipEdge[]> {
  const supabase = createAdminClient()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysSinceLastInteraction)

  const { data } = await supabase
    .from('relationship_edges')
    .select('*')
    .eq('user_id', userId)
    .gt('relationship_strength', 0.3)
    .lt('last_interaction', cutoff.toISOString())
    .order('relationship_strength', { ascending: false })
    .limit(5)

  return data || []
}

/**
 * Get emotionally important people: relationships with high emotional weight.
 */
export async function getEmotionallyImportantPeople(
  userId: string
): Promise<RelationshipEdge[]> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('relationship_edges')
    .select('*')
    .eq('user_id', userId)
    .gt('emotional_weight', 0.5)
    .order('emotional_weight', { ascending: false })
    .limit(10)

  return data || []
}

/**
 * Get relationships with unresolved interpersonal obligations.
 */
export async function getUnresolvedInterpersonal(
  userId: string
): Promise<{ edge: RelationshipEdge; commitments: { description: string; status: string }[] }[]> {
  const supabase = createAdminClient()

  const { data: edges } = await supabase
    .from('relationship_edges')
    .select('*')
    .eq('user_id', userId)
    .gt('continuity_score', 0)
    .order('continuity_score', { ascending: false })
    .limit(10)

  if (!edges || edges.length === 0) return []

  const results: { edge: RelationshipEdge; commitments: { description: string; status: string }[] }[] = []

  for (const edge of edges) {
    const { data: commitments } = await supabase
      .from('commitments')
      .select('description, status')
      .eq('user_id', userId)
      .in('person_id', [edge.person_a, edge.person_b])
      .in('status', ['active', 'overdue'])
      .limit(5)

    if (commitments && commitments.length > 0) {
      results.push({ edge, commitments })
    }
  }

  return results
}
