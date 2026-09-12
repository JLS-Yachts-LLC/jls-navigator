-- Remove two test crew records.
--
-- Both surfaced from the SD-0017 date-of-birth work: after correcting 169 dates to
-- the passport, a sanity sweep for implausible ages found two records that were
-- not part of that correction and had never been real —
--   "Hilary Test / Hilary Test", date of birth 2024-07-16 (a two-year-old)
--   "Tighe Fetton", date of birth 2011-11-13, rank deckhand (a fourteen-year-old)
-- Matt confirmed both are test entries (2026-09-12).
--
-- Checked before deleting rather than after. crew_members is referenced by 15
-- foreign keys, four of which would have BLOCKED the delete (compliance_alerts,
-- seaport_arrivals, seaport_departures, visa_expiry_flags) and seven of which
-- CASCADE (visa_applications, crew_passports, crew_documents, crew_signon_events,
-- crew_timeline_events, crew_document_folders/placements/sharepoint_links). Every
-- one of those tables held ZERO rows for these two ids, so nothing real was
-- attached and nothing was cascaded away.
--
-- The full rows are kept in crew_test_records_removed_20260912 (a copy of the
-- crew_members shape) in case either turns out to be wanted:
--     insert into public.crew_members
--     select * from public.crew_test_records_removed_20260912 where id = '…';
--
-- After: 531 → 529 crew, no remaining record under 16, newest date of birth
-- 2007-05-15. A sweep for other test-looking names (test/dummy/sample/xxx/asdf in
-- either name field) found none.
create table if not exists public.crew_test_records_removed_20260912 as
select * from public.crew_members where false;

insert into public.crew_test_records_removed_20260912
select * from public.crew_members
where id in ('ea2b8fd4-cd83-4bb7-8a04-17a5c3da0f91',   -- Hilary Test
             '419220f0-1511-451e-9c8b-05c9d6c3ccb6');  -- Tighe Fetton

delete from public.crew_members
where id in ('ea2b8fd4-cd83-4bb7-8a04-17a5c3da0f91',
             '419220f0-1511-451e-9c8b-05c9d6c3ccb6');

-- Staff-read only, and fenced against portal captains, like the other backups.
alter table public.crew_test_records_removed_20260912 enable row level security;

drop policy if exists staff_read on public.crew_test_records_removed_20260912;
create policy staff_read on public.crew_test_records_removed_20260912 for select to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

drop policy if exists portal_captain_denied on public.crew_test_records_removed_20260912;
create policy portal_captain_denied on public.crew_test_records_removed_20260912
  as restrictive for all to authenticated
  using ((select not public.is_portal_captain()))
  with check ((select not public.is_portal_captain()));
