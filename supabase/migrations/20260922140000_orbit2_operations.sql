-- Orbit 2 — the full operations store (Polaris Orbit functional specification).
--
-- Replaces the placeholder orbit2_tasks table. That table only ever fed the first
-- draft of the dashboard and holds no rows, so it is dropped rather than migrated.
--
-- The spec describes three registries that share one shape:
--   Project List  — Vessel Services / Vessel Equipment / Port Compliance /
--                   Technical Support, IDs OPS26-XXXX
--   Bunkering     — the same record with the category locked, no Specific Task,
--                   and fuel fields, IDs BUNK26-XXXX
--   EHS NOC       — a flat spreadsheet of permits, IDs OPS-NOC-26-XXXX
--
-- Project List and Bunkering live in ONE table keyed by record_type. They are the
-- same record with different labels and two extra fields; splitting them would
-- duplicate every column, every policy and every query, and the calendar and the
-- dashboard would then have to union them back together on every read.

drop table if exists public.orbit2_tasks cascade;

-- ── ID series ───────────────────────────────────────────────────────────────
-- Sequences, not max()+1: two people pressing Submit at the same moment must not
-- be handed the same Task ID. The year is stamped at insert time from the clock.
create sequence if not exists public.orbit2_ops_seq  as bigint start 1;
create sequence if not exists public.orbit2_bunk_seq as bigint start 1;
create sequence if not exists public.orbit2_noc_seq  as bigint start 1;

-- ── Project List + Bunkering ────────────────────────────────────────────────
create table public.orbit2_projects (
  id             uuid primary key default gen_random_uuid(),
  record_type    text not null default 'project'
                   check (record_type in ('project','bunkering')),
  -- Read-only in the UI; filled by the trigger below.
  task_id        text unique,

  -- Boat/Client Name is free text with typeahead, per spec — clients here are not
  -- all managed vessels, so a foreign key to yachts would turn away half of them.
  client_name    text,
  requestor_name text,
  email          text,
  whatsapp       text,

  status         text not null default 'Not Yet Initiated' check (status in (
                   'Not Yet Initiated','Quote in Process/Approval','Quotation Approved',
                   'On Hold','Cancelled','Scheduled/Assigned','Working On It','Complete')),
  service_category text not null default 'Vessel Services',
  specific_task  text,

  schedule_date  date,
  schedule_time  time,
  location       text,
  assigned_team  text[] not null default '{}',

  jls_quote      text,
  invoice_number text,
  supplier       text,
  -- ETC is entered as hh:mm and is a duration, not a clock time — minutes keeps
  -- "02:30" meaning two and a half hours rather than half past two.
  etc_minutes    integer,

  -- Bunkering only.
  product_grade  text,
  quantity       numeric,
  quantity_unit  text,

  -- Set by the system when status becomes Complete; never typed.
  work_completed_at  timestamptz,
  client_notified_at timestamptz,

  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index orbit2_projects_type_idx   on public.orbit2_projects (record_type);
create index orbit2_projects_status_idx on public.orbit2_projects (status);
create index orbit2_projects_date_idx   on public.orbit2_projects (schedule_date);
create index orbit2_projects_client_idx on public.orbit2_projects (client_name);
create index orbit2_projects_team_idx   on public.orbit2_projects using gin (assigned_team);

create or replace function public.orbit2_assign_task_id()
returns trigger language plpgsql as $fn$
begin
  if new.task_id is null or new.task_id = '' then
    new.task_id := case when new.record_type = 'bunkering'
      then 'BUNK' || to_char(now(), 'YY') || '-' || lpad(nextval('public.orbit2_bunk_seq')::text, 4, '0')
      else 'OPS'  || to_char(now(), 'YY') || '-' || lpad(nextval('public.orbit2_ops_seq')::text,  4, '0')
    end;
  end if;
  -- Work Completion Date & Time is owned by the system: stamped the first time a
  -- record reaches Complete, cleared if it is ever moved back off Complete.
  if new.status = 'Complete' and new.work_completed_at is null then
    new.work_completed_at := now();
  elsif new.status <> 'Complete' then
    new.work_completed_at := null;
  end if;
  new.updated_at := now();
  return new;
end $fn$;

create trigger orbit2_projects_biu before insert or update on public.orbit2_projects
  for each row execute function public.orbit2_assign_task_id();

-- ── Remarks and Team Comments ───────────────────────────────────────────────
-- Append-only rows rather than one growing text column, so each entry carries its
-- own author and timestamp and nothing already written can be edited away.
create table public.orbit2_notes (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.orbit2_projects(id) on delete cascade,
  kind       text not null check (kind in ('remark','team_comment')),
  author     text not null,
  body       text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index orbit2_notes_project_idx on public.orbit2_notes (project_id, created_at);

-- ── Attachments ─────────────────────────────────────────────────────────────
-- Storage references only, never file bytes (platform rule 11).
create table public.orbit2_files (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.orbit2_projects(id) on delete cascade,
  slot        text not null check (slot in ('supplier_quote','invoice','document','image')),
  file_name   text not null,
  storage_ref text not null,
  uploaded_by uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index orbit2_files_project_idx on public.orbit2_files (project_id, slot);

-- ── EHS NOC Record ──────────────────────────────────────────────────────────
create table public.orbit2_noc_records (
  id            uuid primary key default gen_random_uuid(),
  ref_id        text unique,
  client_name   text,
  noc_type      text,
  requested_by  text,
  receipt_date  date,
  permit_date   date,
  noc_document  text,   -- storage reference
  noc_invoice   text,   -- storage reference
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function public.orbit2_assign_noc_ref()
returns trigger language plpgsql as $fn$
begin
  if new.ref_id is null or new.ref_id = '' then
    new.ref_id := 'OPS-NOC-' || to_char(now(), 'YY') || '-' ||
                  lpad(nextval('public.orbit2_noc_seq')::text, 4, '0');
  end if;
  new.updated_at := now();
  return new;
end $fn$;

create trigger orbit2_noc_biu before insert or update on public.orbit2_noc_records
  for each row execute function public.orbit2_assign_noc_ref();

-- ── Managed Boats ───────────────────────────────────────────────────────────
-- The dashboard's Managed Vessels, Active Planned Maintenance and Active Defects
-- & Repairs KPIs are all defined against this module, so it needs a store even
-- though the specification does not draw its screen.
create table public.orbit2_boats (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  client_name text,
  boat_type   text,
  notes       text,
  active      boolean not null default true,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.orbit2_boat_tasks (
  id            uuid primary key default gen_random_uuid(),
  boat_id       uuid not null references public.orbit2_boats(id) on delete cascade,
  kind          text not null check (kind in ('maintenance','defect')),
  title         text not null,
  description   text,
  status        text not null default 'Pending' check (status in ('Pending','Ongoing','Complete')),
  due_date      date,
  schedule_date date,
  schedule_time time,
  assigned_team text[] not null default '{}',
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index orbit2_boat_tasks_boat_idx on public.orbit2_boat_tasks (boat_id);
create index orbit2_boat_tasks_kind_idx on public.orbit2_boat_tasks (kind, status);
create index orbit2_boat_tasks_date_idx on public.orbit2_boat_tasks (schedule_date);

-- ── Team schedule (shifts, offs, leave) ─────────────────────────────────────
create table public.orbit2_team_schedule (
  id         uuid primary key default gen_random_uuid(),
  person     text not null,
  entry_date date not null,
  kind       text not null check (kind in ('shift','off','leave')),
  note       text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (person, entry_date)
);
create index orbit2_team_schedule_date_idx on public.orbit2_team_schedule (entry_date);
