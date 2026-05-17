-- ============================================================================
-- CONTINUUM: Combined Phase 2/3/4 Migration Set (005 through 011)
-- ============================================================================
-- This file concatenates migrations 005_life_stream.sql through 011_thread_states.sql
-- into a single deployable script. These migrations build the core cognitive
-- infrastructure for Continuum:
--
--   Phase 2: Life Stream & Continuity (005, 006)
--     - Event-typed memory items with decay
--     - Cognitive graph (nodes + edges)
--     - Interrupted threads, relationship edges
--     - Continuity snapshots, cognitive load readings, follow-up candidates
--     - Row-level security for all Phase 2 tables
--
--   Phase 3: Human State Intelligence (007, 008)
--     - Memory confidence and recurrence tracking
--     - Emotional readings with vector embeddings
--     - Behavioural baselines
--     - Wearable connections and data points (stub)
--     - Row-level security for all Phase 3 tables
--
--   Phase 4: Cognitive Infrastructure (009, 010, 011)
--     - Continuity windows (companion context sessions)
--     - Window messages
--     - Forgotten intent predictions
--     - Row-level security for all Phase 4 tables
--     - Thread status state machine expansion
--
-- Generated: 2026-05-17
-- ============================================================================


-- ============================================================================
-- Migration 005: Life Stream
-- Source: supabase/migrations/005_life_stream.sql
-- ============================================================================

-- Life Stream abstraction: evolve memory_items with event types and decay
alter table public.memory_items add column event_type text default 'thought'
  check (event_type in ('thought','voice_note','promise','image','location',
  'conversation','interruption','emotional_shift'));
alter table public.memory_items add column decay_coefficient float default 0.05;
alter table public.memory_items add column continuity_retention float default 1.0;
alter table public.memory_items add column last_decay_at timestamptz default now();

-- Cognitive Graph: unified node-edge structure
create table public.cognitive_graph_nodes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  node_type text not null check (node_type in ('person','conversation','emotion',
    'commitment','location','time_period','decision','goal')),
  label text not null,
  properties jsonb default '{}',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table public.cognitive_graph_edges (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  source_node_id uuid references public.cognitive_graph_nodes on delete cascade not null,
  target_node_id uuid references public.cognitive_graph_nodes on delete cascade not null,
  edge_type text not null,
  weight float default 1.0,
  properties jsonb default '{}',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Interrupted threads
create table public.interrupted_threads (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  thread_summary text,
  originating_memory_id uuid references public.memory_items on delete set null,
  related_memory_ids uuid[] default '{}',
  last_activity_at timestamptz default now() not null,
  interruption_score float default 0 check (interruption_score >= 0 and interruption_score <= 1),
  recovery_probability float default 0 check (recovery_probability >= 0 and recovery_probability <= 1),
  thread_continuity_score float default 0,
  decay_coefficient float default 0.05,
  continuity_retention float default 1.0,
  status text default 'interrupted' not null
    check (status in ('interrupted','recovered','resolved','dismissed')),
  recovered_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Relationship edges (person-to-person graph)
create table public.relationship_edges (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  person_a uuid references public.people on delete cascade not null,
  person_b uuid references public.people on delete cascade not null,
  relationship_strength float default 0,
  emotional_weight float default 0,
  interaction_frequency float default 0,
  continuity_score float default 0,
  last_interaction timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (user_id, person_a, person_b)
);

-- Continuity snapshots (daily health scores)
create table public.continuity_snapshots (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  snapshot_date date not null,
  continuity_score float not null,
  unresolved_commitments_penalty float default 0,
  overdue_obligations_penalty float default 0,
  interruption_rate_penalty float default 0,
  cognitive_fragmentation_penalty float default 0,
  decision_discontinuity_penalty float default 0,
  state text not null check (state in ('stable','mild_fragmentation',
    'overload_emerging','high_discontinuity','critical')),
  created_at timestamptz default now() not null,
  unique (user_id, snapshot_date)
);

-- Cognitive load readings
create table public.cognitive_load_readings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  measured_at timestamptz default now() not null,
  active_contexts integer default 0,
  unresolved_obligations integer default 0,
  emotional_intensity float default 0,
  interruption_frequency float default 0,
  decision_density float default 0,
  communication_burden float default 0,
  load_score float not null check (load_score >= 0 and load_score <= 1),
  created_at timestamptz default now() not null
);

-- Follow-up candidates (unresolved future intents)
create table public.follow_up_candidates (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  source_memory_id uuid references public.memory_items on delete set null,
  description text not null,
  detected_intent text not null,
  expected_window_days integer default 7,
  detected_at timestamptz default now() not null,
  follow_up_due_at timestamptz,
  decay_coefficient float default 0.05,
  continuity_retention float default 1.0,
  status text default 'pending' not null
    check (status in ('pending','surfaced','completed','dismissed')),
  surfaced_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Indexes
create index cognitive_graph_nodes_user_id_idx on public.cognitive_graph_nodes (user_id);
create index cognitive_graph_nodes_type_idx on public.cognitive_graph_nodes (node_type);
create index cognitive_graph_edges_user_id_idx on public.cognitive_graph_edges (user_id);
create index cognitive_graph_edges_source_idx on public.cognitive_graph_edges (source_node_id);
create index cognitive_graph_edges_target_idx on public.cognitive_graph_edges (target_node_id);
create index interrupted_threads_user_id_idx on public.interrupted_threads (user_id);
create index interrupted_threads_status_idx on public.interrupted_threads (status);
create index interrupted_threads_last_activity_idx on public.interrupted_threads (last_activity_at desc);
create index relationship_edges_user_id_idx on public.relationship_edges (user_id);
create index relationship_edges_person_a_idx on public.relationship_edges (person_a);
create index relationship_edges_person_b_idx on public.relationship_edges (person_b);
create index continuity_snapshots_user_id_idx on public.continuity_snapshots (user_id);
create index continuity_snapshots_date_idx on public.continuity_snapshots (snapshot_date desc);
create index cognitive_load_readings_user_id_idx on public.cognitive_load_readings (user_id);
create index cognitive_load_readings_measured_at_idx on public.cognitive_load_readings (measured_at desc);
create index follow_up_candidates_user_id_idx on public.follow_up_candidates (user_id);
create index follow_up_candidates_status_idx on public.follow_up_candidates (status);
create index follow_up_candidates_due_at_idx on public.follow_up_candidates (follow_up_due_at);
create index memory_items_event_type_idx on public.memory_items (event_type);
create index memory_items_last_decay_idx on public.memory_items (last_decay_at);


-- ============================================================================
-- Migration 006: Continuity RLS
-- Source: supabase/migrations/006_continuity_rls.sql
-- ============================================================================

-- Enable RLS on all new tables
alter table public.cognitive_graph_nodes enable row level security;
alter table public.cognitive_graph_edges enable row level security;
alter table public.interrupted_threads enable row level security;
alter table public.relationship_edges enable row level security;
alter table public.continuity_snapshots enable row level security;
alter table public.cognitive_load_readings enable row level security;
alter table public.follow_up_candidates enable row level security;

-- Cognitive graph nodes
create policy "Users can view own graph nodes" on public.cognitive_graph_nodes
  for select using (auth.uid() = user_id);
create policy "Users can create own graph nodes" on public.cognitive_graph_nodes
  for insert with check (auth.uid() = user_id);
create policy "Users can update own graph nodes" on public.cognitive_graph_nodes
  for update using (auth.uid() = user_id);
create policy "Users can delete own graph nodes" on public.cognitive_graph_nodes
  for delete using (auth.uid() = user_id);

-- Cognitive graph edges
create policy "Users can view own graph edges" on public.cognitive_graph_edges
  for select using (auth.uid() = user_id);
create policy "Users can create own graph edges" on public.cognitive_graph_edges
  for insert with check (auth.uid() = user_id);
create policy "Users can update own graph edges" on public.cognitive_graph_edges
  for update using (auth.uid() = user_id);
create policy "Users can delete own graph edges" on public.cognitive_graph_edges
  for delete using (auth.uid() = user_id);

-- Interrupted threads
create policy "Users can view own threads" on public.interrupted_threads
  for select using (auth.uid() = user_id);
create policy "Users can create own threads" on public.interrupted_threads
  for insert with check (auth.uid() = user_id);
create policy "Users can update own threads" on public.interrupted_threads
  for update using (auth.uid() = user_id);
create policy "Users can delete own threads" on public.interrupted_threads
  for delete using (auth.uid() = user_id);

-- Relationship edges
create policy "Users can view own relationships" on public.relationship_edges
  for select using (auth.uid() = user_id);
create policy "Users can create own relationships" on public.relationship_edges
  for insert with check (auth.uid() = user_id);
create policy "Users can update own relationships" on public.relationship_edges
  for update using (auth.uid() = user_id);
create policy "Users can delete own relationships" on public.relationship_edges
  for delete using (auth.uid() = user_id);

-- Continuity snapshots
create policy "Users can view own snapshots" on public.continuity_snapshots
  for select using (auth.uid() = user_id);
create policy "Users can create own snapshots" on public.continuity_snapshots
  for insert with check (auth.uid() = user_id);

-- Cognitive load readings
create policy "Users can view own load readings" on public.cognitive_load_readings
  for select using (auth.uid() = user_id);
create policy "Users can create own load readings" on public.cognitive_load_readings
  for insert with check (auth.uid() = user_id);

-- Follow-up candidates
create policy "Users can view own follow-ups" on public.follow_up_candidates
  for select using (auth.uid() = user_id);
create policy "Users can create own follow-ups" on public.follow_up_candidates
  for insert with check (auth.uid() = user_id);
create policy "Users can update own follow-ups" on public.follow_up_candidates
  for update using (auth.uid() = user_id);
create policy "Users can delete own follow-ups" on public.follow_up_candidates
  for delete using (auth.uid() = user_id);


-- ============================================================================
-- Migration 007: Human State
-- Source: supabase/migrations/007_human_state.sql
-- ============================================================================

-- Human State Intelligence: memory confidence and emotional readings

-- Add confidence and recurrence tracking to memory_items
alter table public.memory_items add column confidence_score float default null;
alter table public.memory_items add column corroboration_count integer default 0;
alter table public.memory_items add column recurrence_count integer default 0;

-- Emotional readings: granular emotion tracking over time
create table public.emotional_readings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  emotion text not null,
  intensity float not null check (intensity >= 0 and intensity <= 1),
  valence float not null check (valence >= -1 and valence <= 1),
  embedding extensions.vector(1536),
  source_memory_id uuid references public.memory_items on delete set null,
  measured_at timestamptz default now() not null,
  created_at timestamptz default now() not null
);

-- Behavioural baselines: longitudinal pattern tracking
create table public.behavioural_baselines (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  metric_name text not null,
  baseline_value float not null,
  current_value float not null,
  drift_score float default 0,
  window_days integer default 14,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (user_id, metric_name)
);

-- Wearable connections (stub for future integration)
create table public.wearable_connections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  provider text not null,
  status text default 'disconnected' not null
    check (status in ('disconnected', 'connected', 'syncing', 'error')),
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (user_id, provider)
);

-- Wearable data points (stub)
create table public.wearable_data_points (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  connection_id uuid references public.wearable_connections on delete cascade not null,
  metric_type text not null,
  value float not null,
  measured_at timestamptz not null,
  created_at timestamptz default now() not null
);

-- Indexes
create index emotional_readings_user_id_idx on public.emotional_readings (user_id);
create index emotional_readings_measured_at_idx on public.emotional_readings (measured_at desc);
create index emotional_readings_source_memory_idx on public.emotional_readings (source_memory_id);
create index behavioural_baselines_user_id_idx on public.behavioural_baselines (user_id);
create index wearable_connections_user_id_idx on public.wearable_connections (user_id);
create index wearable_data_points_user_id_idx on public.wearable_data_points (user_id);
create index wearable_data_points_measured_at_idx on public.wearable_data_points (measured_at desc);


-- ============================================================================
-- Migration 008: Human State RLS
-- Source: supabase/migrations/008_human_state_rls.sql
-- ============================================================================

-- Enable RLS on human state tables
alter table public.emotional_readings enable row level security;
alter table public.behavioural_baselines enable row level security;
alter table public.wearable_connections enable row level security;
alter table public.wearable_data_points enable row level security;

-- Emotional readings
create policy "Users can view own emotional readings" on public.emotional_readings
  for select using (auth.uid() = user_id);
create policy "Users can create own emotional readings" on public.emotional_readings
  for insert with check (auth.uid() = user_id);

-- Behavioural baselines
create policy "Users can view own baselines" on public.behavioural_baselines
  for select using (auth.uid() = user_id);
create policy "Users can create own baselines" on public.behavioural_baselines
  for insert with check (auth.uid() = user_id);
create policy "Users can update own baselines" on public.behavioural_baselines
  for update using (auth.uid() = user_id);

-- Wearable connections
create policy "Users can view own wearable connections" on public.wearable_connections
  for select using (auth.uid() = user_id);
create policy "Users can create own wearable connections" on public.wearable_connections
  for insert with check (auth.uid() = user_id);
create policy "Users can update own wearable connections" on public.wearable_connections
  for update using (auth.uid() = user_id);
create policy "Users can delete own wearable connections" on public.wearable_connections
  for delete using (auth.uid() = user_id);

-- Wearable data points
create policy "Users can view own wearable data" on public.wearable_data_points
  for select using (auth.uid() = user_id);
create policy "Users can create own wearable data" on public.wearable_data_points
  for insert with check (auth.uid() = user_id);


-- ============================================================================
-- Migration 009: Cognitive Infrastructure
-- Source: supabase/migrations/009_cognitive_infrastructure.sql
-- ============================================================================

-- Cognitive Infrastructure: context windows, companion state, forgotten intents

-- Continuity windows (companion context sessions)
create table public.continuity_windows (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  window_type text default 'restoration' not null,
  life_state jsonb default '{}',
  unresolved_threads jsonb default '{}',
  emotional_context jsonb default '{}',
  continuity_trajectory jsonb default '{}',
  active_at timestamptz default now() not null,
  expires_at timestamptz,
  created_at timestamptz default now() not null
);

-- Messages within a continuity window
create table public.continuity_window_messages (
  id uuid default gen_random_uuid() primary key,
  window_id uuid references public.continuity_windows on delete cascade not null,
  role text not null check (role in ('system', 'assistant', 'user')),
  content text not null,
  source_memory_ids uuid[] default '{}',
  context_nodes jsonb default '{}',
  created_at timestamptz default now() not null
);

-- Forgotten intent predictions
create table public.forgotten_intent_predictions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  intent_description text not null,
  probability_forgotten float not null check (probability_forgotten >= 0 and probability_forgotten <= 1),
  intent_urgency float default 0,
  cognitive_load_at_detection float default 0,
  historical_pattern_score float default 0,
  decay_adjusted_priority float default 0,
  source_follow_up_id uuid references public.follow_up_candidates on delete set null,
  status text default 'predicted' not null
    check (status in ('predicted','surfaced','confirmed_forgotten','resolved','false_positive')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Indexes
create index continuity_windows_user_id_idx on public.continuity_windows (user_id);
create index continuity_windows_active_at_idx on public.continuity_windows (active_at desc);
create index continuity_window_messages_window_id_idx on public.continuity_window_messages (window_id);
create index forgotten_intent_predictions_user_id_idx on public.forgotten_intent_predictions (user_id);
create index forgotten_intent_predictions_status_idx on public.forgotten_intent_predictions (status);


-- ============================================================================
-- Migration 010: Cognitive Infrastructure RLS
-- Source: supabase/migrations/010_cognitive_infrastructure_rls.sql
-- ============================================================================

-- Enable RLS on cognitive infrastructure tables
alter table public.continuity_windows enable row level security;
alter table public.continuity_window_messages enable row level security;
alter table public.forgotten_intent_predictions enable row level security;

-- Continuity windows
create policy "Users can view own windows" on public.continuity_windows
  for select using (auth.uid() = user_id);
create policy "Users can create own windows" on public.continuity_windows
  for insert with check (auth.uid() = user_id);
create policy "Users can update own windows" on public.continuity_windows
  for update using (auth.uid() = user_id);

-- Window messages (access via window ownership)
create policy "Users can view own window messages" on public.continuity_window_messages
  for select using (
    exists (
      select 1 from public.continuity_windows
      where id = continuity_window_messages.window_id
      and user_id = auth.uid()
    )
  );
create policy "Users can create own window messages" on public.continuity_window_messages
  for insert with check (
    exists (
      select 1 from public.continuity_windows
      where id = continuity_window_messages.window_id
      and user_id = auth.uid()
    )
  );

-- Forgotten intent predictions
create policy "Users can view own predictions" on public.forgotten_intent_predictions
  for select using (auth.uid() = user_id);
create policy "Users can create own predictions" on public.forgotten_intent_predictions
  for insert with check (auth.uid() = user_id);
create policy "Users can update own predictions" on public.forgotten_intent_predictions
  for update using (auth.uid() = user_id);


-- ============================================================================
-- Migration 011: Thread States
-- Source: supabase/migrations/011_thread_states.sql
-- ============================================================================

-- Expand thread status to full state machine:
-- active, paused, interrupted, dormant, resolved, forgotten, restored, dismissed
alter table public.interrupted_threads drop constraint interrupted_threads_status_check;
alter table public.interrupted_threads add constraint interrupted_threads_status_check
  check (status in ('active','paused','interrupted','dormant','resolved','forgotten','restored','dismissed'));
