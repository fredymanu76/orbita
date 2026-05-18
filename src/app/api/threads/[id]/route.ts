import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const admin = createAdminClient()

  // Fetch thread
  const { data: thread, error } = await admin
    .from('threads')
    .select('id, title, summary, thread_type, status, continuity_score, decay_coefficient, continuity_retention, last_activity_at, capture_count, entity_count, commitment_count, importance, emotional_valence, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !thread) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  }

  // Fetch captures with memory data
  const { data: captures } = await admin
    .from('thread_captures')
    .select('id, memory_id, link_confidence, created_at')
    .eq('thread_id', id)
    .order('created_at', { ascending: true })

  let memoriesForCaptures: Record<string, unknown>[] = []
  if (captures && captures.length > 0) {
    const memoryIds = captures.map(c => c.memory_id)
    const { data: memories } = await admin
      .from('memory_items')
      .select('id, type, raw_content, summary, importance, emotional_tone, event_type, continuity_retention, created_at')
      .in('id', memoryIds)

    const memoryMap = new Map((memories || []).map(m => [m.id, m]))
    memoriesForCaptures = captures.map(c => ({
      ...c,
      memory: memoryMap.get(c.memory_id) || null,
    }))
  }

  // Fetch linked entities (people, commitments)
  const { data: entities } = await admin
    .from('thread_entities')
    .select('entity_type, entity_id')
    .eq('thread_id', id)

  const personIds = (entities || []).filter(e => e.entity_type === 'person').map(e => e.entity_id)
  const commitmentIds = (entities || []).filter(e => e.entity_type === 'commitment').map(e => e.entity_id)

  let people: { id: string; name: string; relationship: string | null }[] = []
  if (personIds.length > 0) {
    const { data } = await admin
      .from('people')
      .select('id, name, relationship')
      .in('id', personIds)
    people = data || []
  }

  let commitments: Record<string, unknown>[] = []
  if (commitmentIds.length > 0) {
    const { data } = await admin
      .from('commitments')
      .select('id, description, direction, status, due_date, person_id')
      .in('id', commitmentIds)
    commitments = data || []
  }

  return NextResponse.json({
    thread: {
      ...thread,
      captures: memoriesForCaptures,
      people,
      commitments,
    },
  })
}

const VALID_STATUSES = [
  'active', 'unresolved', 'paused', 'completed',
  'forgotten_risk', 'emotionally_sensitive', 'time_sensitive',
]

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { status } = body

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('threads')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
