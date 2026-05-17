import { getOpenAIClient } from './openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { format, startOfToday, subDays } from 'date-fns'
import { getInterruptedThreads } from '@/lib/cognition/interruption-engine'
import { getPendingFollowUps } from '@/lib/cognition/follow-up-detection'
import { calculateContinuityScore } from '@/lib/cognition/continuity-scoring'
import { generateRecoveryNudge } from '@/lib/cognition/recovery-prompts'

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

  // Gather data for the brief
  const [commitmentsRes, tasksRes, recentMemoriesRes, remindersRes] = await Promise.all([
    // Due or overdue commitments
    supabase
      .from('commitments')
      .select('*, people(name)')
      .eq('user_id', userId)
      .in('status', ['active', 'overdue'])
      .lte('due_date', todayStr)
      .order('due_date', { ascending: true }),

    // Pending tasks
    supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['pending', 'in_progress'])
      .order('priority', { ascending: true })
      .limit(10),

    // Recent memories (last 2 days)
    supabase
      .from('memory_items')
      .select('summary, raw_content, created_at')
      .eq('user_id', userId)
      .eq('processed', true)
      .gte('created_at', subDays(today, 2).toISOString())
      .order('created_at', { ascending: false })
      .limit(10),

    // Pending reminders
    supabase
      .from('reminders')
      .select('message, remind_at')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .lte('remind_at', new Date().toISOString())
      .limit(5),
  ])

  const commitments = commitmentsRes.data || []
  const tasks = tasksRes.data || []
  const recentMemories = recentMemoriesRes.data || []
  const reminders = remindersRes.data || []

  // Gather continuity intelligence
  let interruptedThreadsContext = ''
  let followUpsContext = ''
  let continuityContext = ''

  try {
    const [threads, followUps, continuity] = await Promise.all([
      getInterruptedThreads(userId, 3),
      getPendingFollowUps(userId, 3),
      calculateContinuityScore(userId),
    ])

    if (threads.length > 0) {
      // Get people for each thread
      const threadNudges = await Promise.all(
        threads.map(async (t) => {
          const { data: memPeople } = await supabase
            .from('memory_people')
            .select('people(name)')
            .eq('memory_id', t.originating_memory_id || '')
          const names = (memPeople || []).map(mp => (mp.people as unknown as { name: string })?.name).filter(Boolean)
          return generateRecoveryNudge(t.title, t.continuity_retention, names)
        })
      )
      interruptedThreadsContext = `Interrupted threads:\n${threadNudges.map(n => `- ${n}`).join('\n')}`
    }

    if (followUps.length > 0) {
      followUpsContext = `Follow-up nudges:\n${followUps.map(f => `- ${f.description} (${f.status === 'pending' && f.follow_up_due_at && new Date(f.follow_up_due_at) < new Date() ? 'overdue' : 'upcoming'})`).join('\n')}`
    }

    continuityContext = `Continuity health: ${continuity.score.toFixed(0)}/100 (${continuity.state.replace(/_/g, ' ')})`
  } catch (error) {
    console.error('Continuity data for brief (non-fatal):', error)
  }

  // Build context
  const context = [
    commitments.length > 0
      ? `Due commitments:\n${commitments.map(c => `- ${c.description}${c.people ? ` (with ${(c.people as { name: string }).name})` : ''}${c.due_date ? ` — due ${c.due_date}` : ''}`).join('\n')}`
      : 'No commitments due.',

    tasks.length > 0
      ? `Pending tasks:\n${tasks.map(t => `- [${t.priority}] ${t.title}${t.due_date ? ` — due ${t.due_date}` : ''}`).join('\n')}`
      : 'No pending tasks.',

    recentMemories.length > 0
      ? `Recent memories:\n${recentMemories.map(m => `- ${m.summary || m.raw_content?.substring(0, 100)}`).join('\n')}`
      : 'No recent memories captured.',

    reminders.length > 0
      ? `Reminders:\n${reminders.map(r => `- ${r.message}`).join('\n')}`
      : '',

    interruptedThreadsContext,
    followUpsContext,
    continuityContext,
  ].filter(Boolean).join('\n\n')

  // Generate brief with GPT-4o-mini
  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a warm, supportive daily briefing assistant for a cognitive continuity tool. Generate a brief daily summary that helps the user restore their continuity — reconnecting with where they left off, what needs attention, and what may have been forgotten. Your tone should be calm, gentle, and professional — never clinical.

Guidelines:
- Start with a gentle greeting
- If there are interrupted threads, weave them naturally into the brief ("You were discussing..." or "A thread with Sarah appears paused...")
- Highlight commitments that need attention (use "You may want to revisit..." not "You forgot...")
- Include follow-up nudges if any are due or overdue
- Mention the continuity health state if it's below "stable"
- List key tasks in priority order
- Keep it concise — 200-300 words
- Use markdown formatting (headers, bullets)
- If there's nothing pressing, acknowledge that warmly
- Never use the words: tasks, todos, productivity, execution, efficiency

Today's date: ${format(today, 'EEEE, MMMM d, yyyy')}`,
      },
      {
        role: 'user',
        content: context,
      },
    ],
    temperature: 0.4,
    max_tokens: 600,
  })

  const brief = completion.choices[0].message.content || 'No brief available for today.'

  // Cache the brief
  await supabase.from('daily_briefs').upsert({
    user_id: userId,
    brief_date: todayStr,
    content: brief,
    commitments_due: commitments,
  })

  return brief
}
