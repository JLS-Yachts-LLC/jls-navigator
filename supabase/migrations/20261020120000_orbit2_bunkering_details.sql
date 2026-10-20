-- Orbit 2 — Bunkering Request, Method 1 (admin-initiated), Phase 1.
--
-- The bunkering record grows from "a project with a fuel grade" into the full
-- request the spec describes:
--   * the vessel it is for, picked from the Vessels module, with IMO / Flag /
--     Official No. / LOA / Draft copied onto the record as they were at the
--     time of the request (the request is a document sent to the client — it
--     must not change under them when the vessel profile is edited later)
--   * delivery port, camlock, hose and manifold position
--   * the fuel details the client confirms on the returned form
--   * the supplier's contact details and the bunker timeline
--   * Additional Jobs — ad-hoc jobs done alongside the bunkering
--   * named documents and the client's filled-in form
--
-- Additive only: no column is dropped or renamed, so the Project List, the
-- field app and the calendar keep reading what they read today.

alter table public.orbit2_projects
  -- Vessel. yacht_id is optional: a client that is not (yet) in Vessels can
  -- still be logged by name, exactly as before.
  add column if not exists yacht_id     uuid references public.yachts(id) on delete set null,
  add column if not exists imo_no       text,
  add column if not exists flag         text,
  add column if not exists official_no  text,
  add column if not exists loa_m        numeric,
  add column if not exists draught_m    numeric,
  add column if not exists berth_no     text,

  -- Delivery. delivery_port is one of the listed ports or 'Others', in which
  -- case delivery_port_other says where.
  add column if not exists delivery_port       text,
  add column if not exists delivery_port_other text,
  add column if not exists camlock_type        text,
  add column if not exists camlock_size_in     numeric,
  add column if not exists hose_length_m       numeric,
  add column if not exists manifold_position   text,

  -- From the client's returned form (or typed in).
  add column if not exists max_sulphur   text,
  add column if not exists specification text,
  add column if not exists description   text,

  -- Internal only. Orbit 2 records are never readable by portal captains
  -- (portal_captain_block), and the client portal must not pass this through.
  add column if not exists admin_remarks text,

  -- Supplier contact and the bunker timeline.
  add column if not exists supplier_contact_person text,
  add column if not exists supplier_contact_number text,
  add column if not exists supplier_email          text,
  add column if not exists supplier_arrival_date   date,
  add column if not exists supplier_arrival_time   time,
  add column if not exists bunker_commence_date    date,
  add column if not exists bunker_commence_time    time,
  add column if not exists bunker_complete_date    date,
  add column if not exists bunker_complete_time    time;

alter table public.orbit2_projects
  drop constraint if exists orbit2_projects_camlock_type_check,
  add constraint orbit2_projects_camlock_type_check
    check (camlock_type is null or camlock_type in ('Adaptor (Male)','Coupler (Female)')),
  drop constraint if exists orbit2_projects_manifold_position_check,
  add constraint orbit2_projects_manifold_position_check
    check (manifold_position is null or manifold_position in ('FWD','MID','AFT'));

create index if not exists orbit2_projects_yacht_idx on public.orbit2_projects (yacht_id);

-- Units are now the spec's L / IG / M³ (stored as L, IG, M3). Every existing
-- bunkering record is in CBM or litres, which map one-to-one.
update public.orbit2_projects set quantity_unit = 'M3' where quantity_unit = 'CBM';
update public.orbit2_projects set quantity_unit = 'L'  where quantity_unit = 'LTR';

-- ── Named documents, and the client's filled-in form ────────────────────────
-- "+ Add document" asks for a name before the file; file_name stays the
-- original file name so the download is still recognisable.
alter table public.orbit2_files add column if not exists doc_name text;

alter table public.orbit2_files
  drop constraint orbit2_files_slot_check,
  add constraint orbit2_files_slot_check check (slot in (
    'supplier_quote','invoice','document','image',
    'service_report','certificate','final_invoice',
    'filled_form'));

-- ── Additional Jobs ─────────────────────────────────────────────────────────
-- Ad-hoc jobs running alongside the bunkering. Everything here stays editable,
-- per spec, so this is a plain table rather than an append-only log.
create table if not exists public.orbit2_bunker_jobs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.orbit2_projects(id) on delete cascade,
  job_date    date,
  description text,
  requestor   text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists orbit2_bunker_jobs_project_idx on public.orbit2_bunker_jobs (project_id, job_date);

create or replace function public.orbit2_bunker_jobs_touch()
returns trigger language plpgsql set search_path = public as $fn$
begin
  new.updated_at := now();
  return new;
end $fn$;

drop trigger if exists orbit2_bunker_jobs_bu on public.orbit2_bunker_jobs;
create trigger orbit2_bunker_jobs_bu before update on public.orbit2_bunker_jobs
  for each row execute function public.orbit2_bunker_jobs_touch();

-- Same access as the rest of Orbit 2: staff read and write, portal captains never.
alter table public.orbit2_bunker_jobs enable row level security;

drop policy if exists authenticated_all on public.orbit2_bunker_jobs;
create policy authenticated_all on public.orbit2_bunker_jobs for all
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists portal_captain_block on public.orbit2_bunker_jobs;
create policy portal_captain_block on public.orbit2_bunker_jobs as restrictive for all
  using ((select not public.is_portal_captain()))
  with check ((select not public.is_portal_captain()));
