import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getNeglectedRelationships,
  getEmotionallyImportantPeople,
  getUnresolvedInterpersonal,
} from '@/lib/cognition/relationship-graph'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const view = searchParams.get('view') || 'all'

  if (view === 'neglected') {
    const neglected = await getNeglectedRelationships(user.id)
    return NextResponse.json({ relationships: neglected })
  }

  if (view === 'emotional') {
    const emotional = await getEmotionallyImportantPeople(user.id)
    return NextResponse.json({ relationships: emotional })
  }

  if (view === 'unresolved') {
    const unresolved = await getUnresolvedInterpersonal(user.id)
    return NextResponse.json({ relationships: unresolved })
  }

  // Default: return all relationship edges
  const { data } = await supabase
    .from('relationship_edges')
    .select('*, person_a_details:people!relationship_edges_person_a_fkey(name), person_b_details:people!relationship_edges_person_b_fkey(name)')
    .eq('user_id', user.id)
    .order('relationship_strength', { ascending: false })
    .limit(20)

  return NextResponse.json({ relationships: data || [] })
}
