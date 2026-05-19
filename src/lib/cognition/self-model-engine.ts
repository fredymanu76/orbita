import { createAdminClient } from '@/lib/supabase/admin'
import { inferUserState, checkStrongSignals } from './state-engine'
import { calculateRelationalGravity } from './relational-gravity'
import { generateQuestion } from './question-generator'
import type { ExtractedEntities, PersonaMode, UserLifeProfile } from '@/lib/types'

// --- Role inference signal maps ---
const ROLE_SIGNALS: Record<string, { keywords: string[]; relationships: string[] }> = {
  parent: {
    keywords: ['school', 'kids', 'daughter', 'son', 'homework', 'pickup', 'nursery', 'childcare', 'bedtime', 'nappy'],
    relationships: ['daughter', 'son', 'child', 'kid'],
  },
  carer: {
    keywords: ['mum', 'dad', 'appointment', 'medication', 'care', 'hospital', 'surgery', 'carer', 'caring'],
    relationships: ['mother', 'father', 'parent', 'grandmother', 'grandfather'],
  },
  worker: {
    keywords: ['meeting', 'deadline', 'project', 'client', 'report', 'office', 'boss', 'salary', 'work'],
    relationships: ['colleague', 'manager', 'boss', 'coworker', 'teammate'],
  },
  founder: {
    keywords: ['startup', 'investor', 'product', 'launch', 'revenue', 'fundraise', 'pitch', 'mvp', 'traction'],
    relationships: ['cofounder', 'investor', 'advisor', 'co-founder'],
  },
  faith_community: {
    keywords: ['church', 'prayer', 'mosque', 'temple', 'pastor', 'worship', 'faith', 'sermon', 'congregation'],
    relationships: ['pastor', 'imam', 'priest', 'minister'],
  },
  student: {
    keywords: ['study', 'exam', 'course', 'lecture', 'assignment', 'university', 'college', 'tutor', 'dissertation'],
    relationships: ['tutor', 'professor', 'classmate', 'lecturer'],
  },
}

// Reflection memory patterns
const REFLECTION_PATTERNS = [
  { regex: /i want to (be|become|start|stop|do more|do less)\b/i, type: 'aspiration' as const },
  { regex: /what matters (?:to me|most) is/i, type: 'value' as const },
  { regex: /i need to (be more|be less|focus on|stop)\b/i, type: 'aspiration' as const },
  { regex: /i believe\b/i, type: 'belief' as const },
  { regex: /my (?:faith|family|health|work|career) (?:is|matters|comes first)/i, type: 'value' as const },
  { regex: /i(?:'m| am) (?:not willing|refusing|done with|setting a boundary)/i, type: 'boundary' as const },
  { regex: /i feel (?:most alive|happiest|fulfilled) when/i, type: 'identity_anchor' as const },
  { regex: /(?:home|family|children|partner|community) (?:is|are) (?:my|the most)/i, type: 'emotional_anchor' as const },
]

/**
 * A) Incremental profile update — runs after every capture (pipeline step 15).
 * Purely deterministic aggregation of existing pipeline output. No GPT calls.
 */
export async function incrementalProfileUpdate(
  userId: string,
  memoryId: string,
  entities: ExtractedEntities
): Promise<void> {
  const supabase = createAdminClient()

  // Ensure profile exists
  await supabase
    .from('user_life_profile')
    .upsert({ user_id: userId, completeness_score: 0 }, { onConflict: 'user_id', ignoreDuplicates: true })

  // Fetch current profile
  const { data: profile } = await supabase
    .from('user_life_profile')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!profile) return

  const contentLower = entities.summary?.toLowerCase() || ''
  const now = new Date().toISOString()
  const currentRoles: UserLifeProfile['roles'] = profile.roles || []
  const currentAreas: UserLifeProfile['life_areas'] = profile.life_areas || []

  // 1. Map entities to role evidence
  for (const [role, signals] of Object.entries(ROLE_SIGNALS)) {
    const keywordHit = signals.keywords.some(kw => contentLower.includes(kw))
    const relationshipHit = entities.people.some(p =>
      signals.relationships.some(r =>
        (p.relationship || '').toLowerCase().includes(r)
      )
    )

    if (keywordHit || relationshipHit) {
      const existing = currentRoles.find(r => r.role === role)
      if (existing) {
        existing.evidence_count++
        existing.last_seen = now
        existing.confidence = Math.min(existing.evidence_count / 10, 1)
      } else {
        currentRoles.push({
          role,
          confidence: 0.3,
          evidence_count: 1,
          first_seen: now,
          last_seen: now,
        })
      }
    }
  }

  // 2. Update life area evidence from organizations/projects/thread_hint
  for (const org of entities.organizations || []) {
    const existing = currentAreas.find(a => a.area === org.name.toLowerCase())
    if (existing) {
      existing.thread_count++
      existing.confidence = Math.min(existing.thread_count / 5, 1)
    } else {
      currentAreas.push({
        area: org.name.toLowerCase(),
        label: org.name,
        people: [],
        thread_count: 1,
        confidence: 0.3,
      })
    }
  }

  for (const proj of entities.projects || []) {
    const existing = currentAreas.find(a => a.area === proj.name.toLowerCase())
    if (existing) {
      existing.thread_count++
      existing.confidence = Math.min(existing.thread_count / 5, 1)
    } else {
      currentAreas.push({
        area: proj.name.toLowerCase(),
        label: proj.name,
        people: [],
        thread_count: 1,
        confidence: 0.3,
      })
    }
  }

  // Add people to life areas if they're mentioned alongside orgs/projects
  for (const area of currentAreas) {
    for (const person of entities.people) {
      if (!area.people.includes(person.name)) {
        area.people.push(person.name)
      }
    }
  }

  // 3. Update daily rhythm from capture timestamp
  const captureHour = new Date().getHours()
  const rhythm = profile.daily_rhythm || { peak_hours: [], quiet_hours: [], weekend_pattern: null }
  if (!rhythm.peak_hours.includes(captureHour)) {
    rhythm.peak_hours.push(captureHour)
    // Keep only the most frequent hours (top 6)
    if (rhythm.peak_hours.length > 6) {
      rhythm.peak_hours = rhythm.peak_hours.slice(-6)
    }
  }

  // 4. Update profile
  await supabase
    .from('user_life_profile')
    .update({
      roles: currentRoles,
      life_areas: currentAreas,
      daily_rhythm: rhythm,
      last_inference_at: now,
      updated_at: now,
    })
    .eq('user_id', userId)

  // 5. Detect pressure signals from emotional_signals intensity
  const highPressure = entities.emotional_signals.filter(s => s.intensity >= 0.7)
  if (highPressure.length > 0) {
    await upsertPattern(supabase, userId, {
      pattern_type: 'pressure_signal',
      title: 'Pressure building',
      description: `Strong ${highPressure[0].signal_type} detected in your latest capture.`,
      confidence: highPressure[0].intensity,
      evidence_refs: [{ memory_id: memoryId, signals: highPressure.map(s => s.signal_type) }],
    })
  }

  // 6. Upsert user_patterns when evidence crosses thresholds
  for (const role of currentRoles) {
    if (role.evidence_count >= 3) {
      const status = role.evidence_count >= 8 ? 'confirmed' : 'established'
      await upsertPattern(supabase, userId, {
        pattern_type: 'role',
        title: `You seem to be a ${role.role}`,
        description: `Orbita has noticed ${role.evidence_count} mentions related to being a ${role.role}.`,
        confidence: role.confidence,
        evidence_refs: [{ role: role.role, count: role.evidence_count }],
        status,
      })
    }
  }

  // 7. Generate support needs when actionable items detected
  if (entities.commitments.length > 0 && entities.people.length > 0) {
    const personName = entities.people[0].name
    await supabase
      .from('user_support_needs')
      .insert({
        user_id: userId,
        title: `${personName} is counting on you`,
        why_it_matters: `You made a commitment involving ${personName}.`,
        evidence_summary: entities.commitments[0].description,
        suggested_action: 'Check if this is still on track',
        confidence: 0.7,
        evidence_refs: [{ memory_id: memoryId, person: personName }],
        category: 'people_relying',
        morning_section: 'people_relying',
        priority: 0.7,
      })
      .then(() => {}) // fire and forget
  }

  // 8. Extract reflection memory
  await extractReflections(supabase, userId, memoryId, entities)

  // 9. Check for strong emotional signals -> immediate state update
  if (entities.emotional_signals.length > 0) {
    await checkStrongSignals(userId, entities.emotional_signals)
  }
}

/**
 * B) Full profile rebuild — runs daily in cron.
 */
export async function rebuildUserProfile(userId: string): Promise<void> {
  const supabase = createAdminClient()

  // Ensure profile exists
  await supabase
    .from('user_life_profile')
    .upsert({ user_id: userId, completeness_score: 0 }, { onConflict: 'user_id', ignoreDuplicates: true })

  const { data: profile } = await supabase
    .from('user_life_profile')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!profile) return

  const now = new Date().toISOString()

  // 1. Infer persona from accumulated role evidence
  const roles: UserLifeProfile['roles'] = profile.roles || []
  let bestRole: string | null = null
  let bestWeight = 0
  for (const role of roles) {
    if (role.confidence >= 0.6 && role.evidence_count > bestWeight) {
      bestRole = role.role
      bestWeight = role.evidence_count
    }
  }

  if (bestRole && profile.persona_source !== 'user_confirmed') {
    await supabase
      .from('user_life_profile')
      .update({
        active_persona: bestRole as PersonaMode,
        persona_confidence: Math.min(bestWeight / 10, 1),
        persona_source: 'inference',
      })
      .eq('user_id', userId)
  }

  // 2. Calculate completeness_score
  const completeness = calculateCompleteness(profile)
  await supabase
    .from('user_life_profile')
    .update({ completeness_score: completeness, last_inference_at: now, updated_at: now })
    .eq('user_id', userId)

  // 3. Generate morning support needs
  await generateMorningSupportNeeds(supabase, userId)

  // 4. Expire old support needs (>7d) and questions (>3d)
  await supabase
    .from('user_support_needs')
    .update({ status: 'expired', updated_at: now })
    .eq('user_id', userId)
    .eq('status', 'active')
    .lt('expires_at', now)

  await supabase
    .from('orbita_questions')
    .update({ status: 'expired', updated_at: now })
    .eq('user_id', userId)
    .in('status', ['pending', 'shown'])
    .lt('expires_at', now)

  // 5. Generate question if needed
  const refreshedProfile = await supabase
    .from('user_life_profile')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (refreshedProfile.data) {
    await generateQuestion(userId, refreshedProfile.data as UserLifeProfile)
  }

  // 6. Run State Engine
  await inferUserState(userId)

  // 7. Calculate relational gravity
  await calculateRelationalGravity(userId)

  // 8. Detect behavioral patterns from existing data
  await detectBehavioralPatterns(supabase, userId)

  // 9. Decay old reflection memories if contradicted
  await supabase
    .from('reflection_memory')
    .update({ active: false, updated_at: now })
    .eq('user_id', userId)
    .eq('active', true)
    .lt('updated_at', new Date(Date.now() - 90 * 86400000).toISOString())
}

function calculateCompleteness(profile: UserLifeProfile): number {
  let score = 0

  // Roles: 20%
  const rolesCount = (profile.roles || []).length
  score += Math.min(rolesCount / 3, 1) * 20

  // Life areas: 20%
  const areasCount = (profile.life_areas || []).length
  score += Math.min(areasCount / 3, 1) * 20

  // Persona: 20%
  if (profile.active_persona) score += 20

  // Daily rhythm: 20%
  const rhythmHours = (profile.daily_rhythm?.peak_hours || []).length
  score += Math.min(rhythmHours / 3, 1) * 20

  // Support style: 20%
  if (profile.support_style && typeof profile.support_style === 'object') {
    score += 20
  }

  return Math.round(score)
}

async function generateMorningSupportNeeds(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<void> {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]

  // People relying: active commitments with people, due soon
  const { data: dueSoon } = await supabase
    .from('commitments')
    .select('id, description, person_id, due_date')
    .eq('user_id', userId)
    .eq('status', 'active')
    .not('person_id', 'is', null)
    .lte('due_date', new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0])
    .order('due_date', { ascending: true })
    .limit(3)

  for (const commitment of dueSoon || []) {
    // Get person name
    const { data: person } = await supabase
      .from('people')
      .select('name')
      .eq('id', commitment.person_id!)
      .single()

    if (person) {
      await supabase.from('user_support_needs').insert({
        user_id: userId,
        title: `${person.name} is counting on you`,
        why_it_matters: commitment.due_date === todayStr
          ? 'This is due today.'
          : `This is due ${commitment.due_date}.`,
        evidence_summary: commitment.description,
        suggested_action: 'Follow up or complete this',
        confidence: 0.8,
        evidence_refs: [{ commitment_id: commitment.id, person_name: person.name }],
        category: 'people_relying',
        morning_section: 'people_relying',
        priority: commitment.due_date === todayStr ? 0.9 : 0.7,
      })
    }
  }

  // May slip: threads with low retention
  const { data: slippingThreads } = await supabase
    .from('threads')
    .select('id, title, continuity_retention, last_activity_at')
    .eq('user_id', userId)
    .in('status', ['active', 'forgotten_risk'])
    .lt('continuity_retention', 0.4)
    .order('continuity_retention', { ascending: true })
    .limit(2)

  for (const thread of slippingThreads || []) {
    await supabase.from('user_support_needs').insert({
      user_id: userId,
      title: `"${thread.title}" is slipping`,
      why_it_matters: `Freshness is at ${Math.round(thread.continuity_retention * 100)}%.`,
      evidence_summary: `Last activity: ${thread.last_activity_at}`,
      suggested_action: 'Add an update or close it',
      confidence: 0.7,
      evidence_refs: [{ thread_id: thread.id }],
      category: 'things_slipping',
      morning_section: 'may_slip',
      priority: 0.6,
    })
  }

  // One to close: easiest thread to resolve
  const { data: easyClose } = await supabase
    .from('threads')
    .select('id, title, capture_count, commitment_count')
    .eq('user_id', userId)
    .in('status', ['active', 'unresolved'])
    .lte('commitment_count', 1)
    .lte('capture_count', 3)
    .order('capture_count', { ascending: true })
    .limit(1)
    .single()

  if (easyClose) {
    await supabase.from('user_support_needs').insert({
      user_id: userId,
      title: `Close "${easyClose.title}"`,
      why_it_matters: 'This looks like a quick one to finish.',
      evidence_summary: `${easyClose.capture_count} captures, ${easyClose.commitment_count} commitments`,
      suggested_action: 'Resolve it and clear the loop',
      confidence: 0.6,
      evidence_refs: [{ thread_id: easyClose.id }],
      category: 'closure_opportunity',
      morning_section: 'one_to_close',
      priority: 0.5,
    })
  }
}

async function upsertPattern(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  data: {
    pattern_type: string
    title: string
    description: string
    confidence: number
    evidence_refs: Record<string, unknown>[]
    status?: string
  }
): Promise<void> {
  // Check if pattern already exists
  const { data: existing } = await supabase
    .from('user_patterns')
    .select('id, evidence_count, status, user_response')
    .eq('user_id', userId)
    .eq('pattern_type', data.pattern_type)
    .eq('title', data.title)
    .single()

  if (existing) {
    // Don't update dismissed/corrected patterns
    if (existing.user_response === 'dismissed' || existing.user_response === 'corrected') return

    await supabase
      .from('user_patterns')
      .update({
        description: data.description,
        confidence: data.confidence,
        evidence_count: existing.evidence_count + 1,
        evidence_refs: data.evidence_refs,
        status: data.status || existing.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('user_patterns')
      .insert({
        user_id: userId,
        pattern_type: data.pattern_type,
        title: data.title,
        description: data.description,
        confidence: data.confidence,
        evidence_count: 1,
        evidence_refs: data.evidence_refs,
        status: data.status || 'emerging',
      })
  }
}

/**
 * Detect behavioral patterns from existing data. Deterministic, no GPT.
 *
 * 3 patterns:
 * 1. "Works in bursts" — stddev of daily captures > 2x mean, with zero-days adjacent to high-days
 * 2. "Carries emotional load for others" — >60% of negative readings have associated people
 * 3. "Evening cognitive load builds" — avg intensity 18-23 > 1.5x avg intensity 6-12
 */
async function detectBehavioralPatterns(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<void> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  // --- Pattern 1: Works in bursts ---
  const { data: memories } = await supabase
    .from('memory_items')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo)

  if (memories && memories.length >= 10) {
    // Count captures per day
    const dayCounts = new Map<string, number>()
    for (const m of memories) {
      const day = m.created_at.split('T')[0]
      dayCounts.set(day, (dayCounts.get(day) || 0) + 1)
    }

    // Fill in zero-days for the 30-day span
    const counts: number[] = []
    const start = new Date(Date.now() - 30 * 86400000)
    for (let i = 0; i < 30; i++) {
      const d = new Date(start.getTime() + i * 86400000)
      const key = d.toISOString().split('T')[0]
      counts.push(dayCounts.get(key) || 0)
    }

    const mean = counts.reduce((s, c) => s + c, 0) / counts.length
    if (mean > 0) {
      const variance = counts.reduce((s, c) => s + (c - mean) ** 2, 0) / counts.length
      const stddev = Math.sqrt(variance)

      // Check for zero-days adjacent to high-days
      let hasAdjacentPattern = false
      for (let i = 1; i < counts.length; i++) {
        if ((counts[i] === 0 && counts[i - 1] > mean * 2) ||
            (counts[i] > mean * 2 && counts[i - 1] === 0)) {
          hasAdjacentPattern = true
          break
        }
      }

      if (stddev > 2 * mean && hasAdjacentPattern) {
        await upsertPattern(supabase, userId, {
          pattern_type: 'daily_rhythm',
          title: 'You tend to work in intense bursts rather than steady rhythms',
          description: `Over the last 30 days, your activity varies widely — some days are very active while adjacent days are quiet.`,
          confidence: Math.min(stddev / (3 * mean), 1),
          evidence_refs: [{ mean_daily: Math.round(mean * 10) / 10, stddev: Math.round(stddev * 10) / 10, days_analysed: 30 }],
          status: 'established',
        })
      }
    }
  }

  // --- Pattern 2: Carries emotional load for others ---
  const { data: negativeReadings } = await supabase
    .from('emotional_readings')
    .select('id, source_memory_id')
    .eq('user_id', userId)
    .lt('valence', -0.3)
    .gte('measured_at', thirtyDaysAgo)

  if (negativeReadings && negativeReadings.length >= 5) {
    const memoryIds = negativeReadings
      .map(r => r.source_memory_id)
      .filter((id): id is string => id !== null)

    if (memoryIds.length > 0) {
      const { data: peopleLinks } = await supabase
        .from('memory_people')
        .select('memory_id')
        .eq('user_id', userId)
        .in('memory_id', memoryIds)

      const memoriesWithPeople = new Set((peopleLinks || []).map(l => l.memory_id))
      const fractionWithPeople = memoriesWithPeople.size / memoryIds.length

      if (fractionWithPeople > 0.6) {
        await upsertPattern(supabase, userId, {
          pattern_type: 'emotional_pattern',
          title: 'You often carry emotional weight connected to others',
          description: `${Math.round(fractionWithPeople * 100)}% of your negative emotional readings are associated with other people.`,
          confidence: Math.min(fractionWithPeople, 1),
          evidence_refs: [{ fraction: Math.round(fractionWithPeople * 100), negative_readings: negativeReadings.length }],
          status: 'established',
        })
      }
    }
  }

  // --- Pattern 3: Evening cognitive load builds ---
  const { data: allReadings } = await supabase
    .from('emotional_readings')
    .select('intensity, measured_at')
    .eq('user_id', userId)
    .gte('measured_at', thirtyDaysAgo)

  if (allReadings && allReadings.length >= 10) {
    let morningSum = 0, morningCount = 0
    let eveningSum = 0, eveningCount = 0

    for (const r of allReadings) {
      const hour = new Date(r.measured_at).getHours()
      if (hour >= 6 && hour < 12) {
        morningSum += r.intensity
        morningCount++
      } else if (hour >= 18 && hour <= 23) {
        eveningSum += r.intensity
        eveningCount++
      }
    }

    if (morningCount >= 3 && eveningCount >= 3) {
      const morningAvg = morningSum / morningCount
      const eveningAvg = eveningSum / eveningCount

      if (morningAvg > 0 && eveningAvg > morningAvg * 1.5) {
        await upsertPattern(supabase, userId, {
          pattern_type: 'daily_rhythm',
          title: 'Your mental load tends to build through the day',
          description: `Evening emotional intensity (${Math.round(eveningAvg * 100) / 100}) is significantly higher than morning (${Math.round(morningAvg * 100) / 100}).`,
          confidence: Math.min(eveningAvg / morningAvg / 3, 1),
          evidence_refs: [{ morning_avg: Math.round(morningAvg * 100) / 100, evening_avg: Math.round(eveningAvg * 100) / 100 }],
          status: 'established',
        })
      }
    }
  }
}

async function extractReflections(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  memoryId: string,
  entities: ExtractedEntities
): Promise<void> {
  // Only extract from reflective/emotional captures
  const hasReflective = entities.intent_classifications.some(i =>
    ['reflection', 'emotional_support', 'concern'].includes(i)
  )
  if (!hasReflective) return

  const content = entities.summary || ''

  for (const pattern of REFLECTION_PATTERNS) {
    if (pattern.regex.test(content)) {
      // Extract the sentence containing the match
      const sentences = content.split(/[.!?]+/).filter(Boolean)
      const matchingSentence = sentences.find(s => pattern.regex.test(s))

      if (matchingSentence) {
        // Check for duplicates
        const { data: existing } = await supabase
          .from('reflection_memory')
          .select('id')
          .eq('user_id', userId)
          .eq('content', matchingSentence.trim())
          .limit(1)

        if (!existing || existing.length === 0) {
          await supabase
            .from('reflection_memory')
            .insert({
              user_id: userId,
              memory_type: pattern.type,
              content: matchingSentence.trim(),
              source_memory_id: memoryId,
              confidence: 0.6,
              source_type: 'inference',
              active: true,
            })
        }
      }
    }
  }
}
