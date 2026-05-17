import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Correlates multiple signals to detect stress/cognitive overload:
 * - Linguistic volatility (emotional variance in recent memories)
 * - Interruption rate (threads created recently)
 * - Obligation degradation (overdue commitments increasing)
 * - Emotional variance (from emotional readings)
 * - Wearable data when available (graceful fallback)
 */
export async function detectStressPatterns(userId: string): Promise<{
  stress_level: number
  indicators: string[]
  observation: string | null
}> {
  const supabase = createAdminClient()
  const now = new Date()
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const indicators: string[] = []
  let totalStress = 0
  let signalCount = 0

  // 1. Emotional variance
  const { data: recentEmotions } = await supabase
    .from('emotional_readings')
    .select('intensity, valence, emotion')
    .eq('user_id', userId)
    .gte('measured_at', threeDaysAgo.toISOString())
    .order('measured_at', { ascending: true })

  if (recentEmotions && recentEmotions.length > 2) {
    const avgIntensity = recentEmotions.reduce((s, e) => s + e.intensity, 0) / recentEmotions.length
    const avgValence = recentEmotions.reduce((s, e) => s + e.valence, 0) / recentEmotions.length

    // High intensity + negative valence = stress signal
    if (avgIntensity > 0.6 && avgValence < -0.2) {
      indicators.push('elevated emotional intensity with negative trend')
      totalStress += 0.7
    } else if (avgIntensity > 0.5) {
      totalStress += 0.3
    }
    signalCount++

    // Variance in intensity
    const variance = recentEmotions.reduce((s, e) => s + Math.pow(e.intensity - avgIntensity, 2), 0) / recentEmotions.length
    if (variance > 0.1) {
      indicators.push('emotional volatility')
      totalStress += 0.4
      signalCount++
    }
  }

  // 2. Interruption rate
  const { count: recentInterruptions } = await supabase
    .from('interrupted_threads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', threeDaysAgo.toISOString())

  if ((recentInterruptions || 0) > 3) {
    indicators.push('high interruption frequency')
    totalStress += 0.5
  }
  signalCount++

  // 3. Obligation degradation
  const [{ count: currentOverdue }, { count: weekAgoOverdue }] = await Promise.all([
    supabase
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'overdue'),
    supabase
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'overdue')
      .lte('due_date', sevenDaysAgo.toISOString().split('T')[0]),
  ])

  if ((currentOverdue || 0) > (weekAgoOverdue || 0) + 2) {
    indicators.push('rising overdue obligations')
    totalStress += 0.5
  }
  signalCount++

  // 4. Capture frequency anomaly (too much or too little)
  const { count: recentCaptures } = await supabase
    .from('memory_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', threeDaysAgo.toISOString())

  const capturesPerDay = (recentCaptures || 0) / 3
  if (capturesPerDay > 10) {
    indicators.push('unusually high capture rate')
    totalStress += 0.3
  } else if (capturesPerDay < 0.5 && (recentCaptures || 0) > 0) {
    indicators.push('notably reduced capture activity')
    totalStress += 0.2
  }
  signalCount++

  // 5. Wearable data (graceful fallback)
  const { data: wearableData } = await supabase
    .from('wearable_data_points')
    .select('metric_type, value')
    .eq('user_id', userId)
    .gte('measured_at', threeDaysAgo.toISOString())
    .in('metric_type', ['heart_rate_variability', 'sleep_quality'])
    .limit(10)

  if (wearableData && wearableData.length > 0) {
    // Process if available
    const hrv = wearableData.filter(d => d.metric_type === 'heart_rate_variability')
    if (hrv.length > 0) {
      const avgHrv = hrv.reduce((s, d) => s + d.value, 0) / hrv.length
      if (avgHrv < 40) {
        indicators.push('low heart rate variability')
        totalStress += 0.4
      }
      signalCount++
    }
  }

  const stressLevel = signalCount > 0 ? Math.min(1, totalStress / signalCount) : 0

  // Generate observation
  let observation: string | null = null
  if (stressLevel > 0.6 && indicators.length > 0) {
    observation = `You appear to be managing a higher-than-usual cognitive load this week. Signs include ${indicators.slice(0, 2).join(' and ')}.`
  } else if (stressLevel > 0.4 && indicators.length > 0) {
    observation = `Some of your patterns suggest slightly elevated pressure recently.`
  }

  return {
    stress_level: stressLevel,
    indicators,
    observation,
  }
}
