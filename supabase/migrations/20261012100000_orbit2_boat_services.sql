-- Orbit 2 — Managed Boats: the Maintenance Schedule's Service Calendar
-- (client request, 12 Oct 2026).
--
-- Tracks the boat's recurring services — engine services by date and by
-- running hours, and safety equipment servicing (liferaft, flares, fire
-- extinguishers…). One row per service line: when it was last done, when it is
-- next due (by date and/or engine running hours) and the current hours reading.
-- Service reports and certificates attach in orbit2_boat_service_files.
--
-- Inventory items with an expiry date also appear in the calendar, read straight
-- from orbit2_boat_inventory in the app — they are not copied here.

create table if not exists public.orbit2_boat_services (
  id                      uuid primary key default gen_random_uuid(),
  boat_id                 uuid not null references public.orbit2_boats(id) on delete cascade,
  service                 text not null,
  last_service_date       date,
  next_service_date       date,
  current_run_hours       numeric(10, 1) check (current_run_hours >= 0),
  next_service_run_hours  numeric(10, 1) check (next_service_run_hours >= 0),
  notes                   text,
  created_by              uuid references auth.users(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists orbit2_boat_services_boat_idx on public.orbit2_boat_services (boat_id, next_service_date);

create table if not exists public.orbit2_boat_service_files (
  id           uuid primary key default gen_random_uuid(),
  service_id   uuid not null references public.orbit2_boat_services(id) on delete cascade,
  file_name    text not null,
  storage_ref  text not null,
  uploaded_by  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index if not exists orbit2_boat_service_files_service_idx on public.orbit2_boat_service_files (service_id);

drop trigger if exists orbit2_boat_services_bu on public.orbit2_boat_services;
create trigger orbit2_boat_services_bu before update on public.orbit2_boat_services
  for each row execute function public.orbit2_touch_boat_expense(); -- generic updated_at touch (20261012090000)

-- ── RLS — same shape as every other Orbit 2 table ───────────────────────────
alter table public.orbit2_boat_services enable row level security;
alter table public.orbit2_boat_service_files enable row level security;

do $policies$
declare t text;
begin
  foreach t in array array['orbit2_boat_services', 'orbit2_boat_service_files'] loop
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format(
      'create policy authenticated_all on public.%I for all to authenticated '
      || 'using ((select auth.role()) = ''authenticated'') '
      || 'with check ((select auth.role()) = ''authenticated'')', t);

    execute format('drop policy if exists portal_captain_block on public.%I', t);
    execute format(
      'create policy portal_captain_block on public.%I as restrictive for all to authenticated '
      || 'using ((select not public.is_portal_captain())) '
      || 'with check ((select not public.is_portal_captain()))', t);
  end loop;
end $policies$;
