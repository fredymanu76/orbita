-- Enable RLS on cognitive infrastructure tables
alter table public.continuity_windows enable row level security;
alter table public.continuity_window_messages enable row level security;
alter table public.forgotten_intent_predictions enable row level security;

-- Continuity windows
create policy "Users can view own windows" on public.continuity_windows
  for select using (auth.uid() = user_id);
create policy "Users can create own windows" on public.continuity_windows
  for insert with check (auth.uid() = user_id);
create policy "Users can update own windows" on public.continuity_windows
  for update using (auth.uid() = user_id);

-- Window messages (access via window ownership)
create policy "Users can view own window messages" on public.continuity_window_messages
  for select using (
    exists (
      select 1 from public.continuity_windows
      where id = continuity_window_messages.window_id
      and user_id = auth.uid()
    )
  );
create policy "Users can create own window messages" on public.continuity_window_messages
  for insert with check (
    exists (
      select 1 from public.continuity_windows
      where id = continuity_window_messages.window_id
      and user_id = auth.uid()
    )
  );

-- Forgotten intent predictions
create policy "Users can view own predictions" on public.forgotten_intent_predictions
  for select using (auth.uid() = user_id);
create policy "Users can create own predictions" on public.forgotten_intent_predictions
  for insert with check (auth.uid() = user_id);
create policy "Users can update own predictions" on public.forgotten_intent_predictions
  for update using (auth.uid() = user_id);
