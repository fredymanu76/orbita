import type { UserState } from '@/lib/types'

export interface InterfaceState {
  density: 'minimal' | 'reduced' | 'normal'
  tone: 'containing' | 'warm' | 'neutral'
  suppressed_sections: string[]
  max_items: number
  show_patterns: boolean
  show_relational: boolean
}

/**
 * Pure function — no DB calls.
 * Computes how the interface should adapt based on user state, cognitive load,
 * emotional trend, and volatility. Replaces the scattered state-adaptive filtering
 * and buildRecoveryIntelligence logic.
 */
export function computeInterfaceState(
  state: UserState,
  previousState: UserState | null,
  loadScore: number,
  emotionalTrend: string,
  volatility: number
): InterfaceState {
  // overwhelmed OR stretched + high load → minimal, suppress almost everything
  if (state === 'overwhelmed' || (state === 'stretched' && loadScore > 0.7)) {
    return {
      density: 'minimal',
      tone: 'containing',
      suppressed_sections: ['pressureSignals', 'threadStability', 'identitySnapshot'],
      max_items: 1,
      show_patterns: false,
      show_relational: false,
    }
  }

  // in_flow → minimal, don't interrupt
  if (state === 'in_flow') {
    return {
      density: 'minimal',
      tone: 'neutral',
      suppressed_sections: ['pressureSignals', 'relationalPressure'],
      max_items: 0,
      show_patterns: false,
      show_relational: false,
    }
  }

  // recovering from overwhelmed/isolated → reduced, gentle re-engagement
  if (state === 'recovering' && (previousState === 'overwhelmed' || previousState === 'isolated')) {
    return {
      density: 'reduced',
      tone: 'warm',
      suppressed_sections: ['pressureSignals'],
      max_items: 2,
      show_patterns: false,
      show_relational: true,
    }
  }

  // declining trend + moderate load + elevated volatility → reduced, containing
  if (emotionalTrend === 'declining' && loadScore > 0.5 && volatility > 0.4) {
    return {
      density: 'reduced',
      tone: 'containing',
      suppressed_sections: [],
      max_items: 3,
      show_patterns: true,
      show_relational: true,
    }
  }

  // default → normal
  return {
    density: 'normal',
    tone: 'neutral',
    suppressed_sections: [],
    max_items: 5,
    show_patterns: true,
    show_relational: true,
  }
}

/**
 * Derive recovery intelligence from interface state.
 * This replaces the standalone buildRecoveryIntelligence function
 * while maintaining backward compatibility with the existing
 * MorningSynthesis.recoveryIntelligence shape.
 */
export function deriveRecoveryIntelligence(
  interfaceState: InterfaceState
): {
  isActive: boolean
  mode: 'overloaded' | 'depleted' | 'fatigued'
  instruction: string
  suppressedSections: string[]
} | null {
  if (interfaceState.density === 'minimal' && interfaceState.tone === 'containing') {
    return {
      isActive: true,
      mode: 'overloaded',
      instruction: 'Only the most important thing. Everything else can wait.',
      suppressedSections: interfaceState.suppressed_sections,
    }
  }

  if (interfaceState.density === 'reduced' && interfaceState.tone === 'warm') {
    return {
      isActive: true,
      mode: 'depleted',
      instruction: 'You are coming back from a heavy period.',
      suppressedSections: interfaceState.suppressed_sections,
    }
  }

  if (interfaceState.density === 'reduced' && interfaceState.tone === 'containing') {
    return {
      isActive: true,
      mode: 'fatigued',
      instruction: 'Your signals suggest building fatigue.',
      suppressedSections: interfaceState.suppressed_sections,
    }
  }

  return null
}
