import { createAdminClient } from '@/lib/supabase/admin'
import { format, startOfToday, subDays } from 'date-fns'
import { calculateContinuityScore } from '@/lib/cognition/continuity-scoring'

/**
 * Generate a structured daily brief — deterministic, not GPT prose.
 * Returns structured data that the UI renders directly.
 */
export interface StructuredBrief {
  continuity_state: string
  active_thread_count: number
  unresolved_thread_count: number
  overdue_commitments: {
    description: string
    person_name: string | null
    due_date: string
    days_overdue: number
  }[]
  due_today: {
    description: string
    person_name: string | null
  }[]
  threads_needing_attention: {
    id: string
    title: string
    status: string
    thread_type: string
    retention: number
    commitment_count: number
    last_activity_days: number
  }[]
  people_mentioned_recently: string[]
  follow_ups_due: {
    description: string
    overdue: boolean
  }[]
}

export async function generateDailyBrief(userId: string): Promise<string> {
  const supabase = createAdminClient()
  const today = startOfToday()
  const todayStr = format(today, 'yyyy-MM-dd')

  // Check for cached brief
  const { data: existing } = await supabase
    .from('daily_briefs')
    .select('content')
    .eq('user_id', userId)
    .eq('brief_date', todayStr)
    .single()

  if (existing) return existing.content

  // Generate structured brief
  const brief = await generateStructuredBrief(userId, todayStr)

  // Render to markdown — deterministic, no GPT
  const markdown = renderBriefMarkdown(brief, today)

  // Cache
  await supabase.from('daily_briefs').upsert({
    user_id: userId,
    brief_date: todayStr,
    content: markdown,
    commitments_due: brief.overdue_commitments,
  })

  return markdown
}

export async function generateStructuredBrief(userId: string, todayStr: string): Promise<StructuredBrief> {
  const supabase = createAdminClient()
  const today = new Date(todayStr)
  const now = new Date()

  const [
    commitmentsRes,
    threadsRes,
    followUpsRes,
    recentPeopleRes,
    continuityRes,
  ] = await Promise.all([
    supabase
      .from('commitments')
      .select('*, people(name)')
      .eq('user_id', userId)
      .in('status', ['active', 'overdue'])
      .lte('due_date', todayStr)
      .order('due_date', { ascending: true }),

    supabase
      .from('threads')
      .select('id, title, status, thread_type, continuity_retention, commitment_count, last_activity_at')
      .eq('user_id', userId)
      .not('status', 'in', '("completed","paused")'),

    supabase
      .from('follow_up_candidates')
      .select('description, follow_up_due_at, status')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .limit(5),

    supabase
      .from('people')
      .select('name')
      .eq('user_id', userId)
      .gte('last_mentioned_at', subDays(today, 7).toISOString())
      .order('last_mentioned_at', { ascending: false })
      .limit(5),

    calculateContinuityScore(userId).catch(() => ({ score: 0, state: 'stable' as const })),
  ])

  const commitments = commitmentsRes.data || []
  const threads = threadsRes.data || []
  const followUps = followUpsRes.data || []
  const recentPeople = recentPeopleRes.data || []

  const overdue = commitments
    .filter(c => c.due_date && c.due_date < todayStr)
    .map(c => ({
      description: c.description,
      person_name: (c.people as unknown as { name: string } | null)?.name || null,
      due_date: c.due_date,
      days_overdue: Math.floor((now.getTime() - new Date(c.due_date).getTime()) / 86400000),
    }))

  const dueToday = commitments
    .filter(c => c.due_date === todayStr)
    .map(c => ({
      description: c.description,
      person_name: (c.people as unknown as { name: string } | null)?.name || null,
    }))

  const threadsNeedingAttention = threads
    .filter(t => ['unresolved', 'forgotten_risk', 'time_sensitive'].includes(t.status) || t.continuity_retention < 0.5)
    .map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      thread_type: t.thread_type,
      retention: t.continuity_retention,
      commitment_count: t.commitment_count,
      last_activity_days: Math.floor((now.getTime() - new Date(t.last_activity_at).getTime()) / 86400000),
    }))
    .slice(0, 5)

  const followUpsDue = followUps.map(f => ({
    description: f.description,
    overdue: f.follow_up_due_at ? new Date(f.follow_up_due_at) < now : false,
  }))

  return {
    continuity_state: continuityRes.state,
    active_thread_count: threads.filter(t => t.status === 'active').length,
    unresolved_thread_count: threads.filter(t => ['unresolved', 'forgotten_risk', 'time_sensitive'].includes(t.status)).length,
    overdue_commitments: overdue,
    due_today: dueToday,
    threads_needing_attention: threadsNeedingAttention,
    people_mentioned_recently: recentPeople.map(p => p.name),
    follow_ups_due: followUpsDue,
  }
}

function renderBriefMarkdown(brief: StructuredBrief, today: Date): string {
  const parts: string[] = []

  // State summary
  parts.push(`## ${format(today, 'EEEE, MMMM d')}`)
  parts.push(`**${brief.continuity_state.replace(/_/g, ' ')}** — ${brief.active_thread_count} active threads${brief.unresolved_thread_count > 0 ? `, ${brief.unresolved_thread_count} unresolved` : ''}`)

  // Overdue
  if (brief.overdue_commitments.length > 0) {
    parts.push('\n### Overdue')
    for (const c of brief.overdue_commitments) {
      parts.push(`- ${c.description}${c.person_name ? ` (${c.person_name})` : ''} — ${c.days_overdue}d overdue`)
    }
  }

  // Due today
  if (brief.due_today.length > 0) {
    parts.push('\n### Due today')
    for (const c of brief.due_today) {
      parts.push(`- ${c.description}${c.person_name ? ` (${c.person_name})` : ''}`)
    }
  }

  // Threads needing attention
  if (brief.threads_needing_attention.length > 0) {
    parts.push('\n### Threads needing attention')
    for (const t of brief.threads_needing_attention) {
      const retention = `${Math.round(t.retention * 100)}% retained`
      const activity = t.last_activity_days > 0 ? `${t.last_activity_days}d since activity` : 'active today'
      parts.push(`- **${t.title}** — ${t.status.replace('_', ' ')}, ${retention}, ${activity}`)
    }
  }

  // Follow-ups
  if (brief.follow_ups_due.length > 0) {
    parts.push('\n### Follow-ups')
    for (const f of brief.follow_ups_due) {
      parts.push(`- ${f.description}${f.overdue ? ' (overdue)' : ''}`)
    }
  }

  // Clear state
  if (brief.overdue_commitments.length === 0 && brief.due_today.length === 0 &&
      brief.threads_needing_attention.length === 0 && brief.follow_ups_due.length === 0) {
    parts.push('\nYour threads are clear. Continuity is stable.')
  }

  return parts.join('\n')
}
