import { createAdminClient } from '@/lib/supabase/admin'
import { getOpenAIClient } from '@/lib/ai/openai'
import { getRecoveryPromptStyle } from './recovery-prompts'
import { getDecayedRetention } from './decay-engine'

/**
 * Reconstruct an interrupted thread: fetch related events, commitments,
 * people, and synthesize "where you left off" via GPT-4o-mini.
 */
export async function reconstructThread(threadId: string): Promise<string> {
  const supabase = createAdminClient()

  // Fetch the thread
  const { data: thread } = await supabase
    .from('interrupted_threads')
    .select('*')
    .eq('id', threadId)
    .single()

  if (!thread) return 'Thread not found.'

  // Fetch originating memory
  const { data: originMemory } = await supabase
    .from('memory_items')
    .select('raw_content, summary, emotional_tone, created_at')
    .eq('id', thread.originating_memory_id)
    .single()

  // Fetch related memories
  const relatedMemories: { raw_content: string; summary: string | null; created_at: string }[] = []
  if (thread.related_memory_ids && thread.related_memory_ids.length > 0) {
    const { data: related } = await supabase
      .from('memory_items')
      .select('raw_content, summary, created_at')
      .in('id', thread.related_memory_ids)
      .order('created_at', { ascending: true })

    if (related) relatedMemories.push(...related)
  }

  // Fetch linked commitments
  const allMemoryIds = [
    thread.originating_memory_id,
    ...(thread.related_memory_ids || []),
  ].filter(Boolean)

  const { data: commitments } = await supabase
    .from('commitments')
    .select('description, status, due_date, direction, person_id, people(name)')
    .in('source_memory_id', allMemoryIds)

  // Fetch linked people
  const { data: memoryPeople } = await supabase
    .from('memory_people')
    .select('people(name, relationship)')
    .in('memory_id', allMemoryIds)

  // Calculate current decay level for tone
  const retention = getDecayedRetention({
    id: thread.id,
    decay_coefficient: thread.decay_coefficient,
    continuity_retention: thread.continuity_retention,
    last_decay_at: thread.updated_at,
  })

  const promptStyle = getRecoveryPromptStyle(retention)

  // Build context
  const context = [
    originMemory ? `Original context: ${originMemory.summary || originMemory.raw_content}` : '',
    originMemory?.emotional_tone ? `Emotional tone: ${originMemory.emotional_tone}` : '',
    relatedMemories.length > 0
      ? `Related events:\n${relatedMemories.map(m => `- ${m.summary || m.raw_content?.substring(0, 150)}`).join('\n')}`
      : '',
    commitments && commitments.length > 0
      ? `Linked obligations:\n${commitments.map(c => `- [${c.status}] ${c.description}${(c.people as unknown as { name: string })?.name ? ` (with ${(c.people as unknown as { name: string }).name})` : ''}`).join('\n')}`
      : '',
    memoryPeople && memoryPeople.length > 0
      ? `People involved: ${[...new Set(memoryPeople.map(mp => (mp.people as unknown as { name: string })?.name).filter(Boolean))].join(', ')}`
      : '',
  ].filter(Boolean).join('\n\n')

  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a continuity restoration assistant. Synthesize a brief summary of where the user left off on an interrupted thread. ${promptStyle.instruction}

Guidelines:
- Be concise (2-4 sentences)
- Focus on what was happening and what remains unresolved
- Mention people involved by name
- Note any obligations that are still active
- ${promptStyle.tone}
- Never say "you forgot" — use gentle language like "this appears paused" or "you may want to return to this"`,
      },
      {
        role: 'user',
        content: `Thread: "${thread.title}"\nLast active: ${thread.last_activity_at}\nRetention level: ${(retention * 100).toFixed(0)}%\n\n${context}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 200,
  })

  const reconstruction = completion.choices[0].message.content || thread.thread_summary || ''

  // Update thread with reconstruction
  await supabase
    .from('interrupted_threads')
    .update({
      thread_summary: reconstruction,
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId)

  return reconstruction
}
