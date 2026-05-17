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
