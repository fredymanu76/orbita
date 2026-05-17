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
