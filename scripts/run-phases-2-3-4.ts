/**
 * Run Phases 2, 3, 4 directly (no cron needed).
 * npx tsx scripts/run-phases-2-3-4.ts
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// Polyfill WebSocket globally for Node 20 (supabase-js requires it)
import WebSocket from 'ws'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).WebSocket = WebSocket

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '8fc7952c-6459-42e6-b2c8-cbf6db61b3b8'

async function run() {
  console.log('=== Running Phase 2: Behavioral Pattern Detection ===\n')

  // Import and run rebuildUserProfile which includes detectBehavioralPatterns
  const { rebuildUserProfile } = await import('../src/lib/cognition/self-model-engine')
  await rebuildUserProfile(USER_ID)

  // Check results
  const { data: patterns } = await supabase
    .from('user_patterns')
    .select('title, pattern_type, description, confidence, status')
    .eq('user_id', USER_ID)
    .in('pattern_type', ['daily_rhythm', 'emotional_pattern'])
    .order('confidence', { ascending: false })

  if (patterns && patterns.length > 0) {
    console.log('Detected behavioral patterns:')
    for (const p of patterns) {
      console.log(`  [${p.status}] ${p.title}`)
      console.log(`    ${p.description}`)
      console.log(`    Type: ${p.pattern_type}, Confidence: ${Math.round(p.confidence * 100)}%`)
      console.log()
    }
  } else {
    console.log('  No behavioral patterns detected (need more data — at least 10 memories/readings over 30 days)')
  }

  console.log('\n=== Running Phase 3: Relational Gravity ===\n')

  const { data: gravityPatterns } = await supabase
    .from('user_patterns')
    .select('title, description, confidence, evidence_refs')
    .eq('user_id', USER_ID)
    .eq('pattern_type', 'relational_gravity')
    .order('confidence', { ascending: false })
    .limit(5)

  if (gravityPatterns && gravityPatterns.length > 0) {
    console.log('Relational gravity scores:')
    for (const p of gravityPatterns) {
      const refs = p.evidence_refs?.[0] as Record<string, number> | undefined
      console.log(`  ${p.title}: ${p.description}`)
      if (refs) {
        console.log(`    stress_association: ${refs.stress_association?.toFixed(2) ?? 'n/a'}, communication_latency: ${refs.communication_latency?.toFixed(2) ?? 'n/a'}`)
      }
      console.log()
    }
  } else {
    console.log('  No relational gravity data (people need emotional readings to score)')
  }

  console.log('\n=== Running Phase 4: Thread Cooling ===\n')

  const { runThreadStateTransitions } = await import('../src/lib/cognition/thread-state-engine')
  const { transitions } = await runThreadStateTransitions(USER_ID)

  if (transitions.length > 0) {
    console.log('Thread transitions:')
    for (const t of transitions) {
      console.log(`  ${t.from} → ${t.to}: ${t.reason}`)
    }
  } else {
    console.log('  No transitions triggered (threads need stale activity or resolved commitments)')
  }

  // Show current thread statuses
  const { data: threads } = await supabase
    .from('threads')
    .select('title, status, commitment_count, continuity_retention')
    .eq('user_id', USER_ID)
    .order('status')

  console.log('\nCurrent thread statuses:')
  for (const t of threads || []) {
    console.log(`  [${t.status}] "${t.title}" — ${t.commitment_count} commitments, ${Math.round(t.continuity_retention * 100)}% retained`)
  }

  console.log('\n=== ALL PHASES COMPLETE ===')
}

run().catch(console.error)
