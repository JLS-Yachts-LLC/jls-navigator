-- Orbit 2 — the task store behind the new dashboard.
--
-- Its own table rather than the existing orbit_tasks: Orbit 2 is being specified
-- fresh, its tasks are entered on its own pages, and the dashboard needs fields
-- the current Orbit tasks do not carry (a service category, and a start/end time
-- so work can be drawn on an hour-by-hour calendar). Keeping it separate also
-- means nothing here can disturb the ORBIT module already in daily use.
--
-- Every column exists to feed something on the dashboard:
--   category            → the donut, and the colour of a calendar block
--   yacht_id            → Client Project Status, one bar per vessel
--   status              → Task Complete, and the Complete/Pending split
--   task_date + times   → the calendar grid
--   assigned_to         → Team Management
create table if not exists public.orbit2_tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  -- Free text rather than an enum: the five services below are what the client
  -- named, and a sixth should not need a migration to add.
  category    text not null default 'Vessel Services',
  yacht_id    uuid references public.yachts(id) on delete set null,
  status      text not null default 'pending' check (status in ('pending','complete')),
  task_date   date,
  start_time  time,
  end_time    time,
  assigned_to text,
  notes       text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists orbit2_tasks_date_idx     on public.orbit2_tasks (task_date);
create index if not exists orbit2_tasks_yacht_idx    on public.orbit2_tasks (yacht_id);
create index if not exists orbit2_tasks_category_idx on public.orbit2_tasks (category);

alter table public.orbit2_tasks enable row level security;

-- Same shape as the other operational tables: any signed-in staff member, never
-- a client-portal captain.
drop policy if exists authenticated_all on public.orbit2_tasks;
create policy authenticated_all on public.orbit2_tasks for all to authenticated
  using ((select auth.role()) = 'authenticated') with check ((select auth.role()) = 'authenticated');
drop policy if exists portal_captain_block on public.orbit2_tasks;
create policy portal_captain_block on public.orbit2_tasks as restrictive for all to authenticated
  using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
