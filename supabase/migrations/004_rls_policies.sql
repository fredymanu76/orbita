-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.memory_items enable row level security;
alter table public.people enable row level security;
alter table public.commitments enable row level security;
alter table public.tasks enable row level security;
alter table public.reminders enable row level security;
alter table public.memory_people enable row level security;
alter table public.daily_briefs enable row level security;
alter table public.recall_queries enable row level security;

-- Profiles policies
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Memory items policies
create policy "Users can view own memories" on public.memory_items
  for select using (auth.uid() = user_id);
create policy "Users can create own memories" on public.memory_items
  for insert with check (auth.uid() = user_id);
create policy "Users can update own memories" on public.memory_items
  for update using (auth.uid() = user_id);
create policy "Users can delete own memories" on public.memory_items
  for delete using (auth.uid() = user_id);

-- People policies
create policy "Users can view own people" on public.people
  for select using (auth.uid() = user_id);
create policy "Users can create own people" on public.people
  for insert with check (auth.uid() = user_id);
create policy "Users can update own people" on public.people
  for update using (auth.uid() = user_id);
create policy "Users can delete own people" on public.people
  for delete using (auth.uid() = user_id);

-- Commitments policies
create policy "Users can view own commitments" on public.commitments
  for select using (auth.uid() = user_id);
create policy "Users can create own commitments" on public.commitments
  for insert with check (auth.uid() = user_id);
create policy "Users can update own commitments" on public.commitments
  for update using (auth.uid() = user_id);
create policy "Users can delete own commitments" on public.commitments
  for delete using (auth.uid() = user_id);

-- Tasks policies
create policy "Users can view own tasks" on public.tasks
  for select using (auth.uid() = user_id);
create policy "Users can create own tasks" on public.tasks
  for insert with check (auth.uid() = user_id);
create policy "Users can update own tasks" on public.tasks
  for update using (auth.uid() = user_id);
create policy "Users can delete own tasks" on public.tasks
  for delete using (auth.uid() = user_id);

-- Reminders policies
create policy "Users can view own reminders" on public.reminders
  for select using (auth.uid() = user_id);
create policy "Users can create own reminders" on public.reminders
  for insert with check (auth.uid() = user_id);
create policy "Users can update own reminders" on public.reminders
  for update using (auth.uid() = user_id);
create policy "Users can delete own reminders" on public.reminders
  for delete using (auth.uid() = user_id);

-- Memory-People policies
create policy "Users can view own memory_people" on public.memory_people
  for select using (
    exists (
      select 1 from public.memory_items
      where id = memory_people.memory_id
      and user_id = auth.uid()
    )
  );
create policy "Users can create own memory_people" on public.memory_people
  for insert with check (
    exists (
      select 1 from public.memory_items
      where id = memory_people.memory_id
      and user_id = auth.uid()
    )
  );
create policy "Users can delete own memory_people" on public.memory_people
  for delete using (
    exists (
      select 1 from public.memory_items
      where id = memory_people.memory_id
      and user_id = auth.uid()
    )
  );

-- Daily briefs policies
create policy "Users can view own briefs" on public.daily_briefs
  for select using (auth.uid() = user_id);
create policy "Users can create own briefs" on public.daily_briefs
  for insert with check (auth.uid() = user_id);

-- Recall queries policies
create policy "Users can view own recall queries" on public.recall_queries
  for select using (auth.uid() = user_id);
create policy "Users can create own recall queries" on public.recall_queries
  for insert with check (auth.uid() = user_id);

-- Profile creation trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
