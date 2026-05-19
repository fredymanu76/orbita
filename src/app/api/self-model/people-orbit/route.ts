import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch relational gravity patterns
  const { data: patterns, error } = await supabase
    .from('user_patterns')
    .select('*')
    .eq('user_id', user.id)
    .eq('pattern_type', 'relational_gravity')
    .order('confidence', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Transform into orbit structure
  const orbit = (patterns || []).map(p => {
    const refs = (p.evidence_refs as Record<string, unknown>[])?.[0] || {}
    return {
      name: p.title,
      person_id: refs.person_id as string || null,
      gravity_score: p.confidence,
      emotional_weight: refs.emotional_weight as number || 0,
      dependency_score: refs.dependency_score as number || 0,
      interaction_frequency: refs.interaction_frequency as number || 0,
      avoidance_signal: refs.avoidance_signal as number || 0,
      orbit: p.confidence > 0.6 ? 'inner' : p.confidence > 0.3 ? 'middle' : 'outer',
    }
  })

  return NextResponse.json({ orbit })
}
