import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { saveContinuitySnapshot } from '@/lib/cognition/continuity-scoring'
import { runDailyDecay } from '@/lib/cognition/decay-engine'
import { updateBehaviouralDrift } from '@/lib/cognition/behavioural-drift'
import { predictForgottenIntents } from '@/lib/cognition/forgotten-intent'
import { rebuildUserProfile } from '@/lib/cognition/self-model-engine'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Get all users
  const { data: profiles } = await supabase.from('profiles').select('id')

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ message: 'No users found' })
  }

  const results = []

  for (const profile of profiles) {
    try {
      // Run decay first
      const decay = await runDailyDecay(profile.id)

      // Then snapshot
      const snapshot = await saveContinuitySnapshot(profile.id)

      // Run behavioural drift analysis
      const drift = await updateBehaviouralDrift(profile.id)

      // Run forgotten-intent prediction
      const predictions = await predictForgottenIntents(profile.id)

      // Rebuild self-model profile (patterns, state, relational gravity, questions)
      await rebuildUserProfile(profile.id)

      results.push({
        user_id: profile.id,
        score: snapshot.continuity_score,
        state: snapshot.state,
        decay,
        significant_drifts: drift.significantDrifts,
        forgotten_intent_predictions: predictions.length,
      })
    } catch (error) {
      console.error(`Continuity snapshot failed for ${profile.id}:`, error)
      results.push({ user_id: profile.id, error: 'Failed' })
    }
  }

  return NextResponse.json({ results })
}
