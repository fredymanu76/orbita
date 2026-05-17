import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get person details
  const { data: person, error } = await supabase
    .from('people')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  // Get memories mentioning this person
  const { data: memoryPeople } = await supabase
    .from('memory_people')
    .select('memory_id')
    .eq('person_id', id)

  let memories: unknown[] = []
  if (memoryPeople && memoryPeople.length > 0) {
    const { data } = await supabase
      .from('memory_items')
      .select('id, type, raw_content, summary, created_at, importance')
      .in('id', memoryPeople.map(mp => mp.memory_id))
      .order('created_at', { ascending: false })
      .limit(20)

    memories = data || []
  }

  // Get commitments involving this person
  const { data: commitments } = await supabase
    .from('commitments')
    .select('*')
    .eq('person_id', id)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    person,
    memories,
    commitments: commitments || [],
  })
}
