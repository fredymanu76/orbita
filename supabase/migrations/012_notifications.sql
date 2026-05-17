-- Push notification subscriptions
create table public.push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (user_id, endpoint)
);

create index idx_push_subscriptions_user on public.push_subscriptions(user_id);

-- Notification preferences
create table public.notification_preferences (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null unique,
  email_daily_brief boolean default true,
  email_follow_up_alerts boolean default true,
  push_forgotten_intents boolean default true,
  push_overdue_follow_ups boolean default true,
  push_thread_decay_alerts boolean default false,
  quiet_hours_start time default '22:00',
  quiet_hours_end time default '07:00',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- RLS
alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;

create policy "Users manage own push subscriptions"
  on public.push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own notification preferences"
  on public.notification_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
