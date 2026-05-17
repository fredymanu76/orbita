import { createAdminClient } from '@/lib/supabase/admin'
import { extractEntities } from '@/lib/ai/extract-entities'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { linkPeople, findPersonByName } from './link-entities'
import { scheduleReminders, parseDateText } from './schedule-reminders'
import { buildGraphNodes, createEdges } from '@/lib/cognition/cognitive-graph'
import { detectInterruptedThreads } from '@/lib/cognition/interruption-engine'
import { createFollowUpCandidates } from '@/lib/cognition/follow-up-detection'
import { getEffectiveDecayCoefficient } from '@/lib/cognition/decay-engine'
import { createEmotionalReading } from '@/lib/cognition/emotional-mapping'
import { calculateMemoryConfidence } from '@/lib/cognition/memory-confidence'

export async function processMemory(memoryId: string) {
  const supabase = createAdminClient()

  // 1. Fetch the memory
  const { data: memory, error } = await supabase
    .from('memory_items')
    .select('*')
    .eq('id', memoryId)
    .single()

  if (error || !memory) {
    console.error('Memory not found:', memoryId)
    return
  }

  if (memory.processed) return

  const userId = memory.user_id
  const content = memory.raw_content

  try {
    // 2. Extract entities via GPT-4o-mini
    const entities = await extractEntities(content)

    // 3. Link people
    if (entities.people.length > 0) {
      await linkPeople(supabase, userId, memoryId, entities.people)
    }

    // 4. Create commitments
    for (const commitment of entities.commitments) {
      let personId: string | null = null
      if (commitment.person_name) {
        personId = await findPersonByName(supabase, userId, commitment.person_name)
      }

      const dueDate = commitment.due_date_text
        ? parseDateText(commitment.due_date_text)
        : null

      const { data: newCommitment } = await supabase
        .from('commitments')
        .insert({
          user_id: userId,
          description: commitment.description,
          direction: commitment.direction,
          due_date: dueDate?.toISOString().split('T')[0] || null,
          source_memory_id: memoryId,
          person_id: personId,
          importance: entities.importance,
        })
        .select('id')
        .single()

      if (newCommitment && commitment.due_date_text) {
        await scheduleReminders(supabase, userId, {
          commitmentId: newCommitment.id,
          dueDateText: commitment.due_date_text,
          message: `Commitment due: ${commitment.description}`,
        })
      }
    }

    // 5. Create tasks
    for (const task of entities.tasks) {
      const dueDate = task.due_date_text
        ? parseDateText(task.due_date_text)
        : null

      const { data: newTask } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          title: task.title,
          priority: task.priority,
          due_date: dueDate?.toISOString().split('T')[0] || null,
          source_memory_id: memoryId,
        })
        .select('id')
        .single()

      if (newTask && task.due_date_text) {
        await scheduleReminders(supabase, userId, {
          taskId: newTask.id,
          dueDateText: task.due_date_text,
          message: `Task due: ${task.title}`,
        })
      }
    }

    // 6. Generate embedding
    const embedding = await generateEmbedding(content)

    // 7. Determine event type and decay coefficient
    const eventType = inferEventType(content, entities)
    const decayCoefficient = getEffectiveDecayCoefficient(0.05, entities.importance)

    // 8. Update memory with processed data + life stream fields
    await supabase
      .from('memory_items')
      .update({
        summary: entities.summary,
        importance: entities.importance,
        emotional_tone: entities.emotional_tone,
        embedding: JSON.stringify(embedding),
        event_type: eventType,
        decay_coefficient: decayCoefficient,
        continuity_retention: 1.0,
        last_decay_at: new Date().toISOString(),
        processed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memoryId)

    // 9. Build cognitive graph (non-blocking enrichment)
    try {
      await buildGraphNodes(userId, memoryId, entities)
      await createEdges(userId, memoryId, entities)
    } catch (graphError) {
      console.error('Cognitive graph error (non-fatal):', graphError)
    }

    // 10. Detect interrupted threads
    try {
      await detectInterruptedThreads(userId, memoryId)
    } catch (threadError) {
      console.error('Thread detection error (non-fatal):', threadError)
    }

    // 11. Create follow-up candidates from extracted intents
    try {
      if (entities.follow_up_intents && entities.follow_up_intents.length > 0) {
        await createFollowUpCandidates(userId, memoryId, entities.follow_up_intents)
      }
    } catch (followUpError) {
      console.error('Follow-up detection error (non-fatal):', followUpError)
    }

    // 12. Create emotional reading if emotional analysis present
    try {
      if (entities.emotional_analysis) {
        await createEmotionalReading(userId, memoryId, entities.emotional_analysis)
      }
    } catch (emotionError) {
      console.error('Emotional reading error (non-fatal):', emotionError)
    }

    // 13. Calculate memory confidence score
    try {
      await calculateMemoryConfidence(userId, memoryId)
    } catch (confidenceError) {
      console.error('Memory confidence error (non-fatal):', confidenceError)
    }

  } catch (error) {
    console.error('Error processing memory:', memoryId, error)
    // Don't mark as processed so it can be retried
  }
}

/**
 * Infer event type from content and extracted entities.
 */
function inferEventType(
  content: string,
  entities: { commitments: unknown[]; people: unknown[]; emotional_tone: string }
): string {
  const lower = content.toLowerCase()

  if (entities.commitments.length > 0) return 'promise'
  if (entities.people.length >= 2 || lower.includes('meeting') || lower.includes('discussed') || lower.includes('talked')) return 'conversation'
  if (['anxious', 'angry', 'sad', 'excited', 'overwhelmed'].some(e => entities.emotional_tone?.includes(e))) return 'emotional_shift'
  if (lower.includes('interrupt') || lower.includes('got sidetracked') || lower.includes('was in the middle')) return 'interruption'

  return 'thought'
}
