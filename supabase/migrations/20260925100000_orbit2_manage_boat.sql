-- Orbit 2 — Managed Boats, built out to the client's "Manage Boat" functional
-- spec. Confirmed before writing this that no equivalent exists elsewhere in
-- Polaris: the older orbit_boats/small_boats tables solve a different problem
-- (JLS's own small-craft go/no-go checklist, and UAE boat registration
-- paperwork) — neither has a jobs board, an inventory list, or per-vessel
-- document/compliance tracking. This is genuinely new.
--
-- Naming note: DMA/FMA/RYA here are vessel *technical inspection* regimes
-- (Last Inspection Date + Technical Inspection Pass Report + a checklist
-- document), a different concept from small_boats.authority ('DMA'/'FTA'),
-- which is which UAE authority a registration was filed with. Same letters,
-- unrelated meaning — kept apart in separate tables so neither leaks into
-- the other's query.

-- ── Vessel spec + compliance fields on the boat itself ─────────────────────
alter table public.orbit2_boats
  add column if not exists hull_number      text,
  add column if not exists hull_material    text,
  add column if not exists year_of_build    integer,
  add column if not exists max_beam_m       numeric,
  add column if not exists max_length_m     numeric,
  add column if not exists max_passengers   integer,
  add column if not exists mmsi             text,
  add column if not exists image_ref        text, -- storage reference
  -- One inheritance source is wired for real: Vessel Overview (`yachts`), the
  -- closest existing match to the spec's vessel spec fields. Recorded so a
  -- boat created from a yacht can be told apart from one entered by hand, and
  -- so the picker can be pre-filtered to yachts not already linked.
  add column if not exists inherited_yacht_id uuid references public.yachts(id),
  -- DMA / FMA / RYA — each a Last Inspection Date + a Technical Inspection
  -- Pass Report upload + a Checklist reference (View Checklist opens whatever
  -- is uploaded against *_checklist_ref, via orbit2_boat_documents).
  add column if not exists dma_last_inspection date,
  add column if not exists dma_report_ref       text,
  add column if not exists fma_last_inspection date,
  add column if not exists fma_report_ref       text,
  add column if not exists rya_last_inspection date,
  add column if not exists rya_report_ref       text;

-- ── Documents ───────────────────────────────────────────────────────────────
-- Every document category the spec lists, plus the two "unrestricted
-- quantity" arrays and the three checklist references above — one table,
-- because they are all "a file against a boat under a category", and a
-- category is text rather than an enum so a new one doesn't need a migration.
create table public.orbit2_boat_documents (
  id          uuid primary key default gen_random_uuid(),
  boat_id     uuid not null references public.orbit2_boats(id) on delete cascade,
  category    text not null check (category in (
                'vessel_invoice', 'builders_certificate', 'customs_clearance',
                'marine_insurance', 'vhf_radio_licensing', 'marine_vessel_license',
                'berth_agreement', 'liferaft_certificate', 'fire_extinguisher_certificate',
                'other', 'dma_checklist', 'fma_checklist', 'rya_checklist'
              )),
  file_name   text not null,
  storage_ref text not null,
  uploaded_by uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index orbit2_boat_documents_boat_idx on public.orbit2_boat_documents (boat_id, category);

-- ── Inventory List ──────────────────────────────────────────────────────────
create table public.orbit2_boat_inventory (
  id           uuid primary key default gen_random_uuid(),
  boat_id      uuid not null references public.orbit2_boats(id) on delete cascade,
  item         text not null,
  qty          numeric,
  unit         text check (unit in ('Box', 'Set', 'Pcs', 'CM', 'KG', 'Meter')),
  condition    text,
  expiry_date  date,
  on_board     boolean not null default true,
  remarks      text,
  image_ref    text, -- storage reference
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index orbit2_boat_inventory_boat_idx on public.orbit2_boat_inventory (boat_id);

create or replace function public.orbit2_touch_boat_inventory()
returns trigger language plpgsql as $fn$
begin
  new.updated_at := now();
  return new;
end $fn$;

create trigger orbit2_boat_inventory_bu before update on public.orbit2_boat_inventory
  for each row execute function public.orbit2_touch_boat_inventory();

-- ── Jobs board ──────────────────────────────────────────────────────────────
-- orbit2_boat_tasks already IS the jobs register (kind = maintenance/defect —
-- the UI labels these "Maintenance"/"Repair", matching the spec's two-option
-- Category dropdown without renaming the column the dashboard's Active
-- Planned Maintenance / Active Defects & Repairs KPIs already read). What the
-- spec adds on top: a sequential Job Number, an estimated-time duration, a
-- Technician free-text field, and a Remarks field distinct from Description
-- (the existing `description` column IS the spec's Description field —
-- unused until now).
create sequence public.orbit2_boat_job_seq as bigint start 1;

alter table public.orbit2_boat_tasks
  add column if not exists job_no      text unique,
  add column if not exists est_minutes integer,
  add column if not exists technician  text,
  add column if not exists remarks     text;

create or replace function public.orbit2_assign_boat_job_no()
returns trigger language plpgsql as $fn$
begin
  if new.job_no is null or new.job_no = '' then
    new.job_no := 'MVT' || to_char(now(), 'YY') || '-' || lpad(nextval('public.orbit2_boat_job_seq')::text, 4, '0');
  end if;
  new.updated_at := now();
  return new;
end $fn$;

create trigger orbit2_boat_tasks_biu before insert or update on public.orbit2_boat_tasks
  for each row execute function public.orbit2_assign_boat_job_no();

-- ── Remarks / Team Comments / attachments — reused, not duplicated ─────────
-- orbit2_notes and orbit2_files already carry exactly this shape for
-- Project/Bunkering records. A job is the same kind of thing (a record that
-- accumulates remarks, field comments, and attachments), so both tables gain
-- an optional second parent instead of a whole parallel schema. Exactly one
-- parent must be set — a note or file belongs to a project record or a boat
-- job, never neither, never both.
alter table public.orbit2_notes
  alter column project_id drop not null,
  add column if not exists boat_task_id uuid references public.orbit2_boat_tasks(id) on delete cascade,
  add constraint orbit2_notes_one_parent check (
    (project_id is not null)::int + (boat_task_id is not null)::int = 1
  );
create index orbit2_notes_boat_task_idx on public.orbit2_notes (boat_task_id, created_at);

alter table public.orbit2_files
  alter column project_id drop not null,
  add column if not exists boat_task_id uuid references public.orbit2_boat_tasks(id) on delete cascade,
  drop constraint orbit2_files_slot_check,
  add constraint orbit2_files_slot_check check (slot in (
    'supplier_quote', 'invoice', 'document', 'image',
    'service_report', 'certificate', 'final_invoice'
  )),
  add constraint orbit2_files_one_parent check (
    (project_id is not null)::int + (boat_task_id is not null)::int = 1
  );
create index orbit2_files_boat_task_idx on public.orbit2_files (boat_task_id, slot);

-- ── RLS — same shape as every other Orbit 2 table ───────────────────────────
alter table public.orbit2_boat_documents enable row level security;
alter table public.orbit2_boat_inventory enable row level security;

do $policies$
declare t text;
begin
  foreach t in array array['orbit2_boat_documents', 'orbit2_boat_inventory'] loop
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
