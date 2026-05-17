/**
 * Recovery prompt styles based on continuity retention level.
 * Gentle language that respects the user's cognitive state.
 */

interface RecoveryPromptStyle {
  tone: string
  instruction: string
  prefix: string
}

/**
 * Get the appropriate prompt style based on how much retention remains.
 * Higher retention = more direct. Lower retention = more gentle.
 */
export function getRecoveryPromptStyle(retention: number): RecoveryPromptStyle {
  if (retention > 0.7) {
    return {
      tone: 'Use a warm, matter-of-fact tone — the user likely remembers this.',
      instruction: 'This thread is still fresh. Provide a brief reconnection point.',
      prefix: 'This thread appears paused',
    }
  }

  if (retention > 0.4) {
    return {
      tone: 'Use a gentle, supportive tone — the user may have partially forgotten.',
      instruction: 'This thread has been dormant for a while. Provide enough context to restore continuity.',
      prefix: 'You may want to return to this',
    }
  }

  if (retention > 0.15) {
    return {
      tone: 'Use a very gentle, non-pressuring tone — this has been dormant a long time.',
      instruction: 'This is a significantly decayed thread. Only surface it if the obligations are meaningful.',
      prefix: 'This has been dormant — revisit when ready',
    }
  }

  return {
    tone: 'Use the most gentle possible tone — this may no longer be relevant.',
    instruction: 'This thread has nearly fully decayed. Mention it only as context, not as an obligation.',
    prefix: 'A distant thread that may or may not still matter',
  }
}

/**
 * Generate a human-readable recovery nudge for the daily brief.
 */
export function generateRecoveryNudge(
  title: string,
  retention: number,
  peopleMentioned: string[]
): string {
  const style = getRecoveryPromptStyle(retention)
  const peopleStr = peopleMentioned.length > 0
    ? ` with ${peopleMentioned.join(' and ')}`
    : ''

  if (retention > 0.7) {
    return `You were discussing ${title}${peopleStr}. This thread appears paused since recently.`
  }

  if (retention > 0.4) {
    return `You may want to revisit ${title}${peopleStr} — this has been unresolved for several days.`
  }

  if (retention > 0.15) {
    return `${title}${peopleStr} has been dormant. Revisit when ready, or dismiss if no longer relevant.`
  }

  return `A distant thread: ${title}${peopleStr}. This may no longer need attention.`
}
