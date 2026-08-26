-- Digitised JLS Vehicle Condition Report + driver Service Requests.
alter table public.vehicle_damage_reports drop constraint if exists vehicle_damage_reports_kind_check;
alter table public.vehicle_damage_reports add constraint vehicle_damage_reports_kind_check
  check (kind in ('scratch','bent','broken','cracked','chipped','dented','holed','missing','torn','paintwork','dent','damage','other'));
alter table public.vehicle_damage_reports add column if not exists photo_url text;
alter table public.vehicle_damage_reports add column if not exists condition_report_id uuid;

create table if not exists public.vehicle_condition_reports (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.crew_vehicles(id) on delete cascade,
  driver_name  text not null,
  mileage      integer,
  date_in      date not null default current_date,
  date_out     date,
  next_service text,
  services     jsonb not null default '[]'::jsonb,
  comments     text,
  signature    text,
  status       text not null default 'open' check (status in ('open','completed')),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.vehicle_damage_reports
  add constraint vehicle_damage_reports_report_fk
  foreign key (condition_report_id) references public.vehicle_condition_reports(id) on delete set null;
create index if not exists vehicle_condition_vehicle_idx on public.vehicle_condition_reports (vehicle_id, created_at desc);
alter table public.vehicle_condition_reports enable row level security;
create policy vehicle_condition_staff on public.vehicle_condition_reports
  for all to authenticated using (not is_portal_captain()) with check (not is_portal_captain());

create table if not exists public.vehicle_service_requests (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.crew_vehicles(id) on delete cascade,
  driver_name  text not null,
  request_type text not null default 'mechanical'
    check (request_type in ('mechanical','electrical','bodywork','tyres','service','legal','other')),
  urgency      text not null default 'when_available'
    check (urgency in ('asap','when_available','next_service','legal_requirement')),
  description  text,
  photo_url    text,
  status       text not null default 'open' check (status in ('open','in_progress','done')),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  closed_at    timestamptz
);
create index if not exists vehicle_service_requests_vehicle_idx
  on public.vehicle_service_requests (vehicle_id) where status <> 'done';
alter table public.vehicle_service_requests enable row level security;
create policy vehicle_service_requests_staff on public.vehicle_service_requests
  for all to authenticated using (not is_portal_captain()) with check (not is_portal_captain());
