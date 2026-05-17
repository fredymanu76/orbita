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
