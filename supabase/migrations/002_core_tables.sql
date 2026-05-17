-- Profiles table (auto-created on user signup)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Memory items: the core entity
create table public.memory_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  type text not null check (type in ('text', 'voice', 'image', 'task')),
  raw_content text not null,
  summary text,
  audio_url text,
  image_url text,
  emotional_tone text,
  importance integer check (importance >= 1 and importance <= 10),
  embedding extensions.vector(1536),
  processed boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- People: extracted persons from memories
create table public.people (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  relationship text,
  context text,
  mention_count integer default 1 not null,
  last_mentioned_at timestamptz default now(),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (user_id, name)
);

-- Commitments: extracted promises/obligations
create table public.commitments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  description text not null,
  status text default 'active' not null check (status in ('active', 'completed', 'cancelled', 'overdue')),
  due_date date,
  direction text not null check (direction in ('outgoing', 'incoming')),
  source_memory_id uuid references public.memory_items on delete set null,
  person_id uuid references public.people on delete set null,
  importance integer check (importance >= 1 and importance <= 10),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Tasks: actionable items
create table public.tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  status text default 'pending' not null check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  priority text default 'medium' not null check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date date,
  linked_commitment_id uuid references public.commitments on delete set null,
  source_memory_id uuid references public.memory_items on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Reminders: scheduled notifications
create table public.reminders (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  message text not null,
  remind_at timestamptz not null,
  status text default 'pending' not null check (status in ('pending', 'sent', 'dismissed', 'snoozed')),
  task_id uuid references public.tasks on delete cascade,
  commitment_id uuid references public.commitments on delete cascade,
  created_at timestamptz default now() not null
);

-- Memory-People junction table
create table public.memory_people (
  memory_id uuid references public.memory_items on delete cascade not null,
  person_id uuid references public.people on delete cascade not null,
  role text,
  primary key (memory_id, person_id)
);

-- Daily briefs
create table public.daily_briefs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  brief_date date not null,
  content text not null,
  commitments_due jsonb,
  created_at timestamptz default now() not null,
  unique (user_id, brief_date)
);

-- Recall queries (history)
create table public.recall_queries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  query_text text not null,
  response_text text not null,
  source_memory_ids uuid[] default '{}',
  created_at timestamptz default now() not null
);

-- Indexes
create index memory_items_user_id_idx on public.memory_items (user_id);
create index memory_items_created_at_idx on public.memory_items (created_at desc);
create index memory_items_type_idx on public.memory_items (type);
create index commitments_user_id_idx on public.commitments (user_id);
create index commitments_status_idx on public.commitments (status);
create index commitments_due_date_idx on public.commitments (due_date);
create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_status_idx on public.tasks (status);
create index people_user_id_idx on public.people (user_id);
create index reminders_user_id_idx on public.reminders (user_id);
create index reminders_remind_at_idx on public.reminders (remind_at);
create index reminders_status_idx on public.reminders (status);
