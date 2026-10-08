-- SD-0048 — compare crew dates of birth with SharePoint, read with the fixed date reader.
--
-- Until 15 Sept 2026 every date synced from SharePoint landed one day early
-- (SD-0017). The 15 Sept clean-up corrected crew to their PASSPORT record, so
-- ~170 crew imported from the Visa list without a passport on file were never
-- corrected. The daily check (checkCrewDobsAgainstSharePoint) re-reads the Visa
-- list, rounds each DOB correctly, and records where Polaris disagrees. It changes
-- nothing in either system: corrections are applied separately, after review,
-- with a backup.

create table if not exists public.crew_dob_sp_check (
  crew_id          uuid primary key references public.crew_members(id) on delete cascade,
  full_name        text,
  sp_item_id       text,
  polaris_dob      date,
  sharepoint_dob   date,
  sharepoint_raw   text,
  day_gap          integer,   -- sharepoint_dob - polaris_dob
  passport_dob     date,
  checked_at       timestamptz not null default now()
);

create table if not exists public.crew_dob_sp_check_runs (
  id               uuid primary key default gen_random_uuid(),
  run_at           timestamptz not null default now(),
  sp_items         integer not null default 0,
  compared         integer not null default 0,
  differences      integer not null default 0,
  error            text
);

alter table public.crew_dob_sp_check enable row level security;
alter table public.crew_dob_sp_check_runs enable row level security;
drop policy if exists staff_read on public.crew_dob_sp_check;
create policy staff_read on public.crew_dob_sp_check for select to authenticated using (not public.is_portal_captain());
drop policy if exists staff_read on public.crew_dob_sp_check_runs;
create policy staff_read on public.crew_dob_sp_check_runs for select to authenticated using (not public.is_portal_captain());
-- Written only by the scheduled job (service role).
