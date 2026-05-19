import { createAdminClient } from '@/lib/supabase/admin'

interface PersonGravity {
  person_id: string
  name: string
  emotional_weight: number
  dependency_score: number
  interaction_frequency: number
  avoidance_signal: number
  gravity_score: number
}

/**
 * Builds a "People Orbit" model — who matters most, who causes stress, who is neglected.
 * Deterministic scoring from existing data. No GPT calls.
 */
export async function calculateRelationalGravity(userId: string): Promise<PersonGravity[]> {
  const supabase = createAdminClient()

  // Fetch all people for this user
  const { data: people } = await supabase
    .from('people')
    .select('id, name, mention_count, last_mentioned_at, relationship')
    .eq('user_id', userId)

  if (!people || people.length === 0) return []

  const now = Date.now()
  const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString()

  // Fetch relationship edges
  const { data: edges } = await supabase
    .from('relationship_edges')
    .select('person_a, person_b, emotional_weight, interaction_frequency')
    .eq('user_id', userId)

  // Fetch commitments involving people
  const { data: commitments } = await supabase
    .from('commitments')
    .select('id, person_id, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .not('person_id', 'is', null)

  // Fetch emotional readings (30d) for valence per person
  const { data: emotionalReadings } = await supabase
    .from('emotional_readings')
    .select('source_memory_id, valence, intensity')
    .eq('user_id', userId)
    .gte('measured_at', thirtyDaysAgo)

  // Map memory_ids to people mentioned
  const { data: memoryPeople } = await supabase
    .from('memory_people')
    .select('memory_id, person_id')
    .eq('user_id', userId)

  // Build lookup: memory_id -> person_ids
  const memoryToPersons = new Map<string, string[]>()
  for (const mp of memoryPeople || []) {
    const existing = memoryToPersons.get(mp.memory_id) || []
    existing.push(mp.person_id)
    memoryToPersons.set(mp.memory_id, existing)
  }

  // Build person emotional scores from readings
  const personEmotional = new Map<string, { totalValence: number; count: number }>()
  for (const reading of emotionalReadings || []) {
    if (!reading.source_memory_id) continue
    const persons = memoryToPersons.get(reading.source_memory_id) || []
    for (const pid of persons) {
      const existing = personEmotional.get(pid) || { totalValence: 0, count: 0 }
      existing.totalValence += (reading.valence ?? 0) * (reading.intensity ?? 0.5)
      existing.count++
      personEmotional.set(pid, existing)
    }
  }

  // Build edge lookup
  const edgeLookup = new Map<string, { emotional_weight: number; interaction_frequency: number }>()
  for (const edge of edges || []) {
    edgeLookup.set(edge.person_a, {
      emotional_weight: edge.emotional_weight ?? 0,
      interaction_frequency: edge.interaction_frequency ?? 0,
    })
    edgeLookup.set(edge.person_b, {
      emotional_weight: edge.emotional_weight ?? 0,
      interaction_frequency: edge.interaction_frequency ?? 0,
    })
  }

  // Commitment count per person
  const commitmentCounts = new Map<string, number>()
  for (const c of commitments || []) {
    if (c.person_id) {
      commitmentCounts.set(c.person_id, (commitmentCounts.get(c.person_id) || 0) + 1)
    }
  }

  const gravityScores: PersonGravity[] = []

  for (const person of people) {
    // Emotional weight: from emotional readings and relationship edges
    const emo = personEmotional.get(person.id)
    const edgeData = edgeLookup.get(person.id)
    const avgEmotionalWeight = emo && emo.count > 0
      ? Math.abs(emo.totalValence / emo.count)
      : (edgeData?.emotional_weight ?? 0)

    // Dependency score: commitments involving this person
    const depCount = commitmentCounts.get(person.id) || 0
    const dependencyScore = Math.min(depCount / 5, 1)

    // Interaction frequency: mention count normalized over 30d
    const mentionCount = person.mention_count || 0
    const interactionFrequency = Math.min(mentionCount / 20, 1)

    // Avoidance signal: mentioned but no recent activity
    const lastMentioned = person.last_mentioned_at ? new Date(person.last_mentioned_at).getTime() : 0
    const daysSince = lastMentioned ? (now - lastMentioned) / 86400000 : 999
    const avoidanceSignal = (mentionCount > 3 && daysSince > 14) ? Math.min(daysSince / 30, 1) : 0

    // Composite gravity score
    const gravityScore =
      avgEmotionalWeight * 0.3 +
      dependencyScore * 0.25 +
      interactionFrequency * 0.25 +
      avoidanceSignal * 0.2

    gravityScores.push({
      person_id: person.id,
      name: person.name,
      emotional_weight: avgEmotionalWeight,
      dependency_score: dependencyScore,
      interaction_frequency: interactionFrequency,
      avoidance_signal: avoidanceSignal,
      gravity_score: gravityScore,
    })
  }

  // Sort by gravity (highest first)
  gravityScores.sort((a, b) => b.gravity_score - a.gravity_score)

  // Store as user_patterns with type 'relational_gravity'
  for (const pg of gravityScores.slice(0, 20)) {
    await supabase
      .from('user_patterns')
      .upsert({
        user_id: userId,
        pattern_type: 'relational_gravity',
        title: pg.name,
        description: buildGravityDescription(pg),
        confidence: Math.min(pg.gravity_score, 1),
        evidence_count: Math.round(pg.interaction_frequency * 20),
        evidence_refs: [{
          emotional_weight: pg.emotional_weight,
          dependency_score: pg.dependency_score,
          interaction_frequency: pg.interaction_frequency,
          avoidance_signal: pg.avoidance_signal,
          person_id: pg.person_id,
        }],
        status: pg.gravity_score > 0.5 ? 'established' : 'emerging',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,pattern_type,title',
        ignoreDuplicates: false,
      })
      .then(({ error }) => {
        // If upsert fails due to no unique constraint, try insert
        if (error) {
          // Fall back: check if exists, then update or insert
          return supabase
            .from('user_patterns')
            .select('id')
            .eq('user_id', userId)
            .eq('pattern_type', 'relational_gravity')
            .eq('title', pg.name)
            .single()
            .then(({ data: existing }) => {
              if (existing) {
                return supabase
                  .from('user_patterns')
                  .update({
                    description: buildGravityDescription(pg),
                    confidence: Math.min(pg.gravity_score, 1),
                    evidence_count: Math.round(pg.interaction_frequency * 20),
                    evidence_refs: [{
                      emotional_weight: pg.emotional_weight,
                      dependency_score: pg.dependency_score,
                      interaction_frequency: pg.interaction_frequency,
                      avoidance_signal: pg.avoidance_signal,
                      person_id: pg.person_id,
                    }],
                    status: pg.gravity_score > 0.5 ? 'established' : 'emerging',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', existing.id)
              } else {
                return supabase
                  .from('user_patterns')
                  .insert({
                    user_id: userId,
                    pattern_type: 'relational_gravity',
                    title: pg.name,
                    description: buildGravityDescription(pg),
                    confidence: Math.min(pg.gravity_score, 1),
                    evidence_count: Math.round(pg.interaction_frequency * 20),
                    evidence_refs: [{
                      emotional_weight: pg.emotional_weight,
                      dependency_score: pg.dependency_score,
                      interaction_frequency: pg.interaction_frequency,
                      avoidance_signal: pg.avoidance_signal,
                      person_id: pg.person_id,
                    }],
                    status: pg.gravity_score > 0.5 ? 'established' : 'emerging',
                  })
              }
            })
        }
      })
  }

  return gravityScores
}

function buildGravityDescription(pg: PersonGravity): string {
  if (pg.avoidance_signal > 0.5) {
    return `You haven't connected with ${pg.name} in a while.`
  }
  if (pg.dependency_score > 0.5) {
    return `${pg.name} is involved in several of your commitments.`
  }
  if (pg.emotional_weight > 0.5) {
    return `${pg.name} comes up often in emotionally significant moments.`
  }
  return `${pg.name} is part of your regular life.`
}
