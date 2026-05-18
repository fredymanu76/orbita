-- RLS policies for threads tables

alter table threads enable row level security;
alter table thread_captures enable row level security;
alter table thread_entities enable row level security;

-- threads: full CRUD for own records
create policy "Users can view own threads"
  on threads for select using (auth.uid() = user_id);

create policy "Users can create own threads"
  on threads for insert with check (auth.uid() = user_id);

create policy "Users can update own threads"
  on threads for update using (auth.uid() = user_id);

create policy "Users can delete own threads"
  on threads for delete using (auth.uid() = user_id);

-- thread_captures: access via thread ownership
create policy "Users can view own thread captures"
  on thread_captures for select
  using (exists (select 1 from threads where threads.id = thread_captures.thread_id and threads.user_id = auth.uid()));

create policy "Users can create own thread captures"
  on thread_captures for insert
  with check (exists (select 1 from threads where threads.id = thread_captures.thread_id and threads.user_id = auth.uid()));

create policy "Users can delete own thread captures"
  on thread_captures for delete
  using (exists (select 1 from threads where threads.id = thread_captures.thread_id and threads.user_id = auth.uid()));

-- thread_entities: access via thread ownership
create policy "Users can view own thread entities"
  on thread_entities for select
  using (exists (select 1 from threads where threads.id = thread_entities.thread_id and threads.user_id = auth.uid()));

create policy "Users can create own thread entities"
  on thread_entities for insert
  with check (exists (select 1 from threads where threads.id = thread_entities.thread_id and threads.user_id = auth.uid()));

create policy "Users can delete own thread entities"
  on thread_entities for delete
  using (exists (select 1 from threads where threads.id = thread_entities.thread_id and threads.user_id = auth.uid()));
