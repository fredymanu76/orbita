import { createAdminClient } from '@/lib/supabase/admin'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { getOpenAIClient } from '@/lib/ai/openai'
import type { ExtractedEntities, SourceType } from '@/lib/types'

interface ThreadCandidate {
  id: string
  title: string
  summary: string | null
  thread_type: string
  last_activity_at: string
  similarity: number
}

/**
 * Continuity Link Confidence (CLC) — computed per-candidate.
 *
 * CLC is separate from extraction_confidence.
 * Extraction confidence = "how well did we understand the content?"
 * CLC = "how certain are we this belongs to THIS SPECIFIC thread?"
 *
 * These are different problems. Clean extraction can still produce wrong linkage.
 *
 * Requirements for automatic thread merge:
 * - extraction_confidence >= 0.6 (called before this function)
 * - CLC >= 0.8
 * - At least 2 independent signal sources
 *
 * Otherwise: create a new thread. Under-linking is always safer than wrong linkage.
 */
interface CLCBreakdown {
  semantic_similarity: number  // 0-1: embedding similarity to thread
  entity_overlap: number       // 0-1: shared people/orgs with thread
  temporal_proximity: number   // 0-1: how recently was thread active
  intent_coherence: number     // 0-1: does intent match thread type
  hint_match: number           // 0-1: does thread_hint match thread title
  source_count: number         // number of independent signals
  clc: number                  // final CLC score
}

const CLC_THRESHOLD = 0.8 // Minimum CLC for automatic thread merge
const MIN_SIGNAL_SOURCES = 2 // Must have evidence from at least 2 independent sources

/**
 * Link a processed memory to an existing thread or create a new one.
 *
 * Algorithm:
 * 1. Candidate retrieval: semantic search + entity overlap + thread_hint match
 * 2. Compute CLC per candidate: weighted combination of independent signals
 * 3. If CLC >= 0.8 AND 2+ signal sources → link to existing thread
 * 4. Otherwise → create new thread (safe default)
 * 5. Update thread aggregates
 */
export async function linkToThread(
  userId: string,
  memoryId: string,
  content: string,
  entities: ExtractedEntities,
  embedding: number[]
): Promise<string> {
  const supabase = createAdminClient()

  // 1. Gather candidate signals from multiple independent sources
  const candidateSignals = new Map<string, {
    title: string
    semantic: number
    entity: number
    temporal: number
    intent: number
    hint: number
    sources: Set<string>
  }>()

  const initCandidate = (id: string, title: string) => {
    if (!candidateSignals.has(id)) {
      candidateSignals.set(id, {
        title,
        semantic: 0,
        entity: 0,
        temporal: 0,
        intent: 0,
        hint: 0,
        sources: new Set(),
      })
    }
    return candidateSignals.get(id)!
  }

  // 1a. Semantic search against thread embeddings
  const { data: semanticMatches } = await supabase.rpc('match_threads', {
    query_embedding: JSON.stringify(embedding),
    match_threshold: 0.4, // Higher threshold — only strong semantic matches
    match_count: 5,
    filter_user_id: userId,
  })

  for (const match of (semanticMatches || []) as ThreadCandidate[]) {
    const c = initCandidate(match.id, match.title)
    c.semantic = match.similarity
    c.sources.add('semantic')
  }

  // 1b. Entity overlap — find threads linked to same people
  const factPeople = entities.people.filter(p => p.source_type === 'fact')
  if (factPeople.length > 0) {
    const { data: personIds } = await supabase
      .from('people')
      .select('id')
      .eq('user_id', userId)
      .in('name', factPeople.map(p => p.name))

    if (personIds && personIds.length > 0) {
      const { data: threadEntities } = await supabase
        .from('thread_entities')
        .select('thread_id, threads(id, title)')
        .eq('entity_type', 'person')
        .in('entity_id', personIds.map(p => p.id))

      for (const te of (threadEntities || [])) {
        const thread = te.threads as unknown as { id: string; title: string } | null
        if (!thread) continue
        const c = initCandidate(thread.id, thread.title)
        // Scale entity overlap by how many people match
        c.entity = Math.min(1.0, personIds.length * 0.4)
        c.sources.add('entity_overlap')
      }
    }
  }

  // 1c. Thread hint text match
  if (entities.thread_hint) {
    const { data: hintMatches } = await supabase
      .from('threads')
      .select('id, title, last_activity_at')
      .eq('user_id', userId)
      .not('status', 'eq', 'completed')
      .ilike('title', `%${entities.thread_hint.split(' ').slice(0, 3).join('%')}%`)
      .limit(3)

    for (const match of (hintMatches || [])) {
      const c = initCandidate(match.id, match.title)
      c.hint = 0.8 // Strong signal — thread_hint explicitly references this thread
      c.sources.add('hint_match')
    }
  }

  // 1d. Temporal proximity — threads active recently are more likely matches
  for (const [threadId, candidate] of candidateSignals) {
    const { data: threadData } = await supabase
      .from('threads')
      .select('last_activity_at')
      .eq('id', threadId)
      .single()

    if (threadData) {
      const hoursSinceActive = (Date.now() - new Date(threadData.last_activity_at).getTime()) / (1000 * 60 * 60)
      if (hoursSinceActive < 48) {
        candidate.temporal = Math.max(0, 1 - hoursSinceActive / 48)
        // Only count as independent source if the proximity is strong
        if (candidate.temporal > 0.5) {
          candidate.sources.add('temporal')
        }
      }
    }
  }

  // 1e. Intent coherence — check if thread type aligns with intent classifications
  if (entities.intent_classifications.length > 0) {
    for (const [threadId, candidate] of candidateSignals) {
      const { data: threadData } = await supabase
        .from('threads')
        .select('thread_type')
        .eq('id', threadId)
        .single()

      if (threadData) {
        const intentTypeMap: Record<string, string[]> = {
          relationship: ['relationship', 'emotional_support'],
          obligation: ['commitment', 'promise', 'admin_obligation'],
          project: ['planning', 'idea'],
          concern: ['concern', 'risk', 'unresolved_thought'],
          planning: ['planning', 'reminder'],
        }
        const matchingIntents = intentTypeMap[threadData.thread_type] || []
        if (entities.intent_classifications.some(ic => matchingIntents.includes(ic))) {
          candidate.intent = 0.7
          candidate.sources.add('intent_coherence')
        }
      }
    }
  }

  // 2. Compute CLC for each candidate
  let bestThreadId: string | null = null
  let bestCLC: CLCBreakdown | null = null
  let bestScore = 0

  for (const [threadId, signals] of candidateSignals) {
    const clcBreakdown: CLCBreakdown = {
      semantic_similarity: signals.semantic,
      entity_overlap: signals.entity,
      temporal_proximity: signals.temporal,
      intent_coherence: signals.intent,
      hint_match: signals.hint,
      source_count: signals.sources.size,
      clc: 0,
    }

    // Weighted CLC computation
    // Weights sum to 1.0: semantic (0.30) + entity (0.25) + temporal (0.15) + intent (0.15) + hint (0.15)
    clcBreakdown.clc =
      signals.semantic * 0.30 +
      signals.entity * 0.25 +
      signals.temporal * 0.15 +
      signals.intent * 0.15 +
      signals.hint * 0.15

    if (clcBreakdown.clc > bestScore) {
      bestScore = clcBreakdown.clc
      bestThreadId = threadId
      bestCLC = clcBreakdown
    }
  }

  // 3. Link or create — applying strict CLC threshold
  let threadId: string
  let linkType: SourceType = 'inference'

  if (bestThreadId && bestCLC && bestCLC.clc >= CLC_THRESHOLD && bestCLC.source_count >= MIN_SIGNAL_SOURCES) {
    // Strong enough CLC with multiple independent signals — safe to merge
    threadId = bestThreadId
    linkType = bestCLC.clc >= 0.95 ? 'fact' : 'inference'
    await linkMemoryToThread(supabase, threadId, memoryId, bestCLC.clc, linkType, userId, entities)
  } else {
    // CLC too low or insufficient signal sources — create new thread (safe default)
    threadId = await createNewThread(supabase, userId, memoryId, content, entities, embedding)
  }

  // 4. Update memory with primary thread
  await supabase
    .from('memory_items')
    .update({ primary_thread_id: threadId })
    .eq('id', memoryId)

  return threadId
}

async function linkMemoryToThread(
  supabase: ReturnType<typeof createAdminClient>,
  threadId: string,
  memoryId: string,
  clc: number,
  linkType: SourceType,
  userId: string,
  entities: ExtractedEntities
) {
  // Link capture to thread with CLC as link_confidence
  await supabase
    .from('thread_captures')
    .upsert({
      thread_id: threadId,
      memory_id: memoryId,
      link_confidence: Math.min(clc, 1.0),
    }, { onConflict: 'thread_id,memory_id' })

  // Reactivate cooling/completed threads when new capture links to them
  const { data: threadStatus } = await supabase
    .from('threads')
    .select('status')
    .eq('id', threadId)
    .single()

  if (threadStatus && (threadStatus.status === 'cooling' || threadStatus.status === 'completed')) {
    await supabase
      .from('threads')
      .update({
        status: 'active',
        continuity_retention: 1.0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId)
  }

  // Link entities (only fact-classified people)
  await linkEntitiesToThread(supabase, threadId, userId, entities)

  // Update thread aggregates
  const { count: captureCount } = await supabase
    .from('thread_captures')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId)

  const { count: entityCount } = await supabase
    .from('thread_entities')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId)

  const { count: commitmentCount } = await supabase
    .from('thread_entities')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId)
    .eq('entity_type', 'commitment')

  // Re-embed the thread with updated summary
  const { data: captures } = await supabase
    .from('thread_captures')
    .select('memory_id, memory_items(summary, raw_content)')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(10)

  const captureTexts = (captures || [])
    .map(c => {
      const mem = c.memory_items as unknown as { summary: string | null; raw_content: string } | null
      return mem?.summary || mem?.raw_content?.substring(0, 200) || ''
    })
    .filter(Boolean)

  const { data: thread } = await supabase
    .from('threads')
    .select('title')
    .eq('id', threadId)
    .single()

  const embeddingText = `${thread?.title || ''} ${captureTexts.join(' ')}`
  const newEmbedding = await generateEmbedding(embeddingText.substring(0, 8000))

  await supabase
    .from('threads')
    .update({
      capture_count: captureCount || 0,
      entity_count: entityCount || 0,
      commitment_count: commitmentCount || 0,
      last_activity_at: new Date().toISOString(),
      embedding: JSON.stringify(newEmbedding),
      importance: Math.max(entities.importance, 5),
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId)
}

async function createNewThread(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  memoryId: string,
  content: string,
  entities: ExtractedEntities,
  embedding: number[]
): Promise<string> {
  // Generate a thread title via GPT
  const title = await generateThreadTitle(content, entities)
  const threadType = inferThreadType(entities)

  const { data: thread } = await supabase
    .from('threads')
    .insert({
      user_id: userId,
      title,
      summary: entities.summary,
      thread_type: threadType,
      status: 'active',
      embedding: JSON.stringify(embedding),
      importance: entities.importance,
      emotional_valence: 0, // No longer computed from GPT emotional analysis
      capture_count: 1,
      entity_count: entities.people.length + entities.commitments.length,
      commitment_count: entities.commitments.length,
      last_activity_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  const threadId = thread!.id

  // Link the memory — self-links are always facts with confidence 1.0
  await supabase
    .from('thread_captures')
    .insert({
      thread_id: threadId,
      memory_id: memoryId,
      link_confidence: 1.0,
    })

  // Link entities
  await linkEntitiesToThread(supabase, threadId, userId, entities)

  return threadId
}

async function linkEntitiesToThread(
  supabase: ReturnType<typeof createAdminClient>,
  threadId: string,
  userId: string,
  entities: ExtractedEntities
) {
  // Only link people classified as facts
  for (const person of entities.people.filter(p => p.source_type === 'fact')) {
    const { data: personRecord } = await supabase
      .from('people')
      .select('id')
      .eq('user_id', userId)
      .eq('name', person.name)
      .single()

    if (personRecord) {
      await supabase
        .from('thread_entities')
        .upsert({
          thread_id: threadId,
          entity_type: 'person',
          entity_id: personRecord.id,
        }, { onConflict: 'thread_id,entity_type,entity_id' })
    }
  }

  // Link commitments that were created from this thread's captures
  const { data: captures } = await supabase
    .from('thread_captures')
    .select('memory_id')
    .eq('thread_id', threadId)

  if (captures && captures.length > 0) {
    const memoryIds = captures.map(c => c.memory_id)
    const { data: commitments } = await supabase
      .from('commitments')
      .select('id')
      .eq('user_id', userId)
      .in('source_memory_id', memoryIds)

    for (const commitment of (commitments || [])) {
      await supabase
        .from('thread_entities')
        .upsert({
          thread_id: threadId,
          entity_type: 'commitment',
          entity_id: commitment.id,
        }, { onConflict: 'thread_id,entity_type,entity_id' })
    }
  }
}

async function generateThreadTitle(content: string, entities: ExtractedEntities): Promise<string> {
  // If we have a thread_hint, use it directly — no GPT needed
  if (entities.thread_hint) {
    return entities.thread_hint.charAt(0).toUpperCase() + entities.thread_hint.slice(1)
  }

  // Otherwise generate via GPT (title generation only — not cognition)
  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Generate a concise 3-8 word title for this cognitive thread. The title should describe the ongoing situation or topic, not a specific event. Examples: "Andy gift voucher situation", "Parking fine dispute", "Kitchen renovation planning". Return just the title, nothing else.',
      },
      {
        role: 'user',
        content: `Content: ${content.substring(0, 500)}\nSummary: ${entities.summary}\nPeople: ${entities.people.filter(p => p.source_type === 'fact').map(p => p.name).join(', ') || 'none'}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 30,
  })

  return completion.choices[0].message.content?.trim() || entities.summary.substring(0, 60)
}

function inferThreadType(entities: ExtractedEntities): string {
  const intents = entities.intent_classifications || []

  if (intents.includes('relationship') || intents.includes('emotional_support')) return 'relationship'
  if (intents.includes('commitment') || intents.includes('promise') || intents.includes('admin_obligation')) return 'obligation'
  if (intents.includes('planning') || intents.includes('idea')) return 'planning'
  if (intents.includes('concern') || intents.includes('risk')) return 'concern'
  if (intents.includes('reminder')) return 'admin'
  if (entities.projects.length > 0) return 'project'
  if (entities.people.filter(p => p.source_type === 'fact').length >= 2) return 'relationship'
  if (entities.commitments.length > 0) return 'obligation'

  return 'general'
}
