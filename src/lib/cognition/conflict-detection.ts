import { createAdminClient } from '@/lib/supabase/admin'
import type { RecurringConflict } from '@/lib/types'

/**
 * Detect recurring interpersonal conflict cycles.
 *
 * Method: Sliding window over 60 days of emotional_readings joined with memory_people.
 * A "conflict window" = 2+ negative readings within 3 days linked to the same person.
 * If 2+ conflict windows found with avg interval < 30 days → recurring conflict.
 *
 * Scoring:
 *   C_p = (O_c * 0.35) + (R_r * 0.30) + (E_i * 0.35)
 *
 *   O_c = min(1, occurrence_count / 4)        — frequency normalised
 *   R_r = min(1, 28 / avg_interval_days)       — regularity (shorter = higher)
 *   E_i = emotional_intensity (0-1)            — emotional weight
 */
export async function detectRecurringConflicts(userId: string): Promise<RecurringConflict[]> {
  const supabase = createAdminClient()
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString()

  // Fetch negative emotional readings (valence < -0.3) from last 60 days
  const { data: negativeReadings } = await supabase
    .from('emotional_readings')
    .select('id, source_memory_id, intensity, valence, emotion, measured_at')
    .eq('user_id', userId)
    .lt('valence', -0.3)
    .gte('measured_at', sixtyDaysAgo)
    .order('measured_at', { ascending: true })

  if (!negativeReadings || negativeReadings.length < 2) return []

  // Get memory IDs for joining with people
  const memoryIds = negativeReadings
    .map(r => r.source_memory_id)
    .filter((id): id is string => id !== null)

  if (memoryIds.length === 0) return []

  // Batch fetch people linked to these memories
  const { data: memoryPeopleLinks } = await supabase
    .from('memory_people')
    .select('memory_id, person_id')
    .in('memory_id', memoryIds)

  if (!memoryPeopleLinks || memoryPeopleLinks.length === 0) return []

  // Build memory → person_id mapping
  const memoryToPersonIds = new Map<string, string[]>()
  for (const link of memoryPeopleLinks) {
    const personIds = memoryToPersonIds.get(link.memory_id) || []
    personIds.push(link.person_id)
    memoryToPersonIds.set(link.memory_id, personIds)
  }

  // Group negative readings by person
  interface PersonReading {
    intensity: number
    emotion: string
    measured_at: string
  }

  const personReadings = new Map<string, PersonReading[]>()

  for (const reading of negativeReadings) {
    if (!reading.source_memory_id) continue
    const personIds = memoryToPersonIds.get(reading.source_memory_id) || []

    for (const personId of personIds) {
      const readings = personReadings.get(personId) || []
      readings.push({
        intensity: reading.intensity,
        emotion: reading.emotion,
        measured_at: reading.measured_at,
      })
      personReadings.set(personId, readings)
    }
  }

  // Detect conflict windows per person
  // A conflict window = 2+ negative readings within a 3-day span
  const conflicts: RecurringConflict[] = []
  const uniquePersonIds = [...personReadings.keys()]

  // Batch fetch person names
  const { data: people } = await supabase
    .from('people')
    .select('id, name')
    .in('id', uniquePersonIds)

  const personNameMap = new Map<string, string>()
  for (const p of people || []) {
    personNameMap.set(p.id, p.name)
  }

  for (const [personId, readings] of personReadings) {
    if (readings.length < 2) continue

    // Sort by date
    readings.sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime())

    // Find conflict windows (clusters of 2+ readings within 3 days)
    const windows: { start: Date; readings: PersonReading[] }[] = []
    let currentWindow: { start: Date; readings: PersonReading[] } | null = null

    for (const reading of readings) {
      const readingDate = new Date(reading.measured_at)

      if (!currentWindow) {
        currentWindow = { start: readingDate, readings: [reading] }
      } else {
        const daysSinceWindowStart = (readingDate.getTime() - currentWindow.start.getTime()) / 86400000
        if (daysSinceWindowStart <= 3) {
          currentWindow.readings.push(reading)
        } else {
          // Close current window if it qualifies (2+ readings)
          if (currentWindow.readings.length >= 2) {
            windows.push(currentWindow)
          }
          currentWindow = { start: readingDate, readings: [reading] }
        }
      }
    }
    // Don't forget the last window
    if (currentWindow && currentWindow.readings.length >= 2) {
      windows.push(currentWindow)
    }

    // Need 2+ conflict windows for a recurring pattern
    if (windows.length < 2) continue

    // Calculate average interval between windows
    let totalInterval = 0
    for (let i = 1; i < windows.length; i++) {
      totalInterval += (windows[i].start.getTime() - windows[i - 1].start.getTime()) / 86400000
    }
    const avgInterval = totalInterval / (windows.length - 1)

    // Only flag if avg interval < 30 days (recurring within a month)
    if (avgInterval >= 30) continue

    // Calculate average emotional intensity across all windows
    const allWindowReadings = windows.flatMap(w => w.readings)
    const avgIntensity = allWindowReadings.reduce((sum, r) => sum + r.intensity, 0) / allWindowReadings.length

    // Collect topic clusters from emotions
    const topicCluster = [...new Set(allWindowReadings.map(r => r.emotion))]

    // Score
    const O_c = Math.min(1, windows.length / 4)
    const R_r = Math.min(1, 28 / avgInterval)
    const E_i = avgIntensity
    const patternConfidence = O_c * 0.35 + R_r * 0.30 + E_i * 0.35

    if (patternConfidence > 0.4) {
      conflicts.push({
        person_id: personId,
        person_name: personNameMap.get(personId) || 'Unknown',
        topic_cluster: topicCluster,
        occurrence_count: windows.length,
        average_interval_days: Math.round(avgInterval),
        emotional_intensity: avgIntensity,
        pattern_confidence: patternConfidence,
      })
    }
  }

  // Sort by confidence descending
  conflicts.sort((a, b) => b.pattern_confidence - a.pattern_confidence)
  return conflicts.slice(0, 5)
}

/**
 * Store detected conflicts as user_patterns (relationship_pattern) and user_support_needs.
 */
export async function storeRecurringConflicts(
  userId: string,
  conflicts: RecurringConflict[]
): Promise<void> {
  if (conflicts.length === 0) return

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  for (const conflict of conflicts) {
    // Upsert user_pattern with pattern_type = 'relationship_pattern'
    const title = `Recurring tension with ${conflict.person_name}`

    const { data: existing } = await supabase
      .from('user_patterns')
      .select('id, evidence_count, user_response')
      .eq('user_id', userId)
      .eq('pattern_type', 'relationship_pattern')
      .eq('title', title)
      .single()

    const evidenceRefs = [{
      person_id: conflict.person_id,
      person_name: conflict.person_name,
      topic_cluster: conflict.topic_cluster,
      occurrence_count: conflict.occurrence_count,
      average_interval_days: conflict.average_interval_days,
      emotional_intensity: conflict.emotional_intensity,
    }]

    if (existing) {
      if (existing.user_response === 'dismissed' || existing.user_response === 'corrected') continue

      await supabase
        .from('user_patterns')
        .update({
          description: `Tension with ${conflict.person_name} tends to re-emerge around ${conflict.topic_cluster.join(', ')}. It has occurred ${conflict.occurrence_count} times, roughly every ${conflict.average_interval_days} days.`,
          confidence: conflict.pattern_confidence,
          evidence_count: existing.evidence_count + 1,
          evidence_refs: evidenceRefs,
          updated_at: now,
        })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('user_patterns')
        .insert({
          user_id: userId,
          pattern_type: 'relationship_pattern',
          title,
          description: `Tension with ${conflict.person_name} tends to re-emerge around ${conflict.topic_cluster.join(', ')}. It has occurred ${conflict.occurrence_count} times, roughly every ${conflict.average_interval_days} days.`,
          confidence: conflict.pattern_confidence,
          evidence_count: 1,
          evidence_refs: evidenceRefs,
          status: conflict.pattern_confidence > 0.7 ? 'established' : 'emerging',
        })
    }

    // Also create a support need for high-confidence conflicts
    if (conflict.pattern_confidence > 0.6) {
      await supabase
        .from('user_support_needs')
        .insert({
          user_id: userId,
          title: `Recurring tension with ${conflict.person_name}`,
          why_it_matters: `This pattern has emerged ${conflict.occurrence_count} times over the last 60 days.`,
          evidence_summary: `Topics: ${conflict.topic_cluster.join(', ')}. Average interval: ${conflict.average_interval_days} days.`,
          suggested_action: 'Consider whether this pattern needs addressing',
          confidence: conflict.pattern_confidence,
          evidence_refs: evidenceRefs,
          category: 'relationship_health',
          morning_section: null,
          priority: conflict.pattern_confidence,
        })
    }
  }
}
