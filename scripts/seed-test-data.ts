/**
 * Seed test data for Voice Engine, Behavioral Patterns,
 * Relational Gravity enrichment, and Thread Cooling.
 *
 * Run: npx tsx scripts/seed-test-data.ts
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).WebSocket = WebSocket

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '8fc7952c-6459-42e6-b2c8-cbf6db61b3b8'

async function seed() {
  console.log('Seeding test data for user:', USER_ID)

  // --- 1. User Life Profile (drives persona + voice) ---
  const { error: profileErr } = await supabase
    .from('user_life_profile')
    .upsert({
      user_id: USER_ID,
      active_persona: 'founder',
      persona_confidence: 0.85,
      persona_source: 'inference',
      roles: [
        { role: 'founder', confidence: 0.9, evidence_count: 14, first_seen: '2026-04-01T00:00:00Z', last_seen: '2026-05-19T00:00:00Z' },
        { role: 'parent', confidence: 0.7, evidence_count: 8, first_seen: '2026-04-05T00:00:00Z', last_seen: '2026-05-18T00:00:00Z' },
        { role: 'worker', confidence: 0.5, evidence_count: 4, first_seen: '2026-04-10T00:00:00Z', last_seen: '2026-05-15T00:00:00Z' },
      ],
      life_areas: [
        { area: 'regnexus', label: 'RegNexus', people: ['Marcus', 'Tania'], thread_count: 12, confidence: 0.9 },
        { area: 'orbita', label: 'Orbita', people: [], thread_count: 8, confidence: 0.8 },
        { area: 'family', label: 'Family', people: ['Esther', 'Grace'], thread_count: 5, confidence: 0.7 },
      ],
      daily_rhythm: {
        peak_hours: [9, 10, 11, 14, 15, 21],
        quiet_hours: [6, 7, 12, 13],
        weekend_pattern: 'lighter',
      },
      support_style: {
        prefers_questions: false,
        prefers_direct: true,
        morning_detail_level: 'concise',
        emotional_sensitivity: 'moderate',
      },
      completeness_score: 80,
      last_inference_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (profileErr) console.error('Profile error:', profileErr.message)
  else console.log('✓ User life profile')

  // --- 2. User State ---
  const { error: stateErr } = await supabase
    .from('user_state')
    .upsert({
      user_id: USER_ID,
      current_state: 'stretched',
      state_confidence: 0.72,
      state_signals: [
        { signal: 'high_commitment_count', value: 8 },
        { signal: 'multiple_active_threads', value: 6 },
      ],
      previous_state: 'in_flow',
      state_changed_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    }, { onConflict: 'user_id' })

  if (stateErr) console.error('State error:', stateErr.message)
  else console.log('✓ User state')

  // --- 3. Reflection Memory ---
  const reflections = [
    { memory_type: 'value', content: 'What matters most to me is building something that actually helps people', confidence: 0.8 },
    { memory_type: 'aspiration', content: 'I want to be more present with my kids in the evenings', confidence: 0.7 },
    { memory_type: 'boundary', content: "I'm not willing to compromise on sleep anymore", confidence: 0.6 },
    { memory_type: 'identity_anchor', content: 'I feel most alive when I am solving hard problems with a small team', confidence: 0.75 },
    { memory_type: 'belief', content: 'I believe consistency beats intensity', confidence: 0.65 },
  ]

  for (const r of reflections) {
    const { error } = await supabase.from('reflection_memory').insert({
      user_id: USER_ID,
      memory_type: r.memory_type,
      content: r.content,
      confidence: r.confidence,
      source_type: 'inference',
      active: true,
    })
    if (error && !error.message.includes('duplicate')) console.error('Reflection error:', error.message)
  }
  console.log('✓ Reflection memories (5)')

  // --- 4. People ---
  const people = [
    { name: 'Marcus', relationship: 'co-founder', context: 'RegNexus co-founder, handles ops' },
    { name: 'Tania', relationship: 'colleague', context: 'Designer working on RegNexus UI' },
    { name: 'Esther', relationship: 'wife', context: 'Partner and co-parent' },
    { name: 'Grace', relationship: 'daughter', context: 'School-age daughter' },
    { name: 'Andy', relationship: 'friend', context: 'Old friend, sporadic contact' },
    { name: 'David', relationship: 'investor', context: 'Potential angel investor' },
  ]

  const personIds: Record<string, string> = {}

  for (const p of people) {
    const { data, error } = await supabase
      .from('people')
      .upsert({
        user_id: USER_ID,
        name: p.name,
        relationship: p.relationship,
        context: p.context,
        mention_count: Math.floor(Math.random() * 15) + 3,
        last_mentioned_at: new Date(Date.now() - Math.random() * 14 * 86400000).toISOString(),
      }, { onConflict: 'user_id,name' })
      .select('id')
      .single()

    if (error) console.error(`Person ${p.name} error:`, error.message)
    else personIds[p.name] = data.id
  }

  // Make Andy neglected (last mentioned 25 days ago, high mention count)
  if (personIds['Andy']) {
    await supabase
      .from('people')
      .update({
        mention_count: 9,
        last_mentioned_at: new Date(Date.now() - 25 * 86400000).toISOString(),
      })
      .eq('id', personIds['Andy'])
  }
  console.log('✓ People (6)')

  // --- 5. Memory Items (30 days, varied activity for burst detection) ---
  const memoryData: { content: string; daysAgo: number; hour: number; person?: string }[] = [
    // Burst: 3 days ago (heavy day)
    { content: 'Meeting with Marcus about Q3 strategy, need to finalize investor deck', daysAgo: 3, hour: 9, person: 'Marcus' },
    { content: 'Tania sent new mockups for the dashboard, they look great', daysAgo: 3, hour: 11, person: 'Tania' },
    { content: 'Called David about the seed round, he wants to see traction numbers', daysAgo: 3, hour: 14, person: 'David' },
    { content: 'Esther reminded me about Grace school play next Thursday', daysAgo: 3, hour: 18, person: 'Esther' },
    { content: 'Stayed up late working on the pitch deck, feeling wired', daysAgo: 3, hour: 23 },
    // Zero day (2 days ago)
    // Burst: 1 day ago
    { content: 'Investor deck is nearly done, Marcus reviewed and had feedback', daysAgo: 1, hour: 10, person: 'Marcus' },
    { content: 'Feeling stressed about hitting the fundraising deadline', daysAgo: 1, hour: 15 },
    { content: 'Grace asked me to help with homework but I was on a call', daysAgo: 1, hour: 19, person: 'Grace' },
    { content: 'Promised Esther I would take tomorrow morning off', daysAgo: 1, hour: 21, person: 'Esther' },
    // Scattered days
    { content: 'Quick check-in with Tania on design system tokens', daysAgo: 7, hour: 10, person: 'Tania' },
    { content: 'Feeling overwhelmed by all the context switching', daysAgo: 7, hour: 20 },
    { content: 'Had a good run this morning, cleared my head', daysAgo: 10, hour: 7 },
    { content: 'Marcus flagged a compliance issue with the new feature', daysAgo: 12, hour: 14, person: 'Marcus' },
    { content: 'Thinking about Andy, should reach out — been too long', daysAgo: 14, hour: 22, person: 'Andy' },
    { content: 'Esther and I talked about holiday plans, need to book flights', daysAgo: 15, hour: 20, person: 'Esther' },
    { content: 'Late night debugging a Supabase RLS issue', daysAgo: 18, hour: 23 },
    { content: 'David introduced me to another founder, good conversation', daysAgo: 20, hour: 16, person: 'David' },
    { content: 'Promised Marcus I would review the partnership contract by Friday', daysAgo: 22, hour: 11, person: 'Marcus' },
    { content: 'Grace graduation ceremony next month, need to block the day', daysAgo: 25, hour: 9, person: 'Grace' },
    { content: 'Feeling isolated working alone on Orbita today', daysAgo: 28, hour: 21 },
  ]

  const memoryIds: string[] = []
  for (const m of memoryData) {
    const createdAt = new Date(Date.now() - m.daysAgo * 86400000)
    createdAt.setHours(m.hour, 0, 0, 0)

    const { data, error } = await supabase
      .from('memory_items')
      .insert({
        user_id: USER_ID,
        type: 'text',
        raw_content: m.content,
        summary: m.content,
        processed: true,
        importance: Math.floor(Math.random() * 4) + 5,
        created_at: createdAt.toISOString(),
        updated_at: createdAt.toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      console.error('Memory error:', error.message)
    } else {
      memoryIds.push(data.id)

      // Link person to memory
      if (m.person && personIds[m.person]) {
        await supabase.from('memory_people').upsert({
          memory_id: data.id,
          person_id: personIds[m.person],
          user_id: USER_ID,
          role: null,
        }, { onConflict: 'memory_id,person_id' })
      }
    }
  }
  console.log(`✓ Memory items (${memoryIds.length})`)

  // --- 6. Emotional Readings (for trajectory + behavioral patterns) ---
  const emotionalData: { emotion: string; intensity: number; valence: number; daysAgo: number; hour: number; memoryIdx?: number }[] = [
    // Morning readings (lower intensity)
    { emotion: 'excitement', intensity: 0.4, valence: 0.6, daysAgo: 3, hour: 9 },
    { emotion: 'stress', intensity: 0.3, valence: -0.4, daysAgo: 7, hour: 10 },
    { emotion: 'relief', intensity: 0.35, valence: 0.5, daysAgo: 10, hour: 7 },
    { emotion: 'concern', intensity: 0.3, valence: -0.3, daysAgo: 12, hour: 9 },
    // Evening readings (higher intensity — for pattern 3)
    { emotion: 'stress', intensity: 0.8, valence: -0.8, daysAgo: 3, hour: 23, memoryIdx: 4 },
    { emotion: 'frustration', intensity: 0.7, valence: -0.7, daysAgo: 1, hour: 19, memoryIdx: 7 },
    { emotion: 'concern', intensity: 0.65, valence: -0.5, daysAgo: 7, hour: 20, memoryIdx: 10 },
    { emotion: 'stress', intensity: 0.75, valence: -0.7, daysAgo: 18, hour: 23, memoryIdx: 15 },
    { emotion: 'stress', intensity: 0.6, valence: -0.6, daysAgo: 28, hour: 21, memoryIdx: 19 },
    // Negative readings tied to people (for pattern 2)
    { emotion: 'frustration', intensity: 0.6, valence: -0.5, daysAgo: 1, hour: 15, memoryIdx: 6 },
    { emotion: 'concern', intensity: 0.5, valence: -0.4, daysAgo: 12, hour: 14, memoryIdx: 12 },
    { emotion: 'stress', intensity: 0.55, valence: -0.6, daysAgo: 3, hour: 14, memoryIdx: 2 },
    // Positive readings
    { emotion: 'excitement', intensity: 0.5, valence: 0.7, daysAgo: 3, hour: 11 },
    { emotion: 'relief', intensity: 0.4, valence: 0.5, daysAgo: 1, hour: 10 },
  ]

  for (const e of emotionalData) {
    const measuredAt = new Date(Date.now() - e.daysAgo * 86400000)
    measuredAt.setHours(e.hour, 0, 0, 0)

    await supabase.from('emotional_readings').insert({
      user_id: USER_ID,
      emotion: e.emotion,
      intensity: e.intensity,
      valence: e.valence,
      source_memory_id: e.memoryIdx !== undefined ? memoryIds[e.memoryIdx] : null,
      measured_at: measuredAt.toISOString(),
    })
  }
  console.log('✓ Emotional readings (14)')

  // --- 7. Threads (including one ready for cooling test) ---
  const threads = [
    {
      title: 'Investor deck for seed round',
      thread_type: 'project',
      status: 'active',
      continuity_retention: 0.85,
      commitment_count: 2,
      importance: 9,
      daysAgo: 1,
    },
    {
      title: 'Grace school play preparation',
      thread_type: 'relationship',
      status: 'active',
      continuity_retention: 0.6,
      commitment_count: 1,
      importance: 7,
      daysAgo: 3,
    },
    {
      title: 'RegNexus compliance fix',
      thread_type: 'obligation',
      status: 'active',
      continuity_retention: 0.45,
      commitment_count: 0,  // all resolved — cooling candidate
      importance: 6,
      daysAgo: 12,
    },
    {
      title: 'Holiday planning with Esther',
      thread_type: 'planning',
      status: 'active',
      continuity_retention: 0.35,
      commitment_count: 1,
      importance: 5,
      daysAgo: 15,
    },
    {
      title: 'Andy catch-up',
      thread_type: 'relationship',
      status: 'paused',
      continuity_retention: 0.2,
      commitment_count: 0,
      importance: 4,
      daysAgo: 25,
    },
  ]

  const threadIds: string[] = []
  for (const t of threads) {
    const lastActivity = new Date(Date.now() - t.daysAgo * 86400000)
    const { data, error } = await supabase
      .from('threads')
      .insert({
        user_id: USER_ID,
        title: t.title,
        summary: t.title,
        thread_type: t.thread_type,
        status: t.status,
        continuity_retention: t.continuity_retention,
        decay_coefficient: 0.03,
        commitment_count: t.commitment_count,
        capture_count: Math.floor(Math.random() * 5) + 1,
        entity_count: Math.floor(Math.random() * 3) + 1,
        importance: t.importance,
        emotional_valence: 0,
        last_activity_at: lastActivity.toISOString(),
      })
      .select('id')
      .single()

    if (error) console.error(`Thread "${t.title}" error:`, error.message)
    else threadIds.push(data.id)
  }
  console.log(`✓ Threads (${threadIds.length})`)

  // --- 8. Commitments ---
  const commitments = [
    { desc: 'Finalize investor deck by Friday', status: 'active', direction: 'outgoing', person: 'Marcus', dueOffset: 2, threadIdx: 0 },
    { desc: 'Send traction numbers to David', status: 'active', direction: 'outgoing', person: 'David', dueOffset: 3, threadIdx: 0 },
    { desc: 'Attend Grace school play', status: 'active', direction: 'outgoing', person: 'Grace', dueOffset: 5, threadIdx: 1 },
    { desc: 'Book holiday flights', status: 'active', direction: 'outgoing', person: 'Esther', dueOffset: 10, threadIdx: 3 },
    { desc: 'Review partnership contract', status: 'completed', direction: 'outgoing', person: 'Marcus', dueOffset: -5, threadIdx: 2 },  // resolved
    { desc: 'Take tomorrow morning off', status: 'active', direction: 'outgoing', person: 'Esther', dueOffset: 0 },
  ]

  for (const c of commitments) {
    const dueDate = new Date(Date.now() + c.dueOffset * 86400000).toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('commitments')
      .insert({
        user_id: USER_ID,
        description: c.desc,
        status: c.status,
        direction: c.direction,
        due_date: dueDate,
        person_id: c.person && personIds[c.person] ? personIds[c.person] : null,
        importance: Math.floor(Math.random() * 3) + 6,
      })
      .select('id')
      .single()

    if (error) console.error(`Commitment error:`, error.message)
    else if (c.threadIdx !== undefined && threadIds[c.threadIdx]) {
      await supabase.from('thread_entities').upsert({
        thread_id: threadIds[c.threadIdx],
        entity_type: 'commitment',
        entity_id: data.id,
      }, { onConflict: 'thread_id,entity_type,entity_id' })
    }
  }
  console.log('✓ Commitments (6)')

  // --- 9. User Patterns (some pre-existing, voice engine will read these) ---
  const patterns = [
    {
      pattern_type: 'role',
      title: 'You seem to be a founder',
      description: 'Orbita has noticed 14 mentions related to being a founder.',
      confidence: 0.9,
      evidence_count: 14,
      status: 'confirmed',
    },
    {
      pattern_type: 'support_preference',
      title: 'You prefer direct answers',
      description: 'You tend to skip pleasantries and ask for specifics.',
      confidence: 0.7,
      evidence_count: 6,
      status: 'established',
    },
  ]

  for (const p of patterns) {
    await supabase.from('user_patterns').insert({
      user_id: USER_ID,
      pattern_type: p.pattern_type,
      title: p.title,
      description: p.description,
      confidence: p.confidence,
      evidence_count: p.evidence_count,
      evidence_refs: [{}],
      status: p.status,
    })
  }
  console.log('✓ User patterns (2)')

  // --- 10. Relationship Edges ---
  if (personIds['Marcus'] && personIds['Tania']) {
    const { error: edgeErr } = await supabase.from('relationship_edges').upsert({
      user_id: USER_ID,
      person_a: personIds['Marcus'],
      person_b: personIds['Tania'],
      emotional_weight: 0.6,
      interaction_frequency: 0.7,
      relationship_strength: 0.5,
      continuity_score: 0.6,
    }, { onConflict: 'user_id,person_a,person_b' })
    if (edgeErr) console.log('  (relationship edge skipped:', edgeErr.message, ')')
  }
  console.log('✓ Relationship edges')

  console.log('\n=== SEED COMPLETE ===')
  console.log('\nTest prompts to try in the app:')
  console.log('')
  console.log('Phase 1 (Voice Engine):')
  console.log('  "I feel overwhelmed" → should be short, warm, reference your values')
  console.log('  "What should I focus on?" → should give direct numbered priorities (founder persona)')
  console.log('  "Who am I meeting this week?" → should reference Marcus, David by name')
  console.log('  "Hey" → should be brief, persona-aware')
  console.log('')
  console.log('Phase 2 (Behavioral Patterns):')
  console.log('  Trigger daily cron (POST /api/cron/resurface) → check user_patterns for:')
  console.log('  - "Your mental load tends to build through the day"')
  console.log('  - "You often carry emotional weight connected to others"')
  console.log('')
  console.log('Phase 3 (Relational Gravity):')
  console.log('  After cron runs → check user_patterns with pattern_type=relational_gravity')
  console.log('  - Marcus should show stress_association > 0')
  console.log('  - Andy should show high communication_latency')
  console.log('')
  console.log('Phase 4 (Thread Cooling):')
  console.log('  "RegNexus compliance fix" thread has 0 active commitments → should transition to cooling')
  console.log('  After cooling, capture something about compliance → thread should reactivate')
}

seed().catch(console.error)
