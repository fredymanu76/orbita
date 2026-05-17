import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const type = searchParams.get('type')
  const personId = searchParams.get('person_id')
  const offset = (page - 1) * limit

  let query = supabase
    .from('memory_items')
    .select('*, memory_people(person_id, people(id, name))', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (type) {
    query = query.eq('type', type)
  }

  if (personId) {
    // Filter by person — need a join
    const { data: memoryIds } = await supabase
      .from('memory_people')
      .select('memory_id')
      .eq('person_id', personId)

    if (memoryIds && memoryIds.length > 0) {
      query = query.in('id', memoryIds.map(m => m.memory_id))
    } else {
      return NextResponse.json({ memories: [], total: 0, page, limit })
    }
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    memories: data,
    total: count || 0,
    page,
    limit,
  })
}
