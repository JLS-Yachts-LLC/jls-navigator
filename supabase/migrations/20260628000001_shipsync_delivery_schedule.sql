-- ============================================================
-- ShipSync — weekly delivery schedule (boat -> weekday)
-- Powers the Routing screen's delivery calendar.
-- ============================================================

create table if not exists public.shipsync_delivery_schedule (
  id         uuid primary key default gen_random_uuid(),
  boat_name  text not null,
  weekday    int not null check (weekday between 0 and 6),   -- 0=Mon … 6=Sun
  created_at timestamptz not null default now(),
  unique (boat_name, weekday)
);

create index if not exists idx_shipsync_delivery_schedule_weekday
  on public.shipsync_delivery_schedule (weekday);

alter table public.shipsync_delivery_schedule enable row level security;
drop policy if exists shipsync_delivery_schedule_authed on public.shipsync_delivery_schedule;
create policy shipsync_delivery_schedule_authed on public.shipsync_delivery_schedule
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
