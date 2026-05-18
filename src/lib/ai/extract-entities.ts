import { getOpenAIClient } from './openai'
import { z } from 'zod'
import type { ExtractedEntities } from '@/lib/types'

// Each field uses .catch() so partial failures don't tank the entire extraction.
// If GPT returns one bad field, only that field defaults — everything else is preserved.
const personSchema = z.object({
  name: z.string(),
  relationship: z.string().nullable().catch(null),
  role: z.string().nullable().catch(null),
  source_type: z.enum(['fact', 'inference']).catch('fact'),
})

const commitmentSchema = z.object({
  description: z.string(),
  direction: z.enum(['outgoing', 'incoming']).catch('outgoing'),
  due_date_text: z.string().nullable().catch(null),
  person_name: z.string().nullable().catch(null),
  source_type: z.enum(['fact', 'inference']).catch('fact'),
  has_explicit_verb: z.boolean().catch(true),
  has_future_orientation: z.boolean().catch(true),
  has_identifiable_actor: z.boolean().catch(true),
})

const taskSchema = z.object({
  title: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).catch('medium'),
  due_date_text: z.string().nullable().catch(null),
  source_type: z.enum(['fact', 'inference']).catch('fact'),
})

const dateSchema = z.object({
  raw_text: z.string(),
  context: z.string().catch(''),
})

const followUpSchema = z.object({
  description: z.string(),
  expected_timeframe: z.string().nullable().catch(null),
  confidence: z.number().min(0).max(1).catch(0.6),
  source_type: z.enum(['fact', 'inference']).catch('fact'),
})

const emotionalSignalSchema = z.object({
  signal_type: z.enum(['frustration', 'urgency', 'stress', 'concern', 'excitement', 'relief']).catch('concern'),
  trigger_text: z.string().catch(''),
  intensity: z.number().min(0).max(1).catch(0.5),
})

const orgSchema = z.object({
  name: z.string(),
  role: z.string().nullable().catch(null),
})

const projectSchema = z.object({
  name: z.string(),
  context: z.string().nullable().catch(null),
})

const dimConfSchema = z.object({
  entity: z.number().min(0).max(1).catch(0.7),
  intent: z.number().min(0).max(1).catch(0.7),
  temporal: z.number().min(0).max(1).catch(0.5),
  relationship: z.number().min(0).max(1).catch(0.5),
  commitment: z.number().min(0).max(1).catch(0.7),
}).catch({
  entity: 0.7,
  intent: 0.7,
  temporal: 0.5,
  relationship: 0.5,
  commitment: 0.7,
})

const extractionSchema = z.object({
  summary: z.string().catch(''),
  importance: z.number().min(1).max(10).catch(5),
  emotional_tone: z.string().catch('neutral'),
  people: z.array(personSchema).catch([]),
  commitments: z.array(commitmentSchema).catch([]),
  tasks: z.array(taskSchema).catch([]),
  dates_mentioned: z.array(dateSchema).catch([]),
  follow_up_intents: z.array(followUpSchema).catch([]),
  emotional_signals: z.array(emotionalSignalSchema).catch([]),
  intent_classifications: z.array(
    z.enum([
      'commitment', 'promise', 'unresolved_thought', 'concern', 'reflection',
      'planning', 'reminder', 'relationship', 'follow_up', 'idea',
      'emotional_support', 'admin_obligation', 'risk',
    ])
  ).catch([]),
  organizations: z.array(orgSchema).catch([]),
  projects: z.array(projectSchema).catch([]),
  thread_hint: z.string().nullable().catch(null),
  extraction_confidence: z.number().min(0).max(1).catch(0.7),
  dimensional_confidence: dimConfSchema,
})

const EXTRACTION_SYSTEM_PROMPT = `You are a structured information extraction engine for a cognitive continuity system. You extract factual, structured data from personal notes, voice transcriptions, and thoughts.

CRITICAL: FACT vs INFERENCE
Every extracted item MUST be classified as "fact" or "inference":
- FACT: Explicitly stated in the content. The user wrote or said it directly.
  Example: "I need to call Andy tomorrow" → commitment is a FACT
- INFERENCE: Derived by the system from context. Not explicitly stated.
  Example: "Andy mentioned the voucher" → any commitment here would be an INFERENCE

EXTRACT:
1. summary: concise 1-2 sentence factual summary
2. importance: 1 (trivial) to 10 (critical). Most content is 3-6.
3. emotional_tone: neutral, positive, anxious, urgent, reflective, etc.
4. people: array of {name, relationship, role, source_type}. Include anyone explicitly named.
5. commitments: array of {description, direction, due_date_text, person_name, source_type, has_explicit_verb, has_future_orientation, has_identifiable_actor}
   - direction: "outgoing" = user promised to do something, "incoming" = someone promised the user
   - has_explicit_verb: true if content contains "will", "need to", "have to", "promised to", "agreed to"
   - has_future_orientation: true if it references future action
   - has_identifiable_actor: true if clear WHO is committing
6. tasks: array of {title, priority, due_date_text, source_type}
7. dates_mentioned: array of {raw_text, context}
8. follow_up_intents: array of {description, expected_timeframe, confidence, source_type}
9. emotional_signals: array of {signal_type, trigger_text, intensity}
   - signal_type must be one of: frustration, urgency, stress, concern, excitement, relief
   - trigger_text must be a direct quote from the content
   - Only include if clear textual evidence exists. Empty array is fine.
10. intent_classifications: array of strings from: commitment, promise, unresolved_thought, concern, reflection, planning, reminder, relationship, follow_up, idea, emotional_support, admin_obligation, risk
11. organizations: array of {name, role}
12. projects: array of {name, context}
13. thread_hint: a 5-10 word description of the ongoing situation. Null if standalone.
14. extraction_confidence: 0-1 overall confidence
15. dimensional_confidence: {entity, intent, temporal, relationship, commitment} each 0-1

CONFIDENCE CALIBRATION:
- 0.9-1.0: Clear, unambiguous. Named people, explicit commitments, specific dates.
- 0.7-0.89: Mostly clear with some implied elements.
- 0.5-0.69: Ambiguous. Some structure but uncertain.
- 0.3-0.49: Very fragmentary.
- 0.0-0.29: Nearly opaque.

RULES:
- NEVER fabricate people, commitments, or dates not clearly present.
- "I should probably..." is a follow_up_intent, not a commitment.
- Prefer empty arrays over guessed data.
- For voice transcriptions, expect errors and lower confidence.

Return valid JSON with exactly these field names.`

export async function extractEntities(content: string): Promise<ExtractedEntities> {
  const openai = getOpenAIClient()

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    })

    const raw = response.choices[0].message.content || '{}'
    let parsed: unknown

    try {
      parsed = JSON.parse(raw)
    } catch {
      console.error('GPT returned invalid JSON, using minimal extraction')
      return createMinimalExtraction(content)
    }

    // Use .parse() which now has .catch() on every field —
    // individual field failures produce defaults, not total failure
    const result = extractionSchema.parse(parsed)

    // Fill in summary if GPT left it empty
    if (!result.summary) {
      result.summary = content.substring(0, 200)
    }

    return result
  } catch (error) {
    console.error('Entity extraction failed entirely:', error)
    return createMinimalExtraction(content)
  }
}

/**
 * Minimal extraction for when GPT returns garbage.
 */
function createMinimalExtraction(content: string): ExtractedEntities {
  return {
    summary: content.substring(0, 200),
    importance: 3,
    emotional_tone: 'neutral',
    people: [],
    commitments: [],
    tasks: [],
    dates_mentioned: [],
    follow_up_intents: [],
    emotional_signals: [],
    intent_classifications: [],
    organizations: [],
    projects: [],
    thread_hint: null,
    extraction_confidence: 0.1,
    dimensional_confidence: {
      entity: 0.1,
      intent: 0.1,
      temporal: 0.1,
      relationship: 0.1,
      commitment: 0.1,
    },
  }
}
