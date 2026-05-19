/**
 * Intervention Engine — decides what cognitive state transition to create.
 *
 * This sits between intent classification and response generation.
 * Instead of asking "what data do I have?", it asks:
 * "what will improve this person's cognitive state right now?"
 *
 * Memory supports intervention. It does not dominate it.
 *
 * Fully deterministic — no GPT calls.
 */

import type {
  InputIntent,
  UserState,
  InterventionType,
  InterventionStrategy,
  StateTransitionGoal,
} from '@/lib/types'

// --- Signal detection from user input ---

const OVERWHELM_SIGNALS = [
  'overwhelmed', 'too much', 'can\'t cope', 'can\'t handle',
  'drowning', 'buried', 'swamped', 'overloaded', 'so much going on',
  'falling apart', 'losing it', 'can\'t keep up', 'everything at once',
  'head is spinning', 'don\'t know where to start',
]

const ANXIETY_SIGNALS = [
  'anxious', 'anxiety', 'worried', 'worrying', 'nervous', 'panic',
  'stressed', 'stress', 'tension', 'tense', 'uneasy', 'restless',
  'on edge', 'can\'t relax', 'can\'t sleep', 'racing thoughts',
  'dread', 'fear', 'scared', 'frightened',
]

const STUCK_SIGNALS = [
  'stuck', 'blocked', 'don\'t know what to do', 'paralysed', 'paralyzed',
  'frozen', 'indecisive', 'can\'t decide', 'going in circles',
  'no progress', 'not moving', 'spinning my wheels',
]

const ISOLATION_SIGNALS = [
  'alone', 'lonely', 'isolated', 'no one', 'nobody', 'disconnected',
  'by myself', 'on my own', 'miss people', 'miss my',
]

const BURNOUT_SIGNALS = [
  'burnt out', 'burned out', 'burnout', 'exhausted', 'depleted',
  'running on empty', 'nothing left', 'drained', 'done',
  'can\'t do this anymore', 'had enough', 'giving up',
]

const AVOIDANCE_SIGNALS = [
  'putting off', 'avoiding', 'procrastinating', 'don\'t want to',
  'keep ignoring', 'haven\'t dealt with', 'pushing away',
  'don\'t want to think about', 'later',
]

const MOMENTUM_SIGNALS = [
  'good day', 'great day', 'productive', 'on a roll', 'making progress',
  'feeling good', 'energised', 'energized', 'motivated', 'momentum',
  'in the zone', 'focused', 'crushing it', 'getting things done',
]

const PRIORITIZE_SIGNALS = [
  'prioriti', 'what should i focus', 'what\'s most important',
  'what matters', 'what first', 'where to start', 'what next',
  'what do i do', 'to do', 'todo', 'what\'s urgent',
]

interface InterventionInput {
  intent: InputIntent
  userInput: string
  currentState: UserState | null
  overloadScore: number // 0-1, from continuity/cognitive load
  openLoopCount: number
  unresolvedCommitments: number
}

/**
 * Detect what kind of emotional/cognitive signal the input contains.
 */
function detectSignals(input: string): {
  overwhelm: boolean
  anxiety: boolean
  stuck: boolean
  isolation: boolean
  burnout: boolean
  avoidance: boolean
  momentum: boolean
  prioritize: boolean
} {
  const lower = input.toLowerCase()
  return {
    overwhelm: OVERWHELM_SIGNALS.some(s => lower.includes(s)),
    anxiety: ANXIETY_SIGNALS.some(s => lower.includes(s)),
    stuck: STUCK_SIGNALS.some(s => lower.includes(s)),
    isolation: ISOLATION_SIGNALS.some(s => lower.includes(s)),
    burnout: BURNOUT_SIGNALS.some(s => lower.includes(s)),
    avoidance: AVOIDANCE_SIGNALS.some(s => lower.includes(s)),
    momentum: MOMENTUM_SIGNALS.some(s => lower.includes(s)),
    prioritize: PRIORITIZE_SIGNALS.some(s => lower.includes(s)),
  }
}

/**
 * Classify the intervention type from signals + state.
 */
function classifyIntervention(
  signals: ReturnType<typeof detectSignals>,
  state: UserState | null,
  overloadScore: number,
): InterventionType {
  // Burnout takes highest priority
  if (signals.burnout) return 'burnout_detection'

  // Overwhelm / anxiety — need cognitive load reduction
  if (signals.overwhelm || signals.anxiety) return 'reduce_overwhelm'
  if (state === 'overwhelmed') return 'reduce_overwhelm'

  // State-inferred overwhelm even without explicit signal
  if (overloadScore > 0.7 && state === 'stretched') return 'reduce_overwhelm'

  // Isolation
  if (signals.isolation || state === 'isolated') return 'social_reconnection'

  // Avoidance
  if (signals.avoidance) return 'avoidance_detection'

  // Stuck
  if (signals.stuck) return 'clarification'

  // Momentum — don't interrupt, sustain
  if (signals.momentum || state === 'in_flow') return 'momentum_support'

  // Prioritize
  if (signals.prioritize) return 'prioritize'

  // Drifting state
  if (state === 'drifting') return 'clarification'

  // Recovering — gentle support
  if (state === 'recovering') return 'emotional_regulation'

  return 'general_guidance'
}

/**
 * Determine the target state transition.
 */
function getStateTransitionGoal(
  intervention: InterventionType,
  currentState: UserState | null
): StateTransitionGoal {
  switch (intervention) {
    case 'reduce_overwhelm':
      return 'overwhelmed→calmer'
    case 'emotional_regulation':
      return 'stressed→stabilised'
    case 'prioritize':
      return currentState === 'drifting' ? 'drifting→anchored' : 'fragmented→focused'
    case 'clarification':
      return 'stuck→moving'
    case 'social_reconnection':
      return 'isolated→connected'
    case 'momentum_support':
      return 'in_flow→sustained'
    case 'burnout_detection':
      return 'overwhelmed→calmer'
    case 'avoidance_detection':
      return 'avoidant→engaged'
    case 'general_guidance':
      return currentState === 'stable' ? 'stable→stable' : 'fragmented→focused'
  }
}

/**
 * Build the full intervention strategy.
 */
function buildStrategy(
  intervention: InterventionType,
  goal: StateTransitionGoal,
  state: UserState | null,
  overloadScore: number,
  openLoopCount: number,
): InterventionStrategy {
  switch (intervention) {
    case 'reduce_overwhelm':
      return {
        intervention,
        goal,
        max_points: 1,
        max_words: 120,
        tone: 'calm',
        memory_scope: 'minimal',
        should_ask_question: false,
        should_reduce_scope: true,
        response_instruction:
          'The user is overwhelmed or anxious. Your job is to REDUCE cognitive load, not add to it. ' +
          'Do NOT list multiple obligations or responsibilities. Do NOT give generic wellness advice. ' +
          'Identify the single most time-sensitive thing from their data. Tell them that one thing, ' +
          'and explicitly say everything else can wait. If nothing is urgent, tell them nothing needs ' +
          'immediate action and they can pause. Keep the response to 2-3 sentences maximum. ' +
          'Tone: grounding, steady, containing. No exclamation marks. No enthusiasm.',
        reasoning: 'Elevated stress detected — reducing cognitive load, not adding to it',
      }

    case 'burnout_detection':
      return {
        intervention,
        goal,
        max_points: 0,
        max_words: 80,
        tone: 'warm',
        memory_scope: 'none',
        should_ask_question: false,
        should_reduce_scope: true,
        response_instruction:
          'The user is showing signs of burnout or exhaustion. Do NOT suggest tasks, actions, ' +
          'or obligations. Do NOT reference their threads, commitments, or responsibilities. ' +
          'Acknowledge what they are feeling. Give them permission to stop. ' +
          'One sentence of acknowledgment, one sentence of permission. That is all.',
        reasoning: 'Burnout signals detected — no action items, only acknowledgment',
      }

    case 'emotional_regulation':
      return {
        intervention,
        goal,
        max_points: 1,
        max_words: 150,
        tone: 'warm',
        memory_scope: 'selective',
        should_ask_question: false,
        should_reduce_scope: true,
        response_instruction:
          'The user needs emotional stabilisation. Reflect back what they seem to be feeling. ' +
          'If their data shows a pattern or value relevant to this moment, connect to it briefly. ' +
          'Do not list obligations. Do not give advice unless they asked for it. ' +
          'If you reference data, use it to show understanding, not to add tasks. ' +
          '2-3 sentences maximum.',
        reasoning: 'Emotional regulation needed — reflect, contain, stabilise',
      }

    case 'prioritize':
      return {
        intervention,
        goal,
        max_points: 3,
        max_words: 200,
        tone: 'direct',
        memory_scope: 'selective',
        should_ask_question: false,
        should_reduce_scope: openLoopCount > 5,
        response_instruction:
          'The user wants to know what to focus on. Use their actual commitments, threads, ' +
          'and due dates to identify the top 1-3 priorities. Reference specific items by name. ' +
          'Order by: overdue first, then time-sensitive, then highest importance. ' +
          'If they have many open items, explicitly say which ones to defer. ' +
          'Use format: 1. **Name** — why this is first. Be specific, not generic.',
        reasoning: 'Prioritisation requested — surface the most important items from data',
      }

    case 'clarification':
      return {
        intervention,
        goal,
        max_points: 2,
        max_words: 150,
        tone: 'encouraging',
        memory_scope: 'selective',
        should_ask_question: true,
        should_reduce_scope: false,
        response_instruction:
          'The user feels stuck or uncertain. Don\'t overwhelm them with options. ' +
          'Name one concrete next step from their data (a specific commitment, thread, or action). ' +
          'Then ask one clarifying question to help them move forward. ' +
          'The question should reduce their uncertainty, not add complexity.',
        reasoning: 'User is stuck — provide one concrete step and one clarifying question',
      }

    case 'social_reconnection':
      return {
        intervention,
        goal,
        max_points: 1,
        max_words: 120,
        tone: 'warm',
        memory_scope: 'selective',
        should_ask_question: false,
        should_reduce_scope: false,
        response_instruction:
          'The user feels disconnected or isolated. If their data shows people they care about ' +
          '(high gravity, recent mentions), suggest reconnecting with ONE specific person by name. ' +
          'Frame it as something small and manageable, not another obligation. ' +
          'If no people data exists, acknowledge the feeling and gently ask who matters to them.',
        reasoning: 'Isolation detected — suggest one reconnection, not a social agenda',
      }

    case 'momentum_support':
      return {
        intervention,
        goal,
        max_points: 1,
        max_words: 80,
        tone: 'encouraging',
        memory_scope: 'minimal',
        should_ask_question: false,
        should_reduce_scope: true,
        response_instruction:
          'The user is in a good flow state. Do NOT interrupt with obligations or complexity. ' +
          'Brief acknowledgment. If relevant, mention one thing they\'re making progress on. ' +
          'Keep it to 1-2 sentences. Stay out of their way.',
        reasoning: 'Positive momentum — stay quiet, don\'t interrupt flow',
      }

    case 'avoidance_detection':
      return {
        intervention,
        goal,
        max_points: 1,
        max_words: 150,
        tone: 'grounding' as 'calm',
        memory_scope: 'selective',
        should_ask_question: true,
        should_reduce_scope: false,
        response_instruction:
          'The user may be avoiding something. Don\'t be confrontational. ' +
          'If their data shows something they\'ve been deferring (overdue commitment, ' +
          'declining thread retention), name it gently. Ask if they want to talk about ' +
          'what\'s making it hard to engage with it. One observation, one question.',
        reasoning: 'Avoidance pattern detected — gentle surfacing with empathy',
      }

    case 'general_guidance':
    default:
      return {
        intervention: 'general_guidance',
        goal,
        max_points: state === 'stretched' ? 2 : 3,
        max_words: state === 'stretched' ? 150 : 250,
        tone: 'direct',
        memory_scope: 'selective',
        should_ask_question: false,
        should_reduce_scope: false,
        response_instruction:
          'Provide guidance based on the user\'s actual data. Reference specific threads, ' +
          'commitments, and people by name. Each point should connect to a real item. ' +
          'Use format: 1. **Name** — action. No generic advice.',
        reasoning: 'General guidance — data-grounded, concise response',
      }
  }
}

/**
 * Main entry point: determine the intervention strategy for a user request.
 *
 * Fully deterministic — no GPT calls. ~0ms latency.
 */
export function determineIntervention(input: InterventionInput): InterventionStrategy {
  const signals = detectSignals(input.userInput)
  const intervention = classifyIntervention(signals, input.currentState, input.overloadScore)
  const goal = getStateTransitionGoal(intervention, input.currentState)

  return buildStrategy(
    intervention,
    goal,
    input.currentState,
    input.overloadScore,
    input.openLoopCount,
  )
}
