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
import { incrementalProfileUpdate } from '@/lib/cognition/self-model-engine'
import { linkToThread } from './thread-linker'
import type { ExtractedEntities } from '@/lib/types'

interface PipelineStep {
  step: string
  status: 'ok' | 'skipped' | 'error'
  detail?: string
  ids?: string[]
}

export async function processMemory(memoryId: string) {
  const supabase = createAdminClient()
  const trace: PipelineStep[] = []

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

  if (memory.processed) {
    trace.push({ step: 'fetch', status: 'skipped', detail: 'Already processed' })
    return
  }

  const userId = memory.user_id
  const content = memory.raw_content

  try {
    // 2. Extract entities via GPT-4o-mini
    const entities = await extractEntities(content)
    const confidence = entities.extraction_confidence
    const dimConf = entities.dimensional_confidence

    trace.push({
      step: 'extraction',
      status: 'ok',
      detail: `confidence=${confidence}, entity=${dimConf.entity}, commitment=${dimConf.commitment}, people=${entities.people.length}, commitments=${entities.commitments.length}, tasks=${entities.tasks.length}, follow_ups=${entities.follow_up_intents.length}, signals=${entities.emotional_signals.length}`,
    })

    // 3. Link people
    if (entities.people.length > 0 && dimConf.entity >= 0.3) {
      const factsOnly = entities.people.filter(p => p.source_type === 'fact')
      const reliableInferences = entities.people.filter(
        p => p.source_type === 'inference' && dimConf.entity >= 0.7
      )
      const reliablePeople = [...factsOnly, ...reliableInferences]
      if (reliablePeople.length > 0) {
        try {
          await linkPeople(supabase, userId, memoryId, reliablePeople)
          trace.push({ step: 'people', status: 'ok', detail: `Linked ${reliablePeople.length} people: ${reliablePeople.map(p => p.name).join(', ')}` })
        } catch (err) {
          trace.push({ step: 'people', status: 'error', detail: err instanceof Error ? err.message : String(err) })
        }
      } else {
        trace.push({ step: 'people', status: 'skipped', detail: `${entities.people.length} people found but none reliable (facts: ${factsOnly.length}, reliable inferences: ${reliableInferences.length})` })
      }
    } else {
      trace.push({ step: 'people', status: 'skipped', detail: `people=${entities.people.length}, entity_conf=${dimConf.entity} (need >=0.3)` })
    }

    // 4. Create commitments
    const createdCommitmentIds: string[] = []
    if (confidence >= 0.6 && dimConf.commitment >= 0.6) {
      for (const commitment of entities.commitments) {
        const verified = verifyCommitment(commitment)
        if (!verified) {
          trace.push({
            step: 'commitment_verify',
            status: 'skipped',
            detail: `REJECTED: "${commitment.description}" — source=${commitment.source_type}, verb=${commitment.has_explicit_verb}, actor=${commitment.has_identifiable_actor}, future=${commitment.has_future_orientation}`,
          })
          continue
        }

        try {
          let personId: string | null = null
          if (commitment.person_name) {
            personId = await findPersonByName(supabase, userId, commitment.person_name)
          }

          const dueDate = commitment.due_date_text
            ? parseDateText(commitment.due_date_text)
            : null

          const { data: newCommitment, error: commitErr } = await supabase
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

          if (commitErr) {
            trace.push({ step: 'commitment_create', status: 'error', detail: `DB error: ${commitErr.message}` })
          } else if (newCommitment) {
            createdCommitmentIds.push(newCommitment.id)
            trace.push({ step: 'commitment_create', status: 'ok', detail: `Created: "${commitment.description}" (id=${newCommitment.id}, person=${personId}, due=${dueDate?.toISOString() || 'none'})` })

            if (commitment.due_date_text) {
              await scheduleReminders(supabase, userId, {
                commitmentId: newCommitment.id,
                dueDateText: commitment.due_date_text,
                message: `Commitment due: ${commitment.description}`,
              })
            }
          }
        } catch (err) {
          trace.push({ step: 'commitment_create', status: 'error', detail: err instanceof Error ? err.message : String(err) })
        }
      }
    } else {
      trace.push({
        step: 'commitments',
        status: 'skipped',
        detail: `conf=${confidence} (need >=0.6), dim_commitment=${dimConf.commitment} (need >=0.6), count=${entities.commitments.length}`,
      })
    }

    // 5. Create tasks — only facts
    if (confidence >= 0.6 && dimConf.intent >= 0.5) {
      for (const task of entities.tasks) {
        if (task.source_type !== 'fact') {
          trace.push({ step: 'task', status: 'skipped', detail: `"${task.title}" is inference, not fact` })
          continue
        }

        try {
          const dueDate = task.due_date_text ? parseDateText(task.due_date_text) : null
          const { data: newTask, error: taskErr } = await supabase
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

          if (taskErr) {
            trace.push({ step: 'task_create', status: 'error', detail: `DB error: ${taskErr.message}` })
          } else if (newTask) {
            trace.push({ step: 'task_create', status: 'ok', detail: `Created: "${task.title}" (id=${newTask.id})` })
          }
        } catch (err) {
          trace.push({ step: 'task_create', status: 'error', detail: err instanceof Error ? err.message : String(err) })
        }
      }
    } else {
      trace.push({ step: 'tasks', status: 'skipped', detail: `conf=${confidence} (need >=0.6), intent=${dimConf.intent} (need >=0.5), count=${entities.tasks.length}` })
    }

    // 6. Generate embedding
    const embedding = await generateEmbedding(content)
    trace.push({ step: 'embedding', status: 'ok', detail: `Generated ${embedding.length}-dim embedding` })

    // 7. Event type and decay
    const eventType = inferEventType(content, entities)
    const decayCoefficient = getEffectiveDecayCoefficient(0.05, entities.importance)
    trace.push({ step: 'event_type', status: 'ok', detail: `type=${eventType}, decay=${decayCoefficient.toFixed(4)}` })

    // 8. Update memory with processed data
    const { error: updateError } = await supabase
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
        extraction_confidence: confidence,
        processing_error: null,
        processed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memoryId)

    if (updateError) {
      // Fallback: try without new columns
      trace.push({ step: 'memory_update', status: 'error', detail: `Full update failed: ${updateError.message}, trying fallback` })
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
    } else {
      trace.push({ step: 'memory_update', status: 'ok' })
    }

    // 9. Link to thread
    if (confidence >= 0.6 && dimConf.entity >= 0.4) {
      try {
        const threadId = await linkToThread(userId, memoryId, content, entities, embedding)
        trace.push({ step: 'thread_link', status: 'ok', detail: `Thread: ${threadId}` })
      } catch (err) {
        trace.push({ step: 'thread_link', status: 'error', detail: err instanceof Error ? err.message : String(err) })
      }
    } else {
      trace.push({ step: 'thread_link', status: 'skipped', detail: `conf=${confidence} (need >=0.6), entity=${dimConf.entity} (need >=0.4)` })
    }

    // 10. Cognitive graph
    if (confidence >= 0.4) {
      try {
        const nodeIds = await buildGraphNodes(userId, memoryId, entities)
        await createEdges(userId, memoryId, entities)
        trace.push({ step: 'graph', status: 'ok', detail: `Created ${nodeIds.length} nodes`, ids: nodeIds })
      } catch (err) {
        trace.push({ step: 'graph', status: 'error', detail: err instanceof Error ? err.message : String(err) })
      }
    } else {
      trace.push({ step: 'graph', status: 'skipped', detail: `conf=${confidence} (need >=0.4)` })
    }

    // 11. Detect interrupted threads (legacy)
    try {
      await detectInterruptedThreads(userId, memoryId)
      trace.push({ step: 'interrupted_threads', status: 'ok' })
    } catch (err) {
      trace.push({ step: 'interrupted_threads', status: 'error', detail: err instanceof Error ? err.message : String(err) })
    }

    // 12. Follow-up candidates
    if (entities.follow_up_intents && entities.follow_up_intents.length > 0 && confidence >= 0.5) {
      const reliableIntents = entities.follow_up_intents.filter(
        fi => fi.confidence >= 0.6 && fi.source_type === 'fact'
      )
      if (reliableIntents.length > 0) {
        try {
          await createFollowUpCandidates(userId, memoryId, reliableIntents)
          trace.push({ step: 'follow_ups', status: 'ok', detail: `Created ${reliableIntents.length} follow-ups` })
        } catch (err) {
          trace.push({ step: 'follow_ups', status: 'error', detail: err instanceof Error ? err.message : String(err) })
        }
      } else {
        trace.push({ step: 'follow_ups', status: 'skipped', detail: `${entities.follow_up_intents.length} intents found, 0 reliable (need conf>=0.6 AND source=fact)` })
      }
    } else {
      trace.push({ step: 'follow_ups', status: 'skipped', detail: `conf=${confidence}, intents=${entities.follow_up_intents?.length || 0}` })
    }

    // 13. Emotional signals
    if (entities.emotional_signals.length > 0 && confidence >= 0.5) {
      try {
        await createEmotionalSignals(userId, memoryId, entities.emotional_signals)
        trace.push({ step: 'emotional_signals', status: 'ok', detail: `Created ${entities.emotional_signals.length} signals` })
      } catch (err) {
        trace.push({ step: 'emotional_signals', status: 'error', detail: err instanceof Error ? err.message : String(err) })
      }
    } else {
      trace.push({ step: 'emotional_signals', status: 'skipped', detail: `signals=${entities.emotional_signals.length}, conf=${confidence}` })
    }

    // 14. Memory confidence
    try {
      await calculateMemoryConfidence(userId, memoryId)
      trace.push({ step: 'memory_confidence', status: 'ok' })
    } catch (err) {
      trace.push({ step: 'memory_confidence', status: 'error', detail: err instanceof Error ? err.message : String(err) })
    }

    // 15. Self-model incremental update
    try {
      await incrementalProfileUpdate(userId, memoryId, entities)
      trace.push({ step: 'self_model', status: 'ok' })
    } catch (err) {
      trace.push({ step: 'self_model', status: 'error', detail: err instanceof Error ? err.message : String(err) })
    }

    // Store the pipeline trace for debugging
    const traceJson = JSON.stringify(trace)
    await supabase
      .from('memory_items')
      .update({ processing_error: `TRACE:${traceJson}` })
      .eq('id', memoryId)

    // Log the full trace
    console.log(`[Pipeline ${memoryId}] Completed:`, trace.map(t => `${t.step}:${t.status}`).join(', '))

  } catch (error) {
    console.error('Error processing memory:', memoryId, error)
    trace.push({ step: 'fatal', status: 'error', detail: error instanceof Error ? error.message : String(error) })

    try {
      await supabase
        .from('memory_items')
        .update({
          processing_error: error instanceof Error ? error.message : String(error),
          updated_at: new Date().toISOString(),
        })
        .eq('id', memoryId)
    } catch {
      // Can't even record the error
    }
    throw error
  }
}

/**
 * Deterministic commitment verification.
 * A commitment is valid if ALL of: source=fact, explicit verb, identifiable actor, future orientation.
 */
function verifyCommitment(commitment: ExtractedEntities['commitments'][0]): boolean {
  if (commitment.source_type !== 'fact') return false
  if (!commitment.has_explicit_verb) return false
  if (!commitment.has_identifiable_actor) return false
  if (!commitment.has_future_orientation) return false
  return true
}

function inferEventType(content: string, entities: ExtractedEntities): string {
  const lower = content.toLowerCase()
  const verifiedCommitments = entities.commitments.filter(c => verifyCommitment(c))
  if (verifiedCommitments.length > 0) return 'promise'
  if (entities.people.length >= 2 || lower.includes('meeting') || lower.includes('discussed') || lower.includes('talked')) return 'conversation'
  if (entities.emotional_signals.some(s => s.intensity >= 0.5)) return 'emotional_shift'
  if (lower.includes('interrupt') || lower.includes('got sidetracked') || lower.includes('was in the middle')) return 'interruption'
  return 'thought'
}
