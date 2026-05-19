-- 018: Self Model Engine — user life profile, state, patterns, support needs, questions, reflection memory

-- 1. user_life_profile — one row per user, stores the accumulated self-model
create table if not exists user_life_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  roles jsonb default '[]'::jsonb,
  life_areas jsonb default '[]'::jsonb,
  active_persona text check (active_persona in ('carer','worker','parent','founder','faith_community','student','general')),
  persona_confidence float default 0,
  persona_source text check (persona_source in ('inference','user_confirmed')),
  daily_rhythm jsonb default '{"peak_hours":[],"quiet_hours":[],"weekend_pattern":null}'::jsonb,
  support_style jsonb default '{"prefers_questions":true,"prefers_direct":false,"morning_detail_level":"normal","emotional_sensitivity":"normal"}'::jsonb,
  completeness_score float default 0 not null,
  last_inference_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table user_life_profile enable row level security;
create policy "Users read own profile" on user_life_profile for select using (auth.uid() = user_id);
create policy "Users update own profile" on user_life_profile for update using (auth.uid() = user_id);

-- 2. user_state — inferred emotional/life state (State Engine)
create table if not exists user_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  current_state text not null default 'stable' check (current_state in ('overwhelmed','isolated','drifting','in_flow','recovering','stable','stretched')),
  state_confidence float not null default 0.5,
  state_signals jsonb default '[]'::jsonb,
  previous_state text,
  state_changed_at timestamptz default now(),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table user_state enable row level security;
create policy "Users read own state" on user_state for select using (auth.uid() = user_id);

-- 3. user_patterns — detected recurring patterns (shown as "Your Patterns")
create table if not exists user_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  pattern_type text not null check (pattern_type in ('role','recurring_area','relationship_pattern','pressure_signal','support_preference','daily_rhythm','emotional_pattern','commitment_pattern','social_pattern','relational_gravity','identity_reflection')),
  title text not null,
  description text not null,
  confidence float not null default 0.5,
  evidence_count int not null default 1,
  evidence_refs jsonb not null default '[]'::jsonb,
  status text not null default 'emerging' check (status in ('emerging','established','confirmed','dismissed','corrected')),
  user_response text check (user_response in ('accepted','dismissed','corrected')),
  user_correction text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index idx_user_patterns_user on user_patterns(user_id);
create index idx_user_patterns_type on user_patterns(user_id, pattern_type);

alter table user_patterns enable row level security;
create policy "Users read own patterns" on user_patterns for select using (auth.uid() = user_id);
create policy "Users update own patterns" on user_patterns for update using (auth.uid() = user_id);

-- 4. user_support_needs — actionable insight cards for dashboard/morning
create table if not exists user_support_needs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  why_it_matters text not null,
  evidence_summary text,
  suggested_action text,
  confidence float not null default 0.5,
  evidence_refs jsonb not null default '[]'::jsonb,
  category text not null check (category in ('people_relying','things_slipping','closure_opportunity','new_pattern','pressure_building','relationship_health','forgotten_obligation','emotional_load','identity_neglect')),
  morning_section text check (morning_section in ('people_relying','may_slip','one_to_close','pattern_noticed','question')),
  priority float not null default 0.5,
  status text not null default 'active' check (status in ('active','accepted','dismissed','corrected','expired')),
  expires_at timestamptz default (now() + interval '7 days'),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index idx_user_support_needs_user on user_support_needs(user_id);
create index idx_user_support_needs_active on user_support_needs(user_id, status) where status = 'active';

alter table user_support_needs enable row level security;
create policy "Users read own support needs" on user_support_needs for select using (auth.uid() = user_id);
create policy "Users update own support needs" on user_support_needs for update using (auth.uid() = user_id);

-- 5. orbita_questions — profile-building questions (max 1-2/day)
create table if not exists orbita_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  question text not null,
  reason text not null,
  target_field text not null,
  expected_improvement text,
  status text not null default 'pending' check (status in ('pending','shown','answered','dismissed','expired')),
  answer text,
  processed boolean default false,
  expires_at timestamptz default (now() + interval '3 days'),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index idx_orbita_questions_user on orbita_questions(user_id);
create index idx_orbita_questions_pending on orbita_questions(user_id, status) where status in ('pending','shown');

alter table orbita_questions enable row level security;
create policy "Users read own questions" on orbita_questions for select using (auth.uid() = user_id);
create policy "Users update own questions" on orbita_questions for update using (auth.uid() = user_id);

-- 6. reflection_memory — identity, values, aspirations
create table if not exists reflection_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  memory_type text not null check (memory_type in ('value','aspiration','identity_anchor','emotional_anchor','belief','boundary')),
  content text not null,
  source_memory_id uuid references memory_items(id) on delete set null,
  confidence float not null default 0.5,
  source_type text not null default 'inference' check (source_type in ('fact','inference')),
  active boolean default true,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index idx_reflection_memory_user on reflection_memory(user_id);
create index idx_reflection_memory_active on reflection_memory(user_id, active) where active = true;

alter table reflection_memory enable row level security;
create policy "Users read own reflections" on reflection_memory for select using (auth.uid() = user_id);
create policy "Users update own reflections" on reflection_memory for update using (auth.uid() = user_id);
