-- Re-correct crew dates of birth to the passport record. SD-0017, second pass.
--
-- The 12 Sept correction (20260912090000) was undone within hours by the
-- SharePoint two-way sync: the 25 Aug date fix in sharepoint-sync.server.ts had
-- its regexes written without backslashes (d{4} instead of \d{4}), so it never
-- matched a real timestamp. The corrected dates were pushed to SharePoint as bare
-- dates, read back as 20:00Z the day before, and sliced to the day before. By 15
-- Sept 161 of the 169 corrected crew sat exactly one day before their passport.
--
-- The regexes are fixed in the same deploy this migration ships with, so this
-- time the push goes out as local noon and the pull rounds to the right day.
--
-- Same rule as before, approved by Astrid: the passport record wins. Old values
-- are kept in crew_dob_correction_backup_20260915 for per-crew reversal.
create table if not exists public.crew_dob_correction_backup_20260915 (
  crew_id            uuid primary key,
  first_name         text,
  last_name          text,
  old_date_of_birth  date,
  new_date_of_birth  date,
  day_difference     integer,
  corrected_at       timestamptz not null default now()
);

insert into public.crew_dob_correction_backup_20260915
  (crew_id, first_name, last_name, old_date_of_birth, new_date_of_birth, day_difference)
select c.id, c.first_name, c.last_name, c.date_of_birth, p.date_of_birth,
       (c.date_of_birth - p.date_of_birth)
from public.crew_members c
join public.crew_passports p on p.crew_id = c.id
where c.date_of_birth is not null and p.date_of_birth is not null
  and c.date_of_birth <> p.date_of_birth
on conflict (crew_id) do nothing;

update public.crew_members c
set date_of_birth = b.new_date_of_birth, updated_at = now()
from public.crew_dob_correction_backup_20260915 b
where c.id = b.crew_id and c.date_of_birth = b.old_date_of_birth;

alter table public.crew_dob_correction_backup_20260915 enable row level security;

drop policy if exists staff_read on public.crew_dob_correction_backup_20260915;
create policy staff_read on public.crew_dob_correction_backup_20260915 for select to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

drop policy if exists portal_captain_denied on public.crew_dob_correction_backup_20260915;
create policy portal_captain_denied on public.crew_dob_correction_backup_20260915
  as restrictive for all to authenticated
  using ((select not public.is_portal_captain()))
  with check ((select not public.is_portal_captain()));
