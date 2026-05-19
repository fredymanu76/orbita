import type { PersonaMode, UserState } from '@/lib/types'

const GENERIC_PROMPTS = [
  "What's on your mind?",
  'Quick capture...',
  'Something you want to remember?',
  'What happened today?',
]

const PERSONA_PROMPTS: Record<PersonaMode, { morning: string[]; afternoon: string[]; evening: string[] }> = {
  carer: {
    morning: ['How are things this morning?', 'Anything on your mind about today?', 'Who needs you today?'],
    afternoon: ['How has the day been?', 'Anything you need to remember from today?'],
    evening: ['How did today go?', 'Anything you want to capture before the day ends?'],
  },
  worker: {
    morning: ['What\'s the priority today?', 'Anything to capture before your day starts?'],
    afternoon: ['How is the day going?', 'Any updates to capture?'],
    evening: ['What happened today that matters?', 'Anything to follow up on tomorrow?'],
  },
  parent: {
    morning: ['What\'s the plan today?', 'Anything the kids need today?'],
    afternoon: ['How\'s the day going?', 'Anything to remember for later?'],
    evening: ['How did today go with the family?', 'What happened today?'],
  },
  founder: {
    morning: ['What\'s the biggest thing to move today?', 'Any decisions to capture?'],
    afternoon: ['How are things progressing?', 'Any blockers to note?'],
    evening: ['What moved today?', 'Any learnings from today?'],
  },
  faith_community: {
    morning: ['How are you starting the day?', 'Anything on your heart this morning?'],
    afternoon: ['How is your day going?', 'Anything to reflect on?'],
    evening: ['What stood out today?', 'Anything you\'re grateful for?'],
  },
  student: {
    morning: ['What\'s on the schedule today?', 'Anything due soon?'],
    afternoon: ['How are studies going?', 'Anything to capture from today?'],
    evening: ['What did you learn today?', 'Any deadlines to remember?'],
  },
  general: {
    morning: ['How are things this morning?', "What's on your mind?"],
    afternoon: ['How is the day going?', 'Anything to capture?'],
    evening: ['How was today?', 'Anything you want to remember?'],
  },
}

const STALE_THREAD_PROMPT = 'Any update on "{title}"?'
const EVENING_NO_CAPTURES = 'What happened today that you want to remember?'

interface AdaptivePromptContext {
  persona: PersonaMode | null
  state: UserState | null
  staleThreadTitle: string | null
  captureCountToday: number
}

/**
 * Returns a context-aware placeholder for the capture bar.
 * Static prompt banks per persona. No GPT.
 */
export function getAdaptivePrompt(context: AdaptivePromptContext): string {
  const hour = new Date().getHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  // Evening + no captures today
  if (timeOfDay === 'evening' && context.captureCountToday === 0) {
    return EVENING_NO_CAPTURES
  }

  // Stale thread prompt
  if (context.staleThreadTitle) {
    return STALE_THREAD_PROMPT.replace('{title}', context.staleThreadTitle)
  }

  // Persona-specific
  if (context.persona) {
    const prompts = PERSONA_PROMPTS[context.persona]?.[timeOfDay] ?? GENERIC_PROMPTS
    return prompts[Math.floor(Math.random() * prompts.length)]
  }

  return GENERIC_PROMPTS[Math.floor(Math.random() * GENERIC_PROMPTS.length)]
}
