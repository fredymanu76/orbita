import { getOpenAIClient } from './openai'
import { z } from 'zod'
import type { ExtractedEntities } from '@/lib/types'

const extractionSchema = z.object({
  summary: z.string().describe('A concise 1-2 sentence summary of the content'),
  importance: z.number().min(1).max(10).describe('Importance from 1 (trivial) to 10 (critical)'),
  emotional_tone: z.string().describe('The emotional tone: neutral, positive, anxious, urgent, reflective, etc.'),
  people: z.array(z.object({
    name: z.string().describe('The person\'s name'),
    relationship: z.string().nullable().describe('Relationship to the user if mentioned: friend, colleague, boss, family, etc.'),
    role: z.string().nullable().describe('Their role in this context: participant, mentioned, recipient, etc.'),
    source_type: z.enum(['fact', 'inference']).describe('"fact" if the name is explicitly stated in the text, "inference" if implied from context'),
  })).describe('People mentioned in the content'),
  commitments: z.array(z.object({
    description: z.string().describe('What was promised or agreed to'),
    direction: z.enum(['outgoing', 'incoming']).describe('outgoing = user promised to do something, incoming = someone promised the user'),
    due_date_text: z.string().nullable().describe('Any mentioned due date or deadline as raw text, e.g. "next Friday", "by end of week"'),
    person_name: z.string().nullable().describe('The person involved in this commitment'),
    source_type: z.enum(['fact', 'inference']).describe('"fact" if explicitly stated as a promise/agreement, "inference" if implied'),
    has_explicit_verb: z.boolean().describe('True if content contains an explicit action verb like "will call", "need to send", "promised to". False for passive mentions like "Andy mentioned the voucher".'),
    has_future_orientation: z.boolean().describe('True if commitment references future action: "tomorrow", "next week", "by Friday", "will do". False for past/present descriptions.'),
    has_identifiable_actor: z.boolean().describe('True if it is clear WHO is committing to the action. False if actor is ambiguous.'),
  })).describe('Promises, agreements, or obligations detected. ONLY include explicit commitments.'),
  tasks: z.array(z.object({
    title: z.string().describe('A short actionable task title'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    due_date_text: z.string().nullable().describe('Any mentioned due date as raw text'),
    source_type: z.enum(['fact', 'inference']).describe('"fact" if explicitly stated as a to-do or action item, "inference" if derived from context'),
  })).describe('Actionable tasks extracted from the content'),
  dates_mentioned: z.array(z.object({
    raw_text: z.string().describe('The date reference as it appears in text'),
    context: z.string().describe('What the date refers to'),
  })).describe('Dates or time references mentioned'),
  follow_up_intents: z.array(z.object({
    description: z.string().describe('What the user intends to follow up on'),
    expected_timeframe: z.string().nullable().describe('When the follow-up is expected: "this week", "next Monday", "in a few days", etc.'),
    confidence: z.number().min(0).max(1).describe('Confidence that this is a genuine follow-up intent (0-1)'),
    source_type: z.enum(['fact', 'inference']).describe('"fact" if explicitly stated ("I need to check back on..."), "inference" if implied from context'),
  })).describe('Future intentions or things the user plans to revisit or follow up on'),
  emotional_signals: z.array(z.object({
    signal_type: z.enum(['frustration', 'urgency', 'stress', 'concern', 'excitement', 'relief']).describe('The type of emotional signal detected'),
    trigger_text: z.string().describe('The EXACT text fragment that triggered this signal detection. Must be a direct quote from the content.'),
    intensity: z.number().min(0).max(1).describe('Signal strength based on language: 0.3 for mild ("a bit worried"), 0.6 for moderate ("really stressed"), 0.9 for strong ("absolutely furious")'),
  })).describe('Explicit emotional signals detected from language. Only include signals with clear textual evidence. Do NOT infer psychological state. Do NOT interpret. Only detect explicit signal markers.'),
  intent_classifications: z.array(
    z.enum([
      'commitment', 'promise', 'unresolved_thought', 'concern', 'reflection',
      'planning', 'reminder', 'relationship', 'follow_up', 'idea',
      'emotional_support', 'admin_obligation', 'risk',
    ])
  ).describe('Classify the intent(s) of this capture. Multiple can apply.'),
  organizations: z.array(z.object({
    name: z.string().describe('Organization name'),
    role: z.string().nullable().describe('Role of this org in context: employer, client, provider, etc.'),
  })).describe('Organizations mentioned in the content'),
  projects: z.array(z.object({
    name: z.string().describe('Project or initiative name'),
    context: z.string().nullable().describe('Brief context about the project'),
  })).describe('Projects or initiatives mentioned'),
  thread_hint: z.string().nullable().describe('A 5-10 word description of the ongoing situation, topic, or thread this content relates to. E.g. "Andy gift voucher situation", "parking fine dispute", "planning Heidi school pickup schedule"'),
  extraction_confidence: z.number().min(0).max(1).describe('Overall confidence in the extraction accuracy from 0 (very uncertain, ambiguous content) to 1 (very clear, unambiguous). Lower for vague or fragmentary input.'),
  dimensional_confidence: z.object({
    entity: z.number().min(0).max(1).describe('Confidence in entity extraction (people, orgs). High if names are clearly stated.'),
    intent: z.number().min(0).max(1).describe('Confidence in intent classification. High if purpose is clear.'),
    temporal: z.number().min(0).max(1).describe('Confidence in temporal references. High if dates are specific. Low if vague ("soon", "eventually").'),
    relationship: z.number().min(0).max(1).describe('Confidence in relationship identification. High if explicitly stated ("my boss Andy"). Low if inferred.'),
    commitment: z.number().min(0).max(1).describe('Confidence in commitment detection. High only if commitment has explicit verb + actor + future orientation.'),
  }).describe('Per-dimension confidence scores. Different dimensions can have very different certainty levels.'),
})

const EXTRACTION_SYSTEM_PROMPT = `You are a structured information extraction engine for a cognitive continuity system. You extract factual, structured data from personal notes, voice transcriptions, and thoughts. Your output feeds into a deterministic continuity graph — accuracy and honesty about uncertainty are critical.

CRITICAL ARCHITECTURE: FACT vs INFERENCE
Every extracted item MUST be classified as "fact" or "inference":
- FACT: Explicitly stated in the content. The user wrote or said it directly.
  Example: "I need to call Andy tomorrow" → commitment is a FACT
- INFERENCE: Derived by the system from context. Not explicitly stated.
  Example: "Andy mentioned the voucher" → any commitment here would be an INFERENCE

These categories are NEVER mixed. The system treats them differently downstream.

EXTRACT:
1. Summary — concise 1-2 sentence factual summary
2. Importance — 1 (trivial) to 10 (critical). Be conservative; most content is 3-6.
3. Emotional tone — neutral, positive, anxious, urgent, reflective, etc.
4. People — names with relationship/role IF clearly stated. Mark source_type.
5. Commitments — ONLY explicit promises. Each must include verification fields:
   - has_explicit_verb: Does the content contain "will", "need to", "have to", "promised to", "agreed to"?
   - has_future_orientation: Does it reference future action?
   - has_identifiable_actor: Is it clear WHO is committing?
   If any of these are false, source_type MUST be "inference".
6. Tasks — explicitly mentioned actionable items only. Mark source_type.
7. Dates — date/time references as raw text with context.
8. Follow-up intents — detected via phrases like "need to check back", "remind me", "will revisit". Mark source_type.
9. Emotional signals — ONLY explicit emotional markers detected from language:
   - frustration: "frustrated", "annoying", "fed up", "can't believe"
   - urgency: "urgent", "ASAP", "need to now", "running out of time"
   - stress: "stressed", "overwhelmed", "too much", "drowning"
   - concern: "worried", "concerned", "anxious about", "scared"
   - excitement: "excited", "can't wait", "thrilled", "amazing"
   - relief: "relieved", "finally", "weight off", "sorted"
   NEVER infer emotional state. NEVER interpret psychology. ONLY detect signal markers in text.
   trigger_text MUST be a direct quote from the content.
10. Intent classifications — what type of content this is. Multiple can apply.
11. Organizations — explicitly mentioned organizations.
12. Projects — explicitly mentioned projects or named initiatives.
13. Thread hint — the broader ongoing situation this relates to. Null if standalone/unclear.
14. Dimensional confidence — separate confidence per dimension. Critical for downstream gating.

CONFIDENCE CALIBRATION (extraction_confidence):
This is the most important field. It gates all downstream continuity operations.
- 0.9-1.0: Clear, unambiguous content. Named people, explicit commitments, specific dates.
- 0.7-0.89: Mostly clear content with some implied elements. People named, context inferable.
- 0.5-0.69: Ambiguous content. Some structure extractable but uncertain. Voice transcription with errors.
- 0.3-0.49: Very fragmentary. Short notes, vague references, unclear intent.
- 0.0-0.29: Nearly opaque. Single words, garbled transcription, no extractable structure.

DIMENSIONAL CONFIDENCE:
Different dimensions can have VERY different certainty:
- Entity confidence: high if names are clearly spelled out
- Intent confidence: high if purpose is obvious
- Temporal confidence: high if dates are specific ("next Tuesday"), low if vague ("soon")
- Relationship confidence: high if explicitly stated, low if inferred
- Commitment confidence: high ONLY if all three verification fields are true

RULES:
- NEVER fabricate people, commitments, or dates that aren't clearly present.
- NEVER infer commitments from vague language like "I should probably..." — that's a follow_up_intent, not a commitment.
- NEVER classify inferences as facts. When uncertain, classify as inference.
- If in doubt about a person's name, include them as source_type="inference" with low entity confidence.
- For voice transcriptions, expect errors and lower confidence accordingly.
- Prefer empty arrays over guessed data. An empty commitments array with high confidence is better than a populated one with false entries.
- Thread_hint should be null if the content is standalone or you can't identify the broader context.
- emotional_signals array should be EMPTY if no explicit signal markers are found. Do NOT force emotional interpretation.`

export async function extractEntities(content: string): Promise<ExtractedEntities> {
  const openai = getOpenAIClient()

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `${EXTRACTION_SYSTEM_PROMPT}

Return your response as valid JSON matching this schema:
${JSON.stringify(extractionSchema.shape, null, 2)}`,
      },
      {
        role: 'user',
        content,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  })

  const raw = response.choices[0].message.content || '{}'
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    // If GPT returns invalid JSON, return a minimal safe extraction
    return createMinimalExtraction(content)
  }

  try {
    return extractionSchema.parse(parsed)
  } catch (zodError) {
    // If schema validation fails, attempt partial recovery with safe defaults
    console.error('Extraction schema validation failed, using safe defaults:', zodError)
    return createSafeExtraction(parsed as Record<string, unknown>, content)
  }
}

/**
 * Minimal extraction for when GPT returns garbage — ensures pipeline doesn't break.
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

/**
 * Partial recovery — use what we can from GPT output, fill gaps with safe defaults.
 */
function createSafeExtraction(raw: Record<string, unknown>, content: string): ExtractedEntities {
  return {
    summary: typeof raw.summary === 'string' ? raw.summary : content.substring(0, 200),
    importance: typeof raw.importance === 'number' ? Math.min(10, Math.max(1, raw.importance)) : 3,
    emotional_tone: typeof raw.emotional_tone === 'string' ? raw.emotional_tone : 'neutral',
    people: Array.isArray(raw.people) ? raw.people.filter(p => p && typeof p === 'object' && 'name' in p).map(p => ({
      name: String((p as Record<string, unknown>).name),
      relationship: typeof (p as Record<string, unknown>).relationship === 'string' ? (p as Record<string, unknown>).relationship as string : null,
      role: typeof (p as Record<string, unknown>).role === 'string' ? (p as Record<string, unknown>).role as string : null,
      source_type: 'inference' as const, // Safe default for recovered data
    })) : [],
    commitments: [],  // Don't recover commitments from invalid data — too risky
    tasks: [],        // Same for tasks
    dates_mentioned: [],
    follow_up_intents: [],
    emotional_signals: [], // Never recover emotional data from invalid extraction
    intent_classifications: [],
    organizations: [],
    projects: [],
    thread_hint: typeof raw.thread_hint === 'string' ? raw.thread_hint : null,
    extraction_confidence: 0.2, // Low confidence for recovered extractions
    dimensional_confidence: {
      entity: 0.2,
      intent: 0.1,
      temporal: 0.1,
      relationship: 0.1,
      commitment: 0.0, // Zero — we couldn't validate commitments at all
    },
  }
}
