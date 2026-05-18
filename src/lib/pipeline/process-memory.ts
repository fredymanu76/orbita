import { createAdminClient } from '@/lib/supabase/admin'
import { extractEntities } from '@/lib/ai/extract-entities'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { linkPeople, findPersonByName } from './link-entities'
import { scheduleReminders, parseDateText } from './schedule-reminders'
import { buildGraphNodes, createEdges } from '@/lib/cognition/cognitive-graph'
import { detectInterruptedThreads } from '@/lib/cognition/interruption-engine'
import { createFollowUpCandidates } from '@/lib/cognition/follow-up-detection'
import { getEffectiveDecayCoefficient } from '@/lib/cognition/decay-engine'
import { createEmotionalSignals } from '@/lib/cognition/emotional-mapping'
import { calculateMemoryConfidence } from '@/lib/cognition/memory-confidence'
import { linkToThread } from './thread-linker'
import type { ExtractedEntities } from '@/lib/types'

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

    const confidence = entities.extraction_confidence
    const dimConf = entities.dimensional_confidence

    // 3. Link people — safe even at lower confidence (names are reliable)
    // Only link people classified as facts, or inferences with high entity confidence
    if (entities.people.length > 0 && dimConf.entity >= 0.3) {
      const factsOnly = entities.people.filter(p => p.source_type === 'fact')
      const reliableInferences = entities.people.filter(
        p => p.source_type === 'inference' && dimConf.entity >= 0.7
      )
      const reliablePeople = [...factsOnly, ...reliableInferences]
      if (reliablePeople.length > 0) {
        await linkPeople(supabase, userId, memoryId, reliablePeople)
      }
    }

    // 4. Create commitments — deterministic verification layer
    // Three gates: extraction confidence, dimensional commitment confidence, AND structural verification
    if (confidence >= 0.6 && dimConf.commitment >= 0.6) {
      for (const commitment of entities.commitments) {
        // HARD VERIFICATION: reject commitments that fail structural checks
        // This is the deterministic layer that prevents GPT from creating false obligations
        if (!verifyCommitment(commitment)) {
          continue // Skip this commitment — it failed verification
        }

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
            source_type: commitment.source_type,
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
    }

    // 5. Create tasks — only at moderate+ confidence, only facts
    if (confidence >= 0.6 && dimConf.intent >= 0.5) {
      for (const task of entities.tasks) {
        // Only create tasks that are explicitly stated (facts), not inferred
        if (task.source_type !== 'fact') continue

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
    }

    // 6. Generate embedding
    const embedding = await generateEmbedding(content)

    // 7. Determine event type and decay coefficient
    const eventType = inferEventType(content, entities)
    const decayCoefficient = getEffectiveDecayCoefficient(0.05, entities.importance)

    // 8. Update memory with processed data + life stream fields
    // Try with new columns first, fall back to basic columns if they don't exist yet
    const updatePayload: Record<string, unknown> = {
      summary: entities.summary,
      importance: entities.importance,
      emotional_tone: entities.emotional_tone,
      embedding: JSON.stringify(embedding),
      event_type: eventType,
      decay_coefficient: decayCoefficient,
      continuity_retention: 1.0,
      last_decay_at: new Date().toISOString(),
      extraction_confidence: confidence,
      processing_error: null,
      processed: true,
      updated_at: new Date().toISOString(),
    }

    const { error: updateError } = await supabase
      .from('memory_items')
      .update(updatePayload)
      .eq('id', memoryId)

    // If update failed (possibly missing columns), try without new columns
    if (updateError) {
      console.warn('Full update failed, trying basic columns:', updateError.message)
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
    }

    // 9. Link to thread (auto-cluster into threads)
    // Requires BOTH extraction confidence AND entity confidence
    // Thread linking uses its own CLC score internally
    try {
      if (confidence >= 0.6 && dimConf.entity >= 0.4) {
        await linkToThread(userId, memoryId, content, entities, embedding)
      }
    } catch (threadLinkError) {
      console.error('Thread linking error (non-fatal):', threadLinkError)
    }

    // 10. Build cognitive graph — gated on confidence, provisional nodes for low-confidence
    try {
      if (confidence >= 0.4) {
        await buildGraphNodes(userId, memoryId, entities)
        await createEdges(userId, memoryId, entities)
      }
    } catch (graphError) {
      console.error('Cognitive graph error (non-fatal):', graphError)
    }

    // 11. Detect interrupted threads (legacy)
    try {
      await detectInterruptedThreads(userId, memoryId)
    } catch (threadError) {
      console.error('Thread detection error (non-fatal):', threadError)
    }

    // 12. Create follow-up candidates — only facts with decent confidence
    try {
      if (entities.follow_up_intents && entities.follow_up_intents.length > 0 && confidence >= 0.5) {
        // Only create follow-ups that are facts with high individual confidence
        const reliableIntents = entities.follow_up_intents.filter(
          fi => fi.confidence >= 0.6 && fi.source_type === 'fact'
        )
        if (reliableIntents.length > 0) {
          await createFollowUpCandidates(userId, memoryId, reliableIntents)
        }
      }
    } catch (followUpError) {
      console.error('Follow-up detection error (non-fatal):', followUpError)
    }

    // 13. Create emotional signals — deterministic, shallow, factual only
    // No GPT-interpreted psychological state. Only explicit signal markers with trigger text.
    try {
      if (entities.emotional_signals.length > 0 && confidence >= 0.5) {
        await createEmotionalSignals(userId, memoryId, entities.emotional_signals)
      }
    } catch (emotionError) {
      console.error('Emotional signal error (non-fatal):', emotionError)
    }

    // 14. Calculate memory confidence score
    try {
      await calculateMemoryConfidence(userId, memoryId)
    } catch (confidenceError) {
      console.error('Memory confidence error (non-fatal):', confidenceError)
    }

  } catch (error) {
    console.error('Error processing memory:', memoryId, error)
    // Record the error so stuck items show why they failed
    try {
      // Try with processing_error column first
      const { error: errUpdateError } = await supabase
        .from('memory_items')
        .update({
          processing_error: error instanceof Error ? error.message : String(error),
          updated_at: new Date().toISOString(),
        })
        .eq('id', memoryId)

      // If processing_error column doesn't exist, at least log it
      if (errUpdateError) {
        console.error('Could not record processing error (column may not exist):', errUpdateError.message)
      }
    } catch {
      // If we can't even record the error, just log it
    }
    // Re-throw so callers know processing failed
    throw error
  }
}

/**
 * Deterministic commitment verification layer.
 *
 * GPT extracts possibilities. This function decides truth.
 *
 * A commitment is only valid if it has ALL THREE:
 * 1. Explicit action verb ("I will call", "need to send", "promised to")
 * 2. Identifiable actor (clear who is committing)
 * 3. Future orientation (references future action, not past description)
 *
 * Plus: source_type must be 'fact' (not inference).
 *
 * This prevents false obligations like:
 * - "Andy mentioned the voucher" → no commitment
 * - "I should probably..." → no commitment (follow_up_intent instead)
 * - "The meeting was about budgets" → no commitment
 */
function verifyCommitment(commitment: ExtractedEntities['commitments'][0]): boolean {
  // Gate 1: must be classified as a fact by extraction
  if (commitment.source_type !== 'fact') return false

  // Gate 2: must have explicit action verb
  if (!commitment.has_explicit_verb) return false

  // Gate 3: must have identifiable actor
  if (!commitment.has_identifiable_actor) return false

  // Gate 4: must have future orientation
  if (!commitment.has_future_orientation) return false

  return true
}

/**
 * Infer event type from content and extracted entities.
 */
function inferEventType(
  content: string,
  entities: ExtractedEntities
): string {
  const lower = content.toLowerCase()

  // Only count verified commitments (facts with explicit verbs)
  const verifiedCommitments = entities.commitments.filter(c => verifyCommitment(c))
  if (verifiedCommitments.length > 0) return 'promise'
  if (entities.people.length >= 2 || lower.includes('meeting') || lower.includes('discussed') || lower.includes('talked')) return 'conversation'
  // Use emotional signals instead of tone for event type
  if (entities.emotional_signals.some(s => s.intensity >= 0.5)) return 'emotional_shift'
  if (lower.includes('interrupt') || lower.includes('got sidetracked') || lower.includes('was in the middle')) return 'interruption'

  return 'thought'
}
