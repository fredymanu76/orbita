import { createAdminClient } from '@/lib/supabase/admin'
import { ROLE_SIGNALS } from './self-model-engine'
import type { RoleTimePattern, IdentityTransition } from '@/lib/types'

export interface IdentityTransitionData {
  patterns: RoleTimePattern[]
  transitions: IdentityTransition[]
  dominant_morning_role: string | null
  dominant_evening_role: string | null
}

/**
 * Track identity transitions across time-of-day.
 *
 * Method: For each confirmed role in user_life_profile.roles, query memory_items
 * bucketed by hour, matched against ROLE_SIGNALS keywords. Adjacent role peaks
 * produce transitions. Emotional cost derived from readings at transition hours.
 */
export async function trackIdentityTransitions(userId: string): Promise<IdentityTransitionData> {
  const supabase = createAdminClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  // Fetch user's confirmed roles
  const { data: profile } = await supabase
    .from('user_life_profile')
    .select('roles')
    .eq('user_id', userId)
    .single()

  const roles: { role: string; confidence: number; evidence_count: number }[] = profile?.roles || []
  if (roles.length < 2) {
    return { patterns: [], transitions: [], dominant_morning_role: null, dominant_evening_role: null }
  }

  // Fetch recent memories with their content and timestamps
  const { data: memories } = await supabase
    .from('memory_items')
    .select('id, summary, created_at')
    .eq('user_id', userId)
    .eq('processed', true)
    .gte('created_at', thirtyDaysAgo)
    .not('summary', 'is', null)

  if (!memories || memories.length < 10) {
    return { patterns: [], transitions: [], dominant_morning_role: null, dominant_evening_role: null }
  }

  // Bucket memories by role and hour
  const roleHourCounts = new Map<string, Map<number, number>>()

  for (const role of roles) {
    const signals = ROLE_SIGNALS[role.role]
    if (!signals) continue

    const hourCounts = new Map<number, number>()
    roleHourCounts.set(role.role, hourCounts)

    for (const memory of memories) {
      const contentLower = (memory.summary || '').toLowerCase()
      const hour = new Date(memory.created_at).getHours()

      const keywordHit = signals.keywords.some(kw => contentLower.includes(kw))
      if (keywordHit) {
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1)
      }
    }
  }

  // Build RoleTimePatterns
  const patterns: RoleTimePattern[] = []

  for (const [role, hourCounts] of roleHourCounts) {
    const totalCaptures = [...hourCounts.values()].reduce((sum, c) => sum + c, 0)
    if (totalCaptures < 3) continue

    // Find peak hours (hours with above-average activity)
    const avgPerHour = totalCaptures / 24
    const peakHours: number[] = []

    for (const [hour, count] of hourCounts) {
      if (count > avgPerHour) {
        peakHours.push(hour)
      }
    }

    peakHours.sort((a, b) => a - b)

    patterns.push({
      role,
      peak_hours: peakHours,
      capture_count: totalCaptures,
    })
  }

  // Detect transitions — where one role's peak ends and another's begins
  const transitions: IdentityTransition[] = []

  // Sort patterns by earliest peak hour
  const sortedPatterns = [...patterns].sort((a, b) => {
    const aMin = a.peak_hours.length > 0 ? Math.min(...a.peak_hours) : 12
    const bMin = b.peak_hours.length > 0 ? Math.min(...b.peak_hours) : 12
    return aMin - bMin
  })

  for (let i = 0; i < sortedPatterns.length - 1; i++) {
    const current = sortedPatterns[i]
    const next = sortedPatterns[i + 1]

    if (current.peak_hours.length === 0 || next.peak_hours.length === 0) continue

    const currentMax = Math.max(...current.peak_hours)
    const nextMin = Math.min(...next.peak_hours)

    // Transition happens between the end of one role's peak and start of the next
    const transitionHour = Math.round((currentMax + nextMin) / 2)

    // Calculate frequency — how many days in the last 30 had both roles active
    const daysWithBothRoles = countDaysWithBothRoles(memories, current.role, next.role)
    const frequency = Math.round(daysWithBothRoles / 4.3) // weeks

    transitions.push({
      from_role: current.role,
      to_role: next.role,
      typical_hour: transitionHour,
      frequency,
      emotional_cost: 0, // Will be enriched below
    })
  }

  // Enrich transitions with emotional cost from readings at transition hours
  if (transitions.length > 0) {
    const { data: readings } = await supabase
      .from('emotional_readings')
      .select('intensity, measured_at')
      .eq('user_id', userId)
      .gte('measured_at', thirtyDaysAgo)

    if (readings && readings.length > 0) {
      for (const transition of transitions) {
        // Get readings within +/- 1 hour of transition
        const transitionReadings = readings.filter(r => {
          const hour = new Date(r.measured_at).getHours()
          return Math.abs(hour - transition.typical_hour) <= 1
        })

        if (transitionReadings.length > 0) {
          transition.emotional_cost =
            transitionReadings.reduce((sum, r) => sum + r.intensity, 0) / transitionReadings.length
        }
      }
    }
  }

  // Determine dominant morning/evening roles
  const morningPatterns = patterns.filter(p => p.peak_hours.some(h => h >= 6 && h < 12))
  const eveningPatterns = patterns.filter(p => p.peak_hours.some(h => h >= 17 && h <= 23))

  morningPatterns.sort((a, b) => b.capture_count - a.capture_count)
  eveningPatterns.sort((a, b) => b.capture_count - a.capture_count)

  return {
    patterns,
    transitions,
    dominant_morning_role: morningPatterns.length > 0 ? morningPatterns[0].role : null,
    dominant_evening_role: eveningPatterns.length > 0 ? eveningPatterns[0].role : null,
  }
}

/**
 * Store identity transition data in user_life_profile.daily_rhythm (existing JSONB field)
 * and user_patterns with pattern_type = 'daily_rhythm'.
 */
export async function storeIdentityTransitions(
  userId: string,
  data: IdentityTransitionData
): Promise<void> {
  if (data.patterns.length === 0) return

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // Update user_life_profile.daily_rhythm with role_time_patterns and transitions
  const { data: profile } = await supabase
    .from('user_life_profile')
    .select('daily_rhythm')
    .eq('user_id', userId)
    .single()

  if (profile) {
    const rhythm = profile.daily_rhythm || {}
    const updatedRhythm = {
      ...rhythm,
      role_time_patterns: data.patterns,
      transitions: data.transitions,
      dominant_morning_role: data.dominant_morning_role,
      dominant_evening_role: data.dominant_evening_role,
    }

    await supabase
      .from('user_life_profile')
      .update({ daily_rhythm: updatedRhythm, updated_at: now })
      .eq('user_id', userId)
  }

  // Store as user_pattern with pattern_type = 'daily_rhythm'
  if (data.transitions.length > 0) {
    const transition = data.transitions[0]
    const title = `Role transition: ${transition.from_role} → ${transition.to_role}`

    const { data: existing } = await supabase
      .from('user_patterns')
      .select('id, evidence_count, user_response')
      .eq('user_id', userId)
      .eq('pattern_type', 'daily_rhythm')
      .eq('title', title)
      .single()

    const description = data.dominant_morning_role && data.dominant_evening_role
      ? `The ${data.dominant_morning_role} part of you is most active in mornings. By mid-morning, the ${data.dominant_evening_role} takes over.`
      : `You tend to shift from ${transition.from_role} to ${transition.to_role} around ${transition.typical_hour}:00.`

    if (existing) {
      if (existing.user_response === 'dismissed' || existing.user_response === 'corrected') return

      await supabase
        .from('user_patterns')
        .update({
          description,
          confidence: Math.min(data.patterns.reduce((sum, p) => sum + p.capture_count, 0) / 30, 1),
          evidence_count: existing.evidence_count + 1,
          evidence_refs: [{ patterns: data.patterns, transitions: data.transitions }],
          updated_at: now,
        })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('user_patterns')
        .insert({
          user_id: userId,
          pattern_type: 'daily_rhythm',
          title,
          description,
          confidence: Math.min(data.patterns.reduce((sum, p) => sum + p.capture_count, 0) / 30, 1),
          evidence_count: 1,
          evidence_refs: [{ patterns: data.patterns, transitions: data.transitions }],
          status: 'emerging',
        })
    }
  }
}

// --- Helpers ---

function countDaysWithBothRoles(
  memories: { summary: string | null; created_at: string }[],
  roleA: string,
  roleB: string
): number {
  const signalsA = ROLE_SIGNALS[roleA]
  const signalsB = ROLE_SIGNALS[roleB]
  if (!signalsA || !signalsB) return 0

  const dayRoleHits = new Map<string, Set<string>>()

  for (const memory of memories) {
    const content = (memory.summary || '').toLowerCase()
    const day = memory.created_at.split('T')[0]

    if (!dayRoleHits.has(day)) {
      dayRoleHits.set(day, new Set())
    }

    if (signalsA.keywords.some(kw => content.includes(kw))) {
      dayRoleHits.get(day)!.add(roleA)
    }
    if (signalsB.keywords.some(kw => content.includes(kw))) {
      dayRoleHits.get(day)!.add(roleB)
    }
  }

  let daysWithBoth = 0
  for (const roles of dayRoleHits.values()) {
    if (roles.has(roleA) && roles.has(roleB)) {
      daysWithBoth++
    }
  }

  return daysWithBoth
}
