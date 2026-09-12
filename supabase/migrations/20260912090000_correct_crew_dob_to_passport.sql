-- Correct crew dates of birth to the passport record. SD-0017.
--
-- Astrid reported dates of birth landing "1 day before the actual DOB". Two
-- separate faults were behind it, both in the Excel tracker import and both fixed
-- in code first (see the parseSheetDate rewrite in excel-sync.server.ts):
--   • "12-May-1990" → 1990-05-11, a day early — built at local midnight, then
--     shifted back across UTC by toISOString().
--   • "12/05/1990"  → 1990-12-05, day and month SWAPPED — a slashed date read as
--     American MM/DD. Only misfires when the day is ≤ 12, which is exactly why it
--     looked intermittent when she spot-checked.
--
-- That left the records already stored. Of 239 crew holding a date of birth in
-- both crew_members and crew_passports, only 71 agreed. Astrid approved
-- correcting the crew record to the passport (2026-09-12): "Yes, please go ahead",
-- and for the ones out by more than a day, "Best to correct them to the passport."
--
-- All 169 mismatches are corrected. Every one has a passport document on file.
--
-- A note on how they were split, because the first pass got it wrong: 145 had
-- `ocr_raw` retained and 24 did not, and that was initially read as "24 have no
-- scan behind them". It is not — `ocr_raw is null` only means the raw OCR output
-- was not KEPT. All 24 have document_url set, so a scan exists for every record
-- corrected here.
--
-- The direction is one-sided and worth recording: 168 of the 169 had the crew
-- record EARLIER than the passport, mean shift -1.74 days, none more than 10 days
-- out. A systematic import fault, not scattered typing errors.
--
-- Old values are kept in crew_dob_correction_backup_20260912 (crew_id, names, old
-- and new date, whether a scan is on file, and the day difference) so any of this
-- can be reversed per crew member:
--     update public.crew_members c set date_of_birth = b.old_date_of_birth
--     from public.crew_dob_correction_backup_20260912 b where b.crew_id = c.id;
--
-- Sanity-checked afterwards: no future dates, nobody moved under 16, nothing
-- shifted by more than 10 days. Two pre-existing implausible dates were found and
-- deliberately NOT touched — a "Hilary Test" record (DOB 2024) and Tighe Fetton
-- (DOB 2011, rank deckhand); neither was altered by this correction.
create table if not exists public.crew_dob_correction_backup_20260912 (
  crew_id            uuid primary key,
  first_name         text,
  last_name          text,
  old_date_of_birth  date,
  new_date_of_birth  date,
  passport_from_scan boolean,
  day_difference     integer,
  corrected_at       timestamptz not null default now()
);

insert into public.crew_dob_correction_backup_20260912
  (crew_id, first_name, last_name, old_date_of_birth, new_date_of_birth, passport_from_scan, day_difference)
select c.id, c.first_name, c.last_name, c.date_of_birth, p.date_of_birth,
       p.document_url is not null, (c.date_of_birth - p.date_of_birth)
from public.crew_members c
join public.crew_passports p on p.crew_id = c.id
where c.date_of_birth is not null and p.date_of_birth is not null
  and c.date_of_birth <> p.date_of_birth
on conflict (crew_id) do nothing;

update public.crew_members c
set date_of_birth = b.new_date_of_birth, updated_at = now()
from public.crew_dob_correction_backup_20260912 b
where c.id = b.crew_id and c.date_of_birth = b.old_date_of_birth;

-- Staff-read only, like the other correction backups on this project.
alter table public.crew_dob_correction_backup_20260912 enable row level security;

drop policy if exists staff_read on public.crew_dob_correction_backup_20260912;
create policy staff_read on public.crew_dob_correction_backup_20260912 for select to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

drop policy if exists portal_captain_denied on public.crew_dob_correction_backup_20260912;
create policy portal_captain_denied on public.crew_dob_correction_backup_20260912
  as restrictive for all to authenticated
  using ((select not public.is_portal_captain()))
  with check ((select not public.is_portal_captain()));
