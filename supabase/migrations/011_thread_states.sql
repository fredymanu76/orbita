-- Expand thread status to full state machine:
-- active, paused, interrupted, dormant, resolved, forgotten, restored, dismissed
alter table public.interrupted_threads drop constraint interrupted_threads_status_check;
alter table public.interrupted_threads add constraint interrupted_threads_status_check
  check (status in ('active','paused','interrupted','dormant','resolved','forgotten','restored','dismissed'));
