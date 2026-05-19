import { createAdminClient } from '@/lib/supabase/admin'
import { getEmotionalTrajectory } from './emotional-mapping'
import type { InputIntent, UserState } from '@/lib/types'

export interface VoiceContext {
  systemPrompt: string
  temperature: number
  maxTokens: number
}

type VoiceIntent = InputIntent | 'companion_open' | 'companion_continue'

const PERSONA_VOICE: Record<string, string> = {
  founder: 'Be direct, strategic, momentum-focused. Frame priorities as leverage.',
  carer: 'Be emotionally aware, softer pacing. Prioritise relational context.',
  worker: 'Be structured, action-oriented, deadline-aware.',
  parent: 'Be balanced, empathetic, time-conscious.',
  student: 'Be encouraging, clarity-focused.',
  faith_community: 'Be thoughtful, values-aware, community-oriented.',
  general: 'Be warm, clear, measured.',
}

const INTENT_INSTRUCTIONS: Record<string, (ctx: { prefers_direct: boolean; prefers_questions: boolean; isOverwhelmed: boolean }) => string> = {
  ask: () => "Answer from the data. Be specific — names, dates, specifics. If uncertain, say so. 2-4 sentences. Never use markdown headings.",
  reflect: ({ isOverwhelmed }) =>
    isOverwhelmed
      ? "One warm sentence. No advice unless asked."
      : "Reflect their feeling back. Connect to stated values if relevant. 2-3 sentences max.",
  converse: () => "Brief and warm. 1-2 sentences max.",
  action: ({ prefers_direct, prefers_questions }) =>
    prefers_direct
      ? "3-5 numbered priorities max. Most important first. Each point is one sentence. Use format: '1. **Title** — action'. Never use ### headings. Be specific to the user's situation, not generic advice."
      : prefers_questions
        ? "Ask what matters most to them before advising. 2-3 sentences."
        : "Give clear, specific, actionable guidance. 3-5 numbered points max. Use format: '1. **Title** — action'. Never use ### headings. Be specific to the user, not generic.",
  companion_open: () => "Open by stating continuity state. Surface threads by name. Mention unresolved commitments with people names. Never use ### headings.",
  companion_continue: () => "Only reference people, threads, facts from the data. Never fabricate. Never use ### headings.",
}

function getAdaptiveTemperature(state: UserState | null, trend: string): number {
  if (state === 'overwhelmed' || state === 'isolated') return 0.25
  if (state === 'in_flow' && trend === 'improving') return 0.45
  if (state === 'recovering') return 0.35
  return 0.3
}

function getAdaptiveMaxTokens(
  state: UserState | null,
  intent: VoiceIntent
): number {
  if (state === 'overwhelmed') return 150
  if (intent === 'reflect') return 250
  if (state === 'in_flow' && intent === 'converse') return 80
  return 300
}

/**
 * Build a voice-adapted system prompt using the user's profile, state,
 * reflections, emotional trajectory, and patterns.
 *
 * ~50ms added latency (6 parallel DB reads). Zero GPT calls.
 */
export async function buildVoiceContext(
  userId: string,
  intent: VoiceIntent = 'converse'
): Promise<VoiceContext> {
  const supabase = createAdminClient()

  // Parallel fetch — 6 queries
  const [profileRes, stateRes, reflectionsRes, trajectory, patternsRes, nameRes] = await Promise.all([
    supabase
      .from('user_life_profile')
      .select('active_persona, support_style, roles, life_areas, daily_rhythm')
      .eq('user_id', userId)
      .single(),
    supabase
      .from('user_state')
      .select('current_state, state_confidence, previous_state')
      .eq('user_id', userId)
      .single(),
    supabase
      .from('reflection_memory')
      .select('content, memory_type, confidence')
      .eq('user_id', userId)
      .eq('active', true)
      .order('confidence', { ascending: false })
      .limit(5),
    getEmotionalTrajectory(userId, 7),
    supabase
      .from('user_patterns')
      .select('title, description')
      .eq('user_id', userId)
      .in('status', ['confirmed', 'established'])
      .neq('pattern_type', 'relational_gravity')
      .order('confidence', { ascending: false })
      .limit(5),
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single(),
  ])

  const profile = profileRes.data
  const state = stateRes.data
  const reflections = reflectionsRes.data || []
  const patterns = patternsRes.data || []
  const name = nameRes.data?.full_name

  const currentState = (state?.current_state as UserState) || null
  const supportStyle = profile?.support_style as {
    prefers_direct?: boolean
    prefers_questions?: boolean
    morning_detail_level?: string
    emotional_sensitivity?: string
  } | null

  // Build prompt blocks — only include if data exists
  const blocks: string[] = []

  // IDENTITY
  const identityParts: string[] = []
  if (name) identityParts.push(`The user's name is ${name}.`)
  if (profile?.active_persona) identityParts.push(`Primary role: ${profile.active_persona}.`)
  if (profile?.roles && Array.isArray(profile.roles) && profile.roles.length > 0) {
    const otherRoles = profile.roles
      .filter((r: { role: string }) => r.role !== profile.active_persona)
      .map((r: { role: string }) => r.role)
    if (otherRoles.length > 0) identityParts.push(`Other roles: ${otherRoles.join(', ')}.`)
  }
  if (profile?.life_areas && Array.isArray(profile.life_areas) && profile.life_areas.length > 0) {
    const areas = profile.life_areas.map((a: { label: string }) => a.label).join(', ')
    identityParts.push(`Life areas: ${areas}.`)
  }
  if (identityParts.length > 0) blocks.push(identityParts.join(' '))

  // STATE
  if (currentState) {
    const stateParts: string[] = []
    stateParts.push(`Current state: ${currentState} (${Math.round((state?.state_confidence || 0) * 100)}%).`)
    stateParts.push(`Emotional trend: ${trajectory.trend}.`)
    const volatilityLabel = trajectory.volatility > 0.6 ? 'high' : trajectory.volatility > 0.3 ? 'moderate' : 'low'
    stateParts.push(`Volatility: ${volatilityLabel}.`)
    blocks.push(stateParts.join(' '))
  }

  // VALUES
  if (reflections.length > 0) {
    const values = reflections.map((r: { content: string }) => r.content).join('; ')
    blocks.push(`What the user has expressed as important: ${values}`)
  }

  // PATTERNS
  if (patterns.length > 0) {
    const patternList = patterns.map((p: { title: string; description: string }) => `${p.title} — ${p.description}`).join('; ')
    blocks.push(`Observed patterns: ${patternList}`)
  }

  // STYLE
  if (supportStyle) {
    const styleParts: string[] = []
    if (supportStyle.prefers_direct) styleParts.push('Be direct and clear.')
    else if (supportStyle.prefers_questions) styleParts.push('Use questions and gentle suggestions.')
    if (supportStyle.morning_detail_level) styleParts.push(`Detail level: ${supportStyle.morning_detail_level}.`)
    if (supportStyle.emotional_sensitivity) styleParts.push(`Emotional sensitivity: ${supportStyle.emotional_sensitivity}.`)
    if (styleParts.length > 0) blocks.push(`Communication: ${styleParts.join(' ')}`)
  }

  // TIME
  const now = new Date()
  const hours = now.getHours()
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' })
  const peakHours = profile?.daily_rhythm?.peak_hours || []
  const inPeak = Array.isArray(peakHours) && peakHours.includes(hours)
  blocks.push(`Current time: ${hours}:${minutes}, ${weekday}. ${inPeak ? 'Within their peak energy hours.' : 'Outside peak hours.'}`)

  // PERSONA VOICE
  const persona = profile?.active_persona || 'general'
  const voiceLayer = PERSONA_VOICE[persona] || PERSONA_VOICE.general
  blocks.push(voiceLayer)

  // INTENT INSTRUCTIONS
  const isOverwhelmed = currentState === 'overwhelmed'
  const intentFn = INTENT_INSTRUCTIONS[intent]
  if (intentFn) {
    blocks.push(intentFn({
      prefers_direct: supportStyle?.prefers_direct ?? true,
      prefers_questions: supportStyle?.prefers_questions ?? false,
      isOverwhelmed,
    }))
  }

  const systemPrompt = blocks.join('\n\n')
  const temperature = getAdaptiveTemperature(currentState, trajectory.trend)
  const maxTokens = getAdaptiveMaxTokens(currentState, intent)

  return { systemPrompt, temperature, maxTokens }
}
