import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Fetch all memories with processing status
  const { data: memories, error: memError } = await admin
    .from('memory_items')
    .select('id, type, raw_content, summary, processed, processing_error, extraction_confidence, primary_thread_id, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (memError) {
    return NextResponse.json({ error: memError.message }, { status: 500 })
  }

  // Check schema: does extraction_confidence column exist?
  const schemaChecks: Record<string, boolean> = {}

  // Check threads table
  const { error: threadsErr } = await admin.from('threads').select('id').limit(1)
  schemaChecks['threads_table'] = !threadsErr

  // Check thread_captures table
  const { error: tcErr } = await admin.from('thread_captures').select('id').limit(1)
  schemaChecks['thread_captures_table'] = !tcErr

  // Check extraction_confidence column
  const hasExtConf = memories && memories.length > 0
    ? 'extraction_confidence' in memories[0]
    : false
  schemaChecks['extraction_confidence_column'] = hasExtConf

  // Check processing_error column
  const hasProcErr = memories && memories.length > 0
    ? 'processing_error' in memories[0]
    : false
  schemaChecks['processing_error_column'] = hasProcErr

  // Check match_threads RPC
  const { error: rpcErr } = await admin.rpc('match_threads', {
    query_embedding: JSON.stringify(new Array(1536).fill(0)),
    match_threshold: 0.99,
    match_count: 1,
    filter_user_id: user.id,
  })
  schemaChecks['match_threads_rpc'] = !rpcErr

  // Check search_memories_text RPC
  const { error: textRpcErr } = await admin.rpc('search_memories_text', {
    search_query: 'test',
    filter_user_id: user.id,
    result_limit: 1,
  })
  schemaChecks['search_memories_text_rpc'] = !textRpcErr

  // Check source_type column on commitments
  const { data: commitTest, error: commitErr } = await admin
    .from('commitments')
    .select('source_type')
    .limit(1)
  schemaChecks['commitments_source_type_column'] = !commitErr

  // Check cognitive_graph_nodes status column
  const { error: graphErr } = await admin
    .from('cognitive_graph_nodes')
    .select('status')
    .limit(1)
  schemaChecks['graph_nodes_status_column'] = !graphErr

  // Summary stats
  const total = (memories || []).length
  const processed = (memories || []).filter(m => m.processed).length
  const failed = (memories || []).filter(m => m.processing_error).length
  const pending = total - processed

  // Counts from related tables
  const { count: threadCount } = await admin
    .from('threads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const { count: peopleCount } = await admin
    .from('people')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const { count: commitmentCount } = await admin
    .from('commitments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const { count: followUpCount } = await admin
    .from('follow_up_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  return NextResponse.json({
    schema: schemaChecks,
    stats: {
      total_memories: total,
      processed,
      pending,
      failed,
      threads: threadCount || 0,
      people: peopleCount || 0,
      commitments: commitmentCount || 0,
      follow_ups: followUpCount || 0,
    },
    memories: (memories || []).map(m => ({
      id: m.id,
      type: m.type,
      content_preview: m.raw_content?.substring(0, 100) || '',
      summary: m.summary,
      processed: m.processed,
      processing_error: m.processing_error,
      extraction_confidence: m.extraction_confidence,
      has_thread: !!m.primary_thread_id,
      created_at: m.created_at,
      updated_at: m.updated_at,
    })),
  })
}
