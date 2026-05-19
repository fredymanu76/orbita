import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Thread State Engine — auto-transitions thread statuses based on activity patterns.
 *
 * Transitions:
 * - active → unresolved (3+ days no activity + open commitments)
 * - active → paused (7+ days no activity)
 * - paused → forgotten_risk (retention < 0.3)
 * - Any → time_sensitive (commitments due within 48h)
 * - forgotten_risk → active (new capture links to it — handled in thread-linker)
 *
 * Run in daily cron alongside decay processing.
 */
export async function runThreadStateTransitions(userId: string): Promise<{
  transitions: { threadId: string; from: string; to: string; reason: string }[]
}> {
  const supabase = createAdminClient()
  const transitions: { threadId: string; from: string; to: string; reason: string }[] = []
  const now = new Date()

  // Fetch all non-completed threads
  const { data: threads } = await supabase
    .from('threads')
    .select('id, status, last_activity_at, continuity_retention, commitment_count')
    .eq('user_id', userId)
    .not('status', 'in', '("completed")')

  if (!threads) return { transitions }

  for (const thread of threads) {
    const lastActivity = new Date(thread.last_activity_at)
    const daysSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
    let newStatus: string | null = null
    let reason = ''

    // Check for time-sensitive (commitments due within 48h)
    if (thread.commitment_count > 0 && thread.status !== 'completed') {
      const { data: urgentCommitments } = await supabase
        .from('thread_entities')
        .select('entity_id, commitments(due_date, status)')
        .eq('thread_id', thread.id)
        .eq('entity_type', 'commitment')

      const hasUrgent = (urgentCommitments || []).some(te => {
        const commitment = te.commitments as unknown as { due_date: string | null; status: string } | null
        if (!commitment || commitment.status !== 'active' || !commitment.due_date) return false
        const dueDate = new Date(commitment.due_date)
        const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60)
        return hoursUntilDue >= 0 && hoursUntilDue <= 48
      })

      if (hasUrgent && thread.status !== 'time_sensitive') {
        newStatus = 'time_sensitive'
        reason = 'Commitment due within 48 hours'
      }
    }

    // Check for cooling → completed (7 days no activity while cooling)
    if (!newStatus && thread.status === 'cooling' && daysSinceActivity >= 7) {
      newStatus = 'completed'
      reason = `Cooling period ended — no activity for ${Math.floor(daysSinceActivity)} days`
    }

    // Skip further checks if already transitioning to time_sensitive or completed
    if (!newStatus) {
      // Check if all commitments are resolved → transition to cooling
      if (thread.status === 'active' && thread.commitment_count > 0) {
        const { data: threadCommitments } = await supabase
          .from('thread_entities')
          .select('entity_id, commitments(status)')
          .eq('thread_id', thread.id)
          .eq('entity_type', 'commitment')

        const allResolved = (threadCommitments || []).every(te => {
          const c = te.commitments as unknown as { status: string } | null
          return !c || c.status !== 'active'
        })

        if (allResolved && (threadCommitments || []).length > 0) {
          newStatus = 'cooling'
          reason = 'All commitments resolved — entering cooling period'
        }
      }
    }

    if (!newStatus) {
      if (thread.status === 'active' && daysSinceActivity >= 3 && thread.commitment_count > 0) {
        // Check if any commitments are still active
        const { data: activeCommitments } = await supabase
          .from('thread_entities')
          .select('entity_id, commitments(status)')
          .eq('thread_id', thread.id)
          .eq('entity_type', 'commitment')

        const hasActive = (activeCommitments || []).some(te => {
          const c = te.commitments as unknown as { status: string } | null
          return c?.status === 'active'
        })

        if (hasActive) {
          newStatus = 'unresolved'
          reason = `No activity for ${Math.floor(daysSinceActivity)} days with open commitments`
        }
      }

      if (!newStatus && thread.status === 'active' && daysSinceActivity >= 7) {
        newStatus = 'paused'
        reason = `No activity for ${Math.floor(daysSinceActivity)} days`
      }

      if (!newStatus && thread.status === 'paused' && thread.continuity_retention < 0.3) {
        newStatus = 'forgotten_risk'
        reason = `Retention dropped to ${Math.round(thread.continuity_retention * 100)}%`
      }
    }

    if (newStatus && newStatus !== thread.status) {
      await supabase
        .from('threads')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', thread.id)

      transitions.push({
        threadId: thread.id,
        from: thread.status,
        to: newStatus,
        reason,
      })
    }
  }

  return { transitions }
}

/**
 * Apply memory decay to thread retention scores.
 * Should be called from the daily cron.
 */
export async function decayThreadRetention(userId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: threads } = await supabase
    .from('threads')
    .select('id, continuity_retention, decay_coefficient')
    .eq('user_id', userId)
    .not('status', 'in', '("completed")')
    .gt('continuity_retention', 0)

  if (!threads) return

  for (const thread of threads) {
    const newRetention = Math.max(0, thread.continuity_retention - thread.decay_coefficient)
    await supabase
      .from('threads')
      .update({
        continuity_retention: newRetention,
        updated_at: new Date().toISOString(),
      })
      .eq('id', thread.id)
  }
}
