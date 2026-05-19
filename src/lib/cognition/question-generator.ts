import { createAdminClient } from '@/lib/supabase/admin'
import type { UserLifeProfile } from '@/lib/types'

interface ProfileDimension {
  field: string
  label: string
  weight: number
  evidenceCount: number
}

const QUESTION_TEMPLATES: Record<string, { question: string; reason: string; expected: string }[]> = {
  roles: [
    { question: 'What are the main roles you juggle day to day?', reason: 'Helps Orbita understand your priorities', expected: 'Better morning priorities and support' },
    { question: 'Which part of your life feels most demanding right now?', reason: 'Helps surface what matters most', expected: 'More relevant daily guidance' },
  ],
  life_areas: [
    { question: 'What are the main areas of your life you want to stay on top of?', reason: 'Helps organise your world', expected: 'Better grouping of threads and people' },
    { question: 'Is there an area of your life that often gets neglected?', reason: 'Helps spot when something slips', expected: 'Timely reminders for overlooked areas' },
  ],
  persona: [
    { question: 'Would you say you\'re mostly a carer, worker, parent, founder, or something else?', reason: 'Helps Orbita adapt its tone and priorities', expected: 'More relevant insights and prompts' },
  ],
  daily_rhythm: [
    { question: 'When do you usually have the most energy during the day?', reason: 'Helps time suggestions better', expected: 'Better-timed prompts and reminders' },
    { question: 'Do your weekends look very different from weekdays?', reason: 'Helps Orbita adjust weekend behaviour', expected: 'Smarter weekend support' },
  ],
  support_style: [
    { question: 'Do you prefer direct guidance or gentle questions when Orbita surfaces things?', reason: 'Helps match your communication style', expected: 'Communication that feels right for you' },
    { question: 'How much detail do you want in the morning — just the essentials, or everything?', reason: 'Helps set the right level of information', expected: 'Morning experience tuned to you' },
  ],
}

/**
 * Generates at most 1 profile-building question if conditions are met.
 * Template-based, no GPT calls.
 */
export async function generateQuestion(userId: string, profile: UserLifeProfile): Promise<boolean> {
  const supabase = createAdminClient()

  // Guard: no question if completeness >= 80
  if (profile.completeness_score >= 80) return false

  // Guard: no pending questions
  const { data: pending } = await supabase
    .from('orbita_questions')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['pending', 'shown'])
    .limit(1)

  if (pending && pending.length > 0) return false

  // Guard: no question dismissed in last 48h
  const twoDaysAgo = new Date(Date.now() - 48 * 3600000).toISOString()
  const { data: recentDismissed } = await supabase
    .from('orbita_questions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'dismissed')
    .gte('updated_at', twoDaysAgo)
    .limit(1)

  if (recentDismissed && recentDismissed.length > 0) return false

  // Guard: user active in last 24h
  const oneDayAgo = new Date(Date.now() - 24 * 3600000).toISOString()
  const { data: recentCaptures } = await supabase
    .from('memory_items')
    .select('id')
    .eq('user_id', userId)
    .gte('created_at', oneDayAgo)
    .limit(1)

  if (!recentCaptures || recentCaptures.length === 0) return false

  // Find weakest dimension
  const dimensions: ProfileDimension[] = [
    { field: 'roles', label: 'Roles', weight: 20, evidenceCount: (profile.roles || []).length },
    { field: 'life_areas', label: 'Life Areas', weight: 20, evidenceCount: (profile.life_areas || []).length },
    { field: 'persona', label: 'Persona', weight: 20, evidenceCount: profile.active_persona ? 1 : 0 },
    { field: 'daily_rhythm', label: 'Daily Rhythm', weight: 20, evidenceCount: (profile.daily_rhythm?.peak_hours || []).length },
    { field: 'support_style', label: 'Support Style', weight: 20, evidenceCount: profile.support_style?.prefers_direct !== undefined ? 1 : 0 },
  ]

  // Sort by evidence count ascending (weakest first)
  dimensions.sort((a, b) => a.evidenceCount - b.evidenceCount)

  const weakest = dimensions[0]
  if (weakest.evidenceCount >= 3) return false

  // Pick a template for this dimension
  const templates = QUESTION_TEMPLATES[weakest.field]
  if (!templates || templates.length === 0) return false

  // Check which questions have already been asked
  const { data: askedQuestions } = await supabase
    .from('orbita_questions')
    .select('question')
    .eq('user_id', userId)
    .eq('target_field', weakest.field)

  const askedSet = new Set((askedQuestions || []).map(q => q.question))
  const available = templates.filter(t => !askedSet.has(t.question))
  if (available.length === 0) return false

  const template = available[0]

  const { error } = await supabase
    .from('orbita_questions')
    .insert({
      user_id: userId,
      question: template.question,
      reason: template.reason,
      target_field: weakest.field,
      expected_improvement: template.expected,
      status: 'pending',
    })

  if (error) {
    console.error('[QuestionGenerator] Failed to insert question:', error.message)
    return false
  }

  return true
}
