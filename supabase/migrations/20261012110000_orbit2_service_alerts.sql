-- Orbit 2 — Managed Boats: alerts before a service is due (client request,
-- 12 Oct 2026). A daily job (src/lib/orbit2-service-alerts.server.ts) warns the
-- Orbit 2 admins — in the app and by email — 30 and 7 days before a Service
-- Calendar date or Inventory List expiry, on the day it falls due, and when the
-- engine is within 25 running hours of its next service or past it.
--
-- Each alert is claimed here before anything is sent, so it goes once even if
-- the job runs twice. A re-dated service (or a new next-service hours figure)
-- gets fresh alerts, because the date / hours are part of the key.

create table if not exists public.orbit2_service_alerts (
  alert_key       text primary key,
  boat_id         uuid references public.orbit2_boats(id) on delete cascade,
  service_id      uuid references public.orbit2_boat_services(id) on delete cascade,
  inventory_id    uuid references public.orbit2_boat_inventory(id) on delete cascade,
  stage           text not null,
  notified_users  uuid[] not null default '{}',
  emailed         text[] not null default '{}',
  created_at      timestamptz not null default now()
);
create index if not exists orbit2_service_alerts_boat_idx on public.orbit2_service_alerts (boat_id);

-- Written and read only by the worker (service role).
alter table public.orbit2_service_alerts enable row level security;
revoke all on public.orbit2_service_alerts from anon, authenticated;

-- The people the alerts go to: everyone with Admin on the Orbit module — the
-- same test as orbit2_is_admin() — whose profile is active.
create or replace function public.orbit2_admin_recipients()
returns table (user_id uuid, display_name text, email text)
language sql stable security definer set search_path = public as $fn$
  select p.user_id, p.display_name, p.email
  from public.user_profiles p
  where coalesce(p.active, true)
    and coalesce(public.has_module_permission(p.user_id, 'orbit', 'admin'), false)
$fn$;
revoke all on function public.orbit2_admin_recipients() from public, anon, authenticated;
grant execute on function public.orbit2_admin_recipients() to service_role;
