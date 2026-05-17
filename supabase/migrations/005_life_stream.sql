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
