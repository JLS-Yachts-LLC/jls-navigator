-- Vehicle Maintenance module: damage recorded by tapping a panel on the 3D car.
-- Each report pins to a body panel plus the exact point touched on the model
-- (local model coordinates), so the marker re-renders where the damage is.
create table if not exists public.vehicle_damage_reports (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.crew_vehicles(id) on delete cascade,
  panel       text not null,
  point       jsonb,                          -- {x,y,z} on the model
  kind        text not null default 'scratch'
                check (kind in ('scratch','dent','paintwork','damage','other')),
  severity    text not null default 'minor'
                check (severity in ('minor','moderate','severe')),
  note        text,
  reported_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists vehicle_damage_vehicle_idx
  on public.vehicle_damage_reports (vehicle_id) where resolved_at is null;

alter table public.vehicle_damage_reports enable row level security;
create policy vehicle_damage_staff on public.vehicle_damage_reports
  for all to authenticated using (not is_portal_captain()) with check (not is_portal_captain());

-- Body type drives which 3D model the Maintenance screen renders.
alter table public.crew_vehicles add column if not exists body_type text not null default 'sedan'
  check (body_type in ('coupe','sedan','estate','pickup','van'));
update public.crew_vehicles set body_type = 'van'
  where model ilike '%h1%' or model ilike '%h-1%' or model ilike '%urvan%' or model ilike '%hiace%';
update public.crew_vehicles set body_type = 'pickup'
  where model ilike '%f150%' or model ilike '%f-150%' or model ilike '%ram%' or model ilike '%reward%' or model ilike '%l200%';
update public.crew_vehicles set body_type = 'estate'
  where model ilike '%armada%';

-- Condition reports (digitised paper form) — see live migrations
-- vehicle_condition_reports and vehicle_service_requests for the applied DDL.
