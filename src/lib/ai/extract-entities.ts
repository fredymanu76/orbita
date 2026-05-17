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
  })).describe('People mentioned in the content'),
  commitments: z.array(z.object({
    description: z.string().describe('What was promised or agreed to'),
    direction: z.enum(['outgoing', 'incoming']).describe('outgoing = user promised to do something, incoming = someone promised the user'),
    due_date_text: z.string().nullable().describe('Any mentioned due date or deadline as raw text, e.g. "next Friday", "by end of week"'),
    person_name: z.string().nullable().describe('The person involved in this commitment'),
  })).describe('Promises, agreements, or obligations detected'),
  tasks: z.array(z.object({
    title: z.string().describe('A short actionable task title'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    due_date_text: z.string().nullable().describe('Any mentioned due date as raw text'),
  })).describe('Actionable tasks extracted from the content'),
  dates_mentioned: z.array(z.object({
    raw_text: z.string().describe('The date reference as it appears in text'),
    context: z.string().describe('What the date refers to'),
  })).describe('Dates or time references mentioned'),
  follow_up_intents: z.array(z.object({
    description: z.string().describe('What the user intends to follow up on'),
    expected_timeframe: z.string().nullable().describe('When the follow-up is expected: "this week", "next Monday", "in a few days", etc.'),
    confidence: z.number().min(0).max(1).describe('Confidence that this is a genuine follow-up intent (0-1)'),
  })).describe('Future intentions or things the user plans to revisit or follow up on'),
  emotional_analysis: z.object({
    primary_emotion: z.string().describe('The primary emotion detected: joy, anxiety, frustration, hope, sadness, anger, calm, excitement, etc.'),
    intensity: z.number().min(0).max(1).describe('Emotional intensity from 0 (very mild) to 1 (very strong)'),
    valence: z.number().min(-1).max(1).describe('Emotional valence from -1 (very negative) to 1 (very positive), 0 is neutral'),
  }).nullable().describe('Deeper emotional analysis of the content. Null if content is purely factual with no emotional signal.'),
})

export async function extractEntities(content: string): Promise<ExtractedEntities> {
  const openai = getOpenAIClient()

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a cognitive assistant that extracts structured information from personal notes, conversations, and thoughts. Your job is to identify:

1. A concise summary
2. Importance level (1-10)
3. Emotional tone
4. People mentioned (with relationship/role if clear)
5. Commitments or promises (things the user or others committed to)
6. Actionable tasks
7. Dates or time references
8. Follow-up intents — things the user plans to revisit or do later
9. Emotional analysis — the primary emotion, its intensity, and valence

Be thorough but don't hallucinate — only extract what is clearly present or strongly implied in the text. For commitments, distinguish between things the user promised to do (outgoing) and things promised to the user (incoming). For follow-up intents, detect phrases like "I should check back", "need to revisit", "will circle back", "remind me to", etc. For emotional analysis, return null if the content is purely factual.

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

  const parsed = JSON.parse(response.choices[0].message.content || '{}')
  return extractionSchema.parse(parsed)
}
