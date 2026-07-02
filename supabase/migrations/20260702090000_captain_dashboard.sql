-- Captain Dashboard — operational request tables (POLARIS_CAPTAIN_DASHBOARD.md, tickets #154/#155).
--
-- NOTE ON SCHEMA RECONCILIATION:
--   The spec was authored against a `vessels(vessel_id)` model, but the live app uses
--   `yachts(id)` with crew scoped via `crew_members.yacht_id`. These tables therefore FK
--   to yachts(id) / crew_members(id).
--
-- NOTE ON RLS:
--   The spec's JWT vessel-scoping (auth.jwt() ->> 'vessel_ids') is not yet wired in this
--   app (see POLARIS_ACCESS_CONTROL gaps). To stay consistent with the rest of the platform
--   (e.g. esign_documents, yacht_it_contracts) these use authenticated-manage policies.
--   Tighten to per-vessel JWT scope when the access-control claims layer ships.

-- ── operations_requests ───────────────────────────────────────────────────────
create table if not exists public.operations_requests (
  request_id    uuid primary key default gen_random_uuid(),
  yacht_id      uuid not null references public.yachts(id) on delete cascade,
  submitted_by  uuid references auth.users(id) on delete set null,
  category      text not null check (category in (
                  'immigration','bunkering','berthing','visa',
                  'technical','logistics','provisioning','crew_care'
                )),
  description   text not null,
  priority      text not null default 'routine'
                  check (priority in ('routine','urgent','emergency')),
  required_date date,
  status        text not null default 'open'
                  check (status in (
                    'open','in_progress','pending_captain','complete','cancelled'
                  )),
  assigned_to   uuid references auth.users(id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  closed_at     timestamptz
);
alter table public.operations_requests enable row level security;
drop policy if exists "Authenticated manage operations_requests" on public.operations_requests;
create policy "Authenticated manage operations_requests"
  on public.operations_requests for all using (auth.role() = 'authenticated');
create index if not exists idx_ops_requests_yacht  on public.operations_requests(yacht_id);
create index if not exists idx_ops_requests_status on public.operations_requests(status);
drop trigger if exists trg_ops_requests_updated on public.operations_requests;
create trigger trg_ops_requests_updated before update on public.operations_requests
  for each row execute function public.set_updated_at();

-- ── bunkering_requests ────────────────────────────────────────────────────────
create table if not exists public.bunkering_requests (
  id              uuid primary key default gen_random_uuid(),
  yacht_id        uuid not null references public.yachts(id) on delete cascade,
  submitted_by    uuid references auth.users(id) on delete set null,
  fuel_type       text not null check (fuel_type in ('MGO','VLSFO','MDO','IFO')),
  quantity_mt     numeric(10,2) not null,
  location        text not null,
  required_date   date not null,
  instructions    text,
  status          text not null default 'requested'
                    check (status in (
                      'requested','quoted','quote_accepted',
                      'delivery_scheduled','delivered','invoiced'
                    )),
  accepted_quote_id     uuid,
  supplier_name         text,
  delivery_confirmed_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.bunkering_requests enable row level security;
drop policy if exists "Authenticated manage bunkering_requests" on public.bunkering_requests;
create policy "Authenticated manage bunkering_requests"
  on public.bunkering_requests for all using (auth.role() = 'authenticated');
create index if not exists idx_bunkering_yacht on public.bunkering_requests(yacht_id);
drop trigger if exists trg_bunkering_updated on public.bunkering_requests;
create trigger trg_bunkering_updated before update on public.bunkering_requests
  for each row execute function public.set_updated_at();

-- ── berthing_requests ─────────────────────────────────────────────────────────
create table if not exists public.berthing_requests (
  id              uuid primary key default gen_random_uuid(),
  yacht_id        uuid not null references public.yachts(id) on delete cascade,
  submitted_by    uuid references auth.users(id) on delete set null,
  type            text not null check (type in (
                    'new_berth','relocation','extension','departure'
                  )),
  marina          text,
  preferred_berth text,
  arrival_date    date,
  departure_date  date,
  notes           text,
  status          text not null default 'requested'
                    check (status in ('requested','confirmed','amended','cancelled')),
  confirmed_berth text,
  confirmed_by    uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.berthing_requests enable row level security;
drop policy if exists "Authenticated manage berthing_requests" on public.berthing_requests;
create policy "Authenticated manage berthing_requests"
  on public.berthing_requests for all using (auth.role() = 'authenticated');
create index if not exists idx_berthing_yacht on public.berthing_requests(yacht_id);
drop trigger if exists trg_berthing_updated on public.berthing_requests;
create trigger trg_berthing_updated before update on public.berthing_requests
  for each row execute function public.set_updated_at();

-- ── crew_care_requests ────────────────────────────────────────────────────────
create table if not exists public.crew_care_requests (
  id            uuid primary key default gen_random_uuid(),
  yacht_id      uuid not null references public.yachts(id) on delete cascade,
  crew_id       uuid references public.crew_members(id) on delete set null,
  submitted_by  uuid references auth.users(id) on delete set null,
  category      text not null check (category in (
                  'airport_transfer','hotel_transfer','marina_transfer',
                  'doctor','hospital','sim_card','local_info'
                )),
  details       jsonb not null default '{}',
  status        text not null default 'requested'
                  check (status in (
                    'requested','assigned','in_progress','complete','cancelled'
                  )),
  assigned_to   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  updated_at    timestamptz not null default now()
);
alter table public.crew_care_requests enable row level security;
drop policy if exists "Authenticated manage crew_care_requests" on public.crew_care_requests;
create policy "Authenticated manage crew_care_requests"
  on public.crew_care_requests for all using (auth.role() = 'authenticated');
create index if not exists idx_crew_care_yacht on public.crew_care_requests(yacht_id);
drop trigger if exists trg_crew_care_updated on public.crew_care_requests;
create trigger trg_crew_care_updated before update on public.crew_care_requests
  for each row execute function public.set_updated_at();

-- ── incident_reports ──────────────────────────────────────────────────────────
-- Incidents are permanent: no UPDATE/DELETE policy is granted (insert + select only).
create table if not exists public.incident_reports (
  id            uuid primary key default gen_random_uuid(),
  yacht_id      uuid not null references public.yachts(id) on delete cascade,
  reported_by   uuid references auth.users(id) on delete set null,
  type          text not null check (type in (
                  'security','accident','crew_injury','pollution','other'
                )),
  description   text not null,
  location      text,
  occurred_at   timestamptz not null,
  injuries      boolean not null default false,
  persons_involved text,
  immediate_action text,
  jls_notified  boolean not null default false,
  reported_at   timestamptz not null default now()
);
alter table public.incident_reports enable row level security;
drop policy if exists "Authenticated read incident_reports" on public.incident_reports;
create policy "Authenticated read incident_reports"
  on public.incident_reports for select using (auth.role() = 'authenticated');
drop policy if exists "Authenticated insert incident_reports" on public.incident_reports;
create policy "Authenticated insert incident_reports"
  on public.incident_reports for insert with check (auth.role() = 'authenticated');
create index if not exists idx_incidents_yacht on public.incident_reports(yacht_id);
