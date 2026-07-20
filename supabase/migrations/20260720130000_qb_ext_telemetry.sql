-- QuickBooks browser-extension telemetry: who has it installed (heartbeats)
-- and what happened (installs, attaches, errors). Written by the worker
-- (service role) from extension pings; staff read it on Finance -> QB Extension.
create table if not exists public.qb_ext_installs (
  name        text primary key,
  version     text,
  ua          text,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create table if not exists public.qb_ext_events (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  version     text,
  event       text not null,          -- install | error | attach-ok | attach-fail
  message     text,
  page        text,
  created_at  timestamptz not null default now()
);
create index if not exists qb_ext_events_created_idx on public.qb_ext_events (created_at desc);

alter table public.qb_ext_installs enable row level security;
alter table public.qb_ext_events enable row level security;
drop policy if exists qb_ext_installs_read on public.qb_ext_installs;
create policy qb_ext_installs_read on public.qb_ext_installs for select to authenticated using (true);
drop policy if exists qb_ext_events_read on public.qb_ext_events;
create policy qb_ext_events_read on public.qb_ext_events for select to authenticated using (true);
