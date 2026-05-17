-- HNSW index for fast approximate nearest neighbor search
create index memory_items_embedding_idx on public.memory_items
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- RPC function for semantic search
create or replace function match_memories(
  query_embedding extensions.vector(1536),
  match_threshold float default 0.5,
  match_count int default 10,
  filter_user_id uuid default null
)
returns table (
  id uuid,
  user_id uuid,
  type text,
  raw_content text,
  summary text,
  emotional_tone text,
  importance integer,
  created_at timestamptz,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    mi.id,
    mi.user_id,
    mi.type,
    mi.raw_content,
    mi.summary,
    mi.emotional_tone,
    mi.importance,
    mi.created_at,
    1 - (mi.embedding <=> query_embedding) as similarity
  from public.memory_items mi
  where mi.processed = true
    and mi.embedding is not null
    and (filter_user_id is null or mi.user_id = filter_user_id)
    and 1 - (mi.embedding <=> query_embedding) > match_threshold
  order by mi.embedding <=> query_embedding
  limit match_count;
end;
$$;
