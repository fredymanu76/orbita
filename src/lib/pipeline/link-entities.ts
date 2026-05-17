import { SupabaseClient } from '@supabase/supabase-js'
import type { ExtractedEntities } from '@/lib/types'
import { updateRelationshipEdges } from '@/lib/cognition/relationship-graph'

export async function linkPeople(
  supabase: SupabaseClient,
  userId: string,
  memoryId: string,
  people: ExtractedEntities['people']
) {
  const linkedPersonIds: string[] = []

  for (const person of people) {
    // Upsert person — find or create
    const { data: existing } = await supabase
      .from('people')
      .select('id, mention_count')
      .eq('user_id', userId)
      .eq('name', person.name)
      .single()

    let personId: string

    if (existing) {
      personId = existing.id
      // Update mention count and last mentioned
      await supabase
        .from('people')
        .update({
          mention_count: existing.mention_count + 1,
          last_mentioned_at: new Date().toISOString(),
          relationship: person.relationship || undefined,
          context: person.role || undefined,
        })
        .eq('id', personId)
    } else {
      const { data: newPerson } = await supabase
        .from('people')
        .insert({
          user_id: userId,
          name: person.name,
          relationship: person.relationship,
          context: person.role,
          mention_count: 1,
          last_mentioned_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (!newPerson) continue
      personId = newPerson.id
    }

    linkedPersonIds.push(personId)

    // Create memory_people link
    await supabase
      .from('memory_people')
      .upsert({
        memory_id: memoryId,
        person_id: personId,
        role: person.role,
      })
  }

  // Update relationship edges when 2+ people co-occur
  if (linkedPersonIds.length >= 2) {
    try {
      await updateRelationshipEdges(userId, linkedPersonIds)
    } catch (error) {
      console.error('Relationship edge update error (non-fatal):', error)
    }
  }
}

export async function findPersonByName(
  supabase: SupabaseClient,
  userId: string,
  name: string
): Promise<string | null> {
  const { data } = await supabase
    .from('people')
    .select('id')
    .eq('user_id', userId)
    .eq('name', name)
    .single()

  return data?.id || null
}
