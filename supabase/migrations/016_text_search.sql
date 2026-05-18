-- Enable pg_trgm for fuzzy text search fallback
create extension if not exists pg_trgm;

-- Trigram indexes for fallback text search when vector search returns nothing
create index if not exists memory_items_raw_content_trgm_idx
  on memory_items using gin (raw_content gin_trgm_ops);

create index if not exists memory_items_summary_trgm_idx
  on memory_items using gin (summary gin_trgm_ops)
  where summary is not null;

create index if not exists commitments_description_trgm_idx
  on commitments using gin (description gin_trgm_ops);

create index if not exists threads_title_trgm_idx
  on threads using gin (title gin_trgm_ops);

create index if not exists threads_summary_trgm_idx
  on threads using gin (summary gin_trgm_ops)
  where summary is not null;

create index if not exists people_name_trgm_idx
  on people using gin (name gin_trgm_ops);

-- Text search function for memories (fuzzy ILIKE fallback)
create or replace function search_memories_text(
  search_query text,
  filter_user_id uuid,
  result_limit int default 10
)
returns table (
  id uuid,
  user_id uuid,
  type text,
  raw_content text,
  summary text,
  emotional_tone text,
  importance int,
  created_at timestamptz,
  relevance float
)
language plpgsql
as $$
begin
  return query
  select
    m.id,
    m.user_id,
    m.type::text,
    m.raw_content,
    m.summary,
    m.emotional_tone,
    m.importance,
    m.created_at,
    similarity(m.raw_content, search_query)::float as relevance
  from memory_items m
  where m.user_id = filter_user_id
    and (
      m.raw_content ilike '%' || search_query || '%'
      or m.summary ilike '%' || search_query || '%'
      or similarity(m.raw_content, search_query) > 0.1
    )
  order by similarity(m.raw_content, search_query) desc
  limit result_limit;
end;
$$;
