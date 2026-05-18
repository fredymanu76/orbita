import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const searchParams = request.nextUrl.searchParams
  const includePeople = searchParams.get('include_people') === 'true'
  const includeCaptures = searchParams.get('include_captures') === 'true'
  const statusFilter = searchParams.get('status')

  // Fetch threads from the threads table
  let query = admin
    .from('threads')
    .select('id, title, summary, thread_type, status, continuity_score, decay_coefficient, continuity_retention, last_activity_at, capture_count, entity_count, commitment_count, importance, emotional_valence, created_at, updated_at')
    .eq('user_id', user.id)
    .order('last_activity_at', { ascending: false })

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const { data: threads, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!threads || threads.length === 0) {
    return NextResponse.json({ threads: [] })
  }

  const threadIds = threads.map(t => t.id)

  // Optionally join people via thread_entities
  let peoplByThread: Record<string, { name: string }[]> = {}
  if (includePeople) {
    const { data: personEntities } = await admin
      .from('thread_entities')
      .select('thread_id, entity_id')
      .in('thread_id', threadIds)
      .eq('entity_type', 'person')

    if (personEntities && personEntities.length > 0) {
      const personIds = [...new Set(personEntities.map(pe => pe.entity_id))]
      const { data: people } = await admin
        .from('people')
        .select('id, name')
        .in('id', personIds)

      const personMap = new Map((people || []).map(p => [p.id, p.name]))

      for (const pe of personEntities) {
        const name = personMap.get(pe.entity_id)
        if (name) {
          if (!peoplByThread[pe.thread_id]) peoplByThread[pe.thread_id] = []
          peoplByThread[pe.thread_id].push({ name })
        }
      }
    }
  }

  // Optionally join captures via thread_captures -> memory_items
  let capturesByThread: Record<string, { memory: Record<string, unknown> }[]> = {}
  if (includeCaptures) {
    const { data: threadCaptures } = await admin
      .from('thread_captures')
      .select('thread_id, memory_id, link_confidence')
      .in('thread_id', threadIds)

    if (threadCaptures && threadCaptures.length > 0) {
      const memoryIds = [...new Set(threadCaptures.map(tc => tc.memory_id))]
      const { data: memories } = await admin
        .from('memory_items')
        .select('id, type, raw_content, summary, importance, emotional_tone, event_type, continuity_retention, primary_thread_id, created_at')
        .in('id', memoryIds)

      const memoryMap = new Map((memories || []).map(m => [m.id, m]))

      for (const tc of threadCaptures) {
        const memory = memoryMap.get(tc.memory_id)
        if (memory) {
          if (!capturesByThread[tc.thread_id]) capturesByThread[tc.thread_id] = []
          capturesByThread[tc.thread_id].push({ memory })
        }
      }
    }
  }

  // Assemble response
  const result = threads.map(t => ({
    ...t,
    ...(includePeople ? { people: peoplByThread[t.id] || [] } : {}),
    ...(includeCaptures ? { captures: capturesByThread[t.id] || [] } : {}),
  }))

  return NextResponse.json({ threads: result })
}
