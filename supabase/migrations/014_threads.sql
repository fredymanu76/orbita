-- Threads: first-class entity that accumulates captures, entities, and commitments
create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  summary text,
  thread_type text not null default 'general' check (
    thread_type in (
      'relationship', 'project', 'obligation', 'concern', 'planning',
      'idea', 'emotional', 'admin', 'recurring', 'general'
    )
  ),
  status text not null default 'active' check (
    status in (
      'active', 'unresolved', 'paused', 'completed', 'forgotten_risk',
      'emotionally_sensitive', 'time_sensitive'
    )
  ),
  continuity_score float default 1.0,
  decay_coefficient float default 0.05,
  continuity_retention float default 1.0,
  last_activity_at timestamptz default now(),
  capture_count int default 0,
  entity_count int default 0,
  commitment_count int default 0,
  embedding vector(1536),
  importance float default 5.0,
  emotional_valence float default 0.0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Thread-capture junction
create table if not exists thread_captures (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads(id) on delete cascade,
  memory_id uuid not null references memory_items(id) on delete cascade,
  link_confidence float default 1.0,
  created_at timestamptz default now(),
  unique(thread_id, memory_id)
);

-- Thread-entity junction (polymorphic: links threads to people, commitments, etc.)
create table if not exists thread_entities (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads(id) on delete cascade,
  entity_type text not null check (entity_type in ('person', 'commitment', 'task', 'follow_up')),
  entity_id uuid not null,
  created_at timestamptz default now(),
  unique(thread_id, entity_type, entity_id)
);

-- HNSW index for thread embedding search
create index if not exists threads_embedding_idx
  on threads using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Index for user lookups
create index if not exists threads_user_id_idx on threads(user_id);
create index if not exists threads_status_idx on threads(user_id, status);
create index if not exists thread_captures_thread_idx on thread_captures(thread_id);
create index if not exists thread_captures_memory_idx on thread_captures(memory_id);
create index if not exists thread_entities_thread_idx on thread_entities(thread_id);

-- FK from memory_items.primary_thread_id to threads
-- (column was added in 013_processing_error.sql)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'memory_items_primary_thread_id_fkey'
  ) then
    alter table memory_items
      add constraint memory_items_primary_thread_id_fkey
      foreign key (primary_thread_id) references threads(id) on delete set null;
  end if;
end $$;

-- RPC: match_threads — vector search against thread embeddings
create or replace function match_threads(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_user_id uuid
)
returns table (
  id uuid,
  user_id uuid,
  title text,
  summary text,
  thread_type text,
  status text,
  capture_count int,
  entity_count int,
  commitment_count int,
  importance float,
  emotional_valence float,
  last_activity_at timestamptz,
  continuity_retention float,
  created_at timestamptz,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    t.id,
    t.user_id,
    t.title,
    t.summary,
    t.thread_type,
    t.status,
    t.capture_count,
    t.entity_count,
    t.commitment_count,
    t.importance::float,
    t.emotional_valence::float,
    t.last_activity_at,
    t.continuity_retention::float,
    t.created_at,
    (1 - (t.embedding <=> query_embedding))::float as similarity
  from threads t
  where t.user_id = filter_user_id
    and t.embedding is not null
    and (1 - (t.embedding <=> query_embedding)) > match_threshold
  order by t.embedding <=> query_embedding
  limit match_count;
end;
$$;
