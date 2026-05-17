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

  const { data: memory, error } = await supabase
    .from('memory_items')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !memory) {
    return NextResponse.json({ error: 'Memory not found' }, { status: 404 })
  }

  // Get linked people
  const { data: memoryPeople } = await supabase
    .from('memory_people')
    .select('person_id, role, people(id, name)')
    .eq('memory_id', id)

  const people = memoryPeople?.map(mp => {
    const p = mp.people as unknown as { id: string; name: string }
    return { id: p.id, name: p.name, role: mp.role }
  }) || []

  // Get linked commitments
  const { data: commitments } = await supabase
    .from('commitments')
    .select('id, description, status, due_date')
    .eq('source_memory_id', id)

  // Get linked tasks
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, status, priority')
    .eq('source_memory_id', id)

  return NextResponse.json({
    memory,
    people,
    commitments: commitments || [],
    tasks: tasks || [],
  })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('memory_items')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
