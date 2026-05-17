-- Enable RLS on human state tables
alter table public.emotional_readings enable row level security;
alter table public.behavioural_baselines enable row level security;
alter table public.wearable_connections enable row level security;
alter table public.wearable_data_points enable row level security;

-- Emotional readings
create policy "Users can view own emotional readings" on public.emotional_readings
  for select using (auth.uid() = user_id);
create policy "Users can create own emotional readings" on public.emotional_readings
  for insert with check (auth.uid() = user_id);

-- Behavioural baselines
create policy "Users can view own baselines" on public.behavioural_baselines
  for select using (auth.uid() = user_id);
create policy "Users can create own baselines" on public.behavioural_baselines
  for insert with check (auth.uid() = user_id);
create policy "Users can update own baselines" on public.behavioural_baselines
  for update using (auth.uid() = user_id);

-- Wearable connections
create policy "Users can view own wearable connections" on public.wearable_connections
  for select using (auth.uid() = user_id);
create policy "Users can create own wearable connections" on public.wearable_connections
  for insert with check (auth.uid() = user_id);
create policy "Users can update own wearable connections" on public.wearable_connections
  for update using (auth.uid() = user_id);
create policy "Users can delete own wearable connections" on public.wearable_connections
  for delete using (auth.uid() = user_id);

-- Wearable data points
create policy "Users can view own wearable data" on public.wearable_data_points
  for select using (auth.uid() = user_id);
create policy "Users can create own wearable data" on public.wearable_data_points
  for insert with check (auth.uid() = user_id);
