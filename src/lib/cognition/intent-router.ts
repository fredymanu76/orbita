/**
 * Intent Router — classifies user input before deciding how to handle it.
 *
 * The dashboard input bar should NOT blindly store everything as memory.
 * This router determines whether the user is:
 *   - capturing something to remember (→ memory pipeline)
 *   - asking a question about their life (→ recall engine)
 *   - reflecting on feelings/identity (→ store + companion response)
 *   - just conversing (→ companion response, NOT stored)
 *   - requesting action/guidance (→ recall context + companion guidance)
 *
 * Uses fast deterministic pattern matching first. Falls back to a lightweight
 * GPT call only when patterns are ambiguous.
 */

import { getOpenAIClient } from '@/lib/ai/openai'
import type { InputIntent, IntentRouterResult } from '@/lib/types'

// --- Fast deterministic classification ---

const QUESTION_STARTERS = [
  'what', 'who', 'where', 'when', 'why', 'how', 'do i', 'did i',
  'have i', 'am i', 'is there', 'are there', 'can you', 'could you',
  'should i', 'will i', 'was there', 'were there',
]

const ACTION_PHRASES = [
  'help me', 'prioritise', 'prioritize', 'what should i',
  'what do i need', 'what\'s most important', 'what is most important',
  'what matters', 'what do i do', 'guide me', 'advise me',
  'what\'s next', 'what is next', 'what now',
]

const ACKNOWLEDGE_WORDS = [
  'ok', 'okay', 'thanks', 'thank you', 'great', 'got it', 'sure',
  'fine', 'good', 'very well', 'alright', 'right', 'cool', 'noted',
  'perfect', 'awesome', 'nice', 'cheers', 'ta', 'yes', 'yep', 'yeah',
  'no', 'nope', 'nah', 'hmm', 'hm', 'mhm',
]

const GREETING_PHRASES = [
  'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
  'how are you', 'how\'s it going', 'what\'s up', 'sup',
]

const REFLECT_PHRASES = [
  'i feel', 'i\'m feeling', 'i am feeling', 'i\'m worried',
  'i\'m stressed', 'i\'m overwhelmed', 'i\'m anxious',
  'i\'m scared', 'i\'m frustrated', 'i\'m tired',
  'i want to be', 'i need to be', 'what matters to me',
  'i\'m struggling', 'i\'m not sure', 'i don\'t know what',
  'i can\'t stop thinking', 'i keep thinking about',
]

/**
 * Fast deterministic intent classification.
 * Returns null if uncertain — caller should use GPT fallback.
 */
function classifyDeterministic(input: string): IntentRouterResult | null {
  const trimmed = input.trim()
  const lower = trimmed.toLowerCase()
  const wordCount = trimmed.split(/\s+/).length

  // Very short acknowledgments (1-4 words)
  if (wordCount <= 4) {
    const isAcknowledge = ACKNOWLEDGE_WORDS.some(w => lower === w || lower === w + '.')
    if (isAcknowledge) {
      return {
        intent: 'converse',
        confidence: 0.95,
        should_store: false,
        response_needed: true,
        reasoning: 'Short acknowledgment — conversational, not memory-worthy',
      }
    }

    const isGreeting = GREETING_PHRASES.some(g => lower.startsWith(g))
    if (isGreeting) {
      return {
        intent: 'converse',
        confidence: 0.95,
        should_store: false,
        response_needed: true,
        reasoning: 'Greeting — conversational, not memory-worthy',
      }
    }
  }

  // Questions ending with ?
  if (trimmed.endsWith('?')) {
    // Check if it's an action-seeking question
    const isAction = ACTION_PHRASES.some(p => lower.includes(p))
    if (isAction) {
      return {
        intent: 'action',
        confidence: 0.85,
        should_store: false,
        response_needed: true,
        reasoning: 'Action-seeking question — needs guidance, not storage',
      }
    }

    return {
      intent: 'ask',
      confidence: 0.9,
      should_store: false,
      response_needed: true,
      reasoning: 'Question — needs an answer, not storage',
    }
  }

  // Question-like sentences that don't end with ?
  const startsWithQuestion = QUESTION_STARTERS.some(q => lower.startsWith(q + ' '))
  if (startsWithQuestion) {
    const isAction = ACTION_PHRASES.some(p => lower.includes(p))
    if (isAction) {
      return {
        intent: 'action',
        confidence: 0.8,
        should_store: false,
        response_needed: true,
        reasoning: 'Action-seeking statement — needs guidance, not storage',
      }
    }

    return {
      intent: 'ask',
      confidence: 0.8,
      should_store: false,
      response_needed: true,
      reasoning: 'Question-like statement — likely needs an answer',
    }
  }

  // Action requests (not phrased as questions)
  const isAction = ACTION_PHRASES.some(p => lower.startsWith(p) || lower.includes(p))
  if (isAction) {
    return {
      intent: 'action',
      confidence: 0.8,
      should_store: false,
      response_needed: true,
      reasoning: 'Action request — needs guidance',
    }
  }

  // Reflection / emotional expression
  const isReflect = REFLECT_PHRASES.some(p => lower.startsWith(p) || lower.includes(p))
  if (isReflect) {
    return {
      intent: 'reflect',
      confidence: 0.8,
      should_store: true,
      response_needed: true,
      reasoning: 'Emotional/reflective content — store AND respond with empathy',
    }
  }

  // Greetings in longer form
  const isGreeting = GREETING_PHRASES.some(g => lower.startsWith(g))
  if (isGreeting && wordCount <= 8) {
    return {
      intent: 'converse',
      confidence: 0.85,
      should_store: false,
      response_needed: true,
      reasoning: 'Greeting — conversational',
    }
  }

  // Longer content (8+ words) with no question/action/reflection signals → likely capture
  if (wordCount >= 8) {
    return {
      intent: 'capture',
      confidence: 0.7,
      should_store: true,
      response_needed: false,
      reasoning: 'Substantial content with no question/action signals — likely memory capture',
    }
  }

  // Uncertain — short statement that doesn't match patterns
  return null
}

/**
 * GPT fallback for ambiguous input.
 * Only called when deterministic classification returns null.
 */
async function classifyWithGPT(input: string): Promise<IntentRouterResult> {
  const openai = getOpenAIClient()

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You classify user input into exactly one intent. Return JSON with: intent, confidence, should_store, response_needed, reasoning.

Intents:
- "capture": User is recording something to remember (events, notes, conversations, what happened). Store it. No response needed.
- "ask": User is asking a question about their life, memories, or data. Don't store. Respond with answer.
- "reflect": User is processing emotions, identity, or values. Store it AND respond with empathy.
- "converse": User is just talking (greetings, acknowledgments, small talk). Don't store. Respond conversationally.
- "action": User wants guidance, prioritisation, or help deciding. Don't store. Respond with actionable advice.

Rules:
- "Very well" → converse (not capture)
- "What should I focus on?" → action (not capture)
- "Had a meeting with Andy" → capture
- "I'm feeling overwhelmed" → reflect (store + respond)
- "Thanks" → converse
- Short meaningless phrases → converse

Return valid JSON only.`,
        },
        { role: 'user', content: input },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 150,
    })

    const raw = JSON.parse(response.choices[0].message.content || '{}')

    return {
      intent: (['capture', 'ask', 'reflect', 'converse', 'action'].includes(raw.intent) ? raw.intent : 'capture') as InputIntent,
      confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.6,
      should_store: typeof raw.should_store === 'boolean' ? raw.should_store : raw.intent === 'capture',
      response_needed: typeof raw.response_needed === 'boolean' ? raw.response_needed : raw.intent !== 'capture',
      reasoning: raw.reasoning || 'GPT classification',
    }
  } catch (error) {
    console.error('Intent router GPT fallback failed:', error)
    // Safe default: treat as capture (existing behavior)
    return {
      intent: 'capture',
      confidence: 0.5,
      should_store: true,
      response_needed: false,
      reasoning: 'Fallback — GPT classification failed',
    }
  }
}

/**
 * Main entry point: classify user input intent.
 * Fast path: deterministic pattern match (~0ms).
 * Slow path: GPT call (~200-500ms) only when uncertain.
 */
export async function classifyIntent(input: string): Promise<IntentRouterResult> {
  const fast = classifyDeterministic(input)
  if (fast) return fast
  return classifyWithGPT(input)
}
