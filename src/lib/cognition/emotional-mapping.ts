import { createAdminClient } from '@/lib/supabase/admin'
import { generateEmbedding } from '@/lib/ai/embeddings'
import type { EmotionalReading, ExtractedEntities } from '@/lib/types'

/**
 * Create an emotional reading from extracted emotional analysis.
 * Called during memory processing when emotional_analysis is present.
 */
export async function createEmotionalReading(
  userId: string,
  memoryId: string,
  emotionalAnalysis: NonNullable<ExtractedEntities['emotional_analysis']>
): Promise<void> {
  const supabase = createAdminClient()

  // Generate embedding for the emotion (for trajectory analysis)
  const emotionText = `${emotionalAnalysis.primary_emotion} intensity:${emotionalAnalysis.intensity} valence:${emotionalAnalysis.valence}`
  let embedding: number[] | null = null
  try {
    embedding = await generateEmbedding(emotionText)
  } catch {
    // Non-critical: skip embedding
  }

  await supabase.from('emotional_readings').insert({
    user_id: userId,
    emotion: emotionalAnalysis.primary_emotion,
    intensity: emotionalAnalysis.intensity,
    valence: emotionalAnalysis.valence,
    embedding: embedding ? JSON.stringify(embedding) : null,
    source_memory_id: memoryId,
    measured_at: new Date().toISOString(),
  })
}

/**
 * Get emotional trajectory over a period.
 */
export async function getEmotionalTrajectory(
  userId: string,
  days: number = 7
): Promise<{
  readings: EmotionalReading[]
  volatility: number
  trend: string
  persistence: number
  dominant_emotion: string
}> {
  const supabase = createAdminClient()
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data: readings } = await supabase
    .from('emotional_readings')
    .select('*')
    .eq('user_id', userId)
    .gte('measured_at', since.toISOString())
    .order('measured_at', { ascending: true })

  if (!readings || readings.length === 0) {
    return {
      readings: [],
      volatility: 0,
      trend: 'neutral',
      persistence: 0,
      dominant_emotion: 'neutral',
    }
  }

  // Volatility: average change in intensity between consecutive readings
  let volatility = 0
  if (readings.length > 1) {
    let totalChange = 0
    for (let i = 1; i < readings.length; i++) {
      totalChange += Math.abs(readings[i].intensity - readings[i - 1].intensity)
      totalChange += Math.abs(readings[i].valence - readings[i - 1].valence) * 0.5
    }
    volatility = totalChange / (readings.length - 1)
  }

  // Trend: compare first half average valence to second half
  const midpoint = Math.floor(readings.length / 2)
  const firstHalf = readings.slice(0, midpoint)
  const secondHalf = readings.slice(midpoint)

  const firstAvgValence = firstHalf.reduce((s, r) => s + r.valence, 0) / (firstHalf.length || 1)
  const secondAvgValence = secondHalf.reduce((s, r) => s + r.valence, 0) / (secondHalf.length || 1)

  let trend = 'stable'
  if (secondAvgValence - firstAvgValence > 0.2) trend = 'improving'
  else if (firstAvgValence - secondAvgValence > 0.2) trend = 'declining'

  // Persistence: how often does the dominant emotion repeat?
  const emotionCounts: Record<string, number> = {}
  for (const r of readings) {
    emotionCounts[r.emotion] = (emotionCounts[r.emotion] || 0) + 1
  }
  const dominant_emotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral'
  const persistence = (emotionCounts[dominant_emotion] || 0) / readings.length

  return {
    readings,
    volatility: Math.min(1, volatility),
    trend,
    persistence,
    dominant_emotion,
  }
}
