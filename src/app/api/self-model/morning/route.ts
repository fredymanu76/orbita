import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { UserState } from '@/lib/types'

const STATE_GREETINGS: Record<UserState, string> = {
  stable: "Here's what may matter today.",
  overwhelmed: 'Just one thing today.',
  isolated: 'Someone might appreciate hearing from you.',
  drifting: 'One small step today.',
  in_flow: "You're on track.",
  recovering: "Things are getting better.",
  stretched: "A few things on your plate.",
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch in parallel
  const [profileRes, stateRes, needsRes, questionsRes, nameRes] = await Promise.all([
    supabase
      .from('user_life_profile')
      .select('active_persona')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('user_state')
      .select('current_state')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('user_support_needs')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('priority', { ascending: false }),
    supabase
      .from('orbita_questions')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['pending', 'shown'])
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single(),
  ])

  const state = (stateRes.data?.current_state as UserState) || 'stable'
  const persona = profileRes.data?.active_persona || null
  const allNeeds = needsRes.data || []
  const question = questionsRes.data?.[0] || null
  const firstName = nameRes.data?.full_name?.split(' ')[0] || null

  const hour = new Date().getHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const greetingBase = `Good ${timeOfDay}${firstName ? `, ${firstName}` : ''}.`
  const greeting = `${greetingBase} ${STATE_GREETINGS[state] || STATE_GREETINGS.stable}`

  // Group support needs by morning section
  const sections: Record<string, unknown[]> = {
    people_relying: [],
    may_slip: [],
    one_to_close: null as unknown as unknown[],
    pattern_noticed: null as unknown as unknown[],
    question: null as unknown as unknown[],
  }

  for (const need of allNeeds) {
    if (need.morning_section === 'people_relying') {
      sections.people_relying.push(need)
    } else if (need.morning_section === 'may_slip') {
      sections.may_slip.push(need)
    } else if (need.morning_section === 'one_to_close' && !sections.one_to_close) {
      sections.one_to_close = need as unknown as unknown[]
    } else if (need.morning_section === 'pattern_noticed' && !sections.pattern_noticed) {
      sections.pattern_noticed = need as unknown as unknown[]
    }
  }

  // State-adaptive filtering: when overwhelmed, only top 1-2 items
  if (state === 'overwhelmed') {
    const topItems = allNeeds.slice(0, 2)
    sections.people_relying = topItems.filter(n => n.morning_section === 'people_relying')
    sections.may_slip = topItems.filter(n => n.morning_section === 'may_slip')
    if (!sections.people_relying.length && !sections.may_slip.length && topItems.length > 0) {
      sections.people_relying = [topItems[0]]
    }
    sections.one_to_close = null as unknown as unknown[]
    sections.pattern_noticed = null as unknown as unknown[]
  }

  // In-flow: minimal content
  if (state === 'in_flow') {
    sections.people_relying = sections.people_relying.slice(0, 1)
    sections.may_slip = []
    sections.one_to_close = null as unknown as unknown[]
    sections.pattern_noticed = null as unknown as unknown[]
  }

  return NextResponse.json({
    greeting,
    sections: {
      people_relying: sections.people_relying,
      may_slip: sections.may_slip,
      one_to_close: sections.one_to_close,
      pattern_noticed: sections.pattern_noticed,
      question: question,
    },
    persona,
    state,
  })
}
