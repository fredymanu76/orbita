import { SupabaseClient } from '@supabase/supabase-js'
import { parseISO, subHours, isValid, nextFriday, nextMonday, nextTuesday, nextWednesday, nextThursday, nextSaturday, nextSunday, addDays, startOfTomorrow } from 'date-fns'

function parseDateText(text: string): Date | null {
  if (!text) return null

  const lower = text.toLowerCase().trim()
  const now = new Date()

  if (lower === 'today') return now
  if (lower === 'tomorrow') return startOfTomorrow()

  const dayMap: Record<string, (d: Date) => Date> = {
    monday: nextMonday,
    tuesday: nextTuesday,
    wednesday: nextWednesday,
    thursday: nextThursday,
    friday: nextFriday,
    saturday: nextSaturday,
    sunday: nextSunday,
  }

  // "next Friday", "on Friday", "by Friday"
  for (const [day, fn] of Object.entries(dayMap)) {
    if (lower.includes(day)) return fn(now)
  }

  // "in X days"
  const inDaysMatch = lower.match(/in\s+(\d+)\s+days?/)
  if (inDaysMatch) {
    return addDays(now, parseInt(inDaysMatch[1]))
  }

  // "end of week"
  if (lower.includes('end of week') || lower.includes('end of the week')) {
    return nextFriday(now)
  }

  // Try ISO parsing as fallback
  try {
    const parsed = parseISO(text)
    if (isValid(parsed)) return parsed
  } catch {
    // ignore
  }

  return null
}

export async function scheduleReminders(
  supabase: SupabaseClient,
  userId: string,
  options: {
    taskId?: string
    commitmentId?: string
    dueDateText: string | null
    message: string
  }
) {
  if (!options.dueDateText) return

  const dueDate = parseDateText(options.dueDateText)
  if (!dueDate) return

  // Schedule reminder for the day before at 18:00
  const reminderDate = subHours(dueDate, 18) > new Date()
    ? subHours(dueDate, 18)
    : dueDate

  await supabase.from('reminders').insert({
    user_id: userId,
    message: options.message,
    remind_at: reminderDate.toISOString(),
    status: 'pending',
    task_id: options.taskId || null,
    commitment_id: options.commitmentId || null,
  })
}

export { parseDateText }
