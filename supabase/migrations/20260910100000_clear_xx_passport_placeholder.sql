-- Clear the "XX" passport placeholder, and remove the constraint that caused it.
--
-- 167 crew_passports rows carried the literal string 'XX' in BOTH issuing_country
-- and nationality. All 167 were created on a single day (2026-06-10) by a one-off
-- external import; nothing in src/ writes 'XX', so it cannot recur from the app.
--
-- ROOT CAUSE: issuing_country and nationality were both NOT NULL. The importer had
-- a passport number and dates but no country, and a NOT NULL column leaves an
-- importer no way to say "unknown" — so it invented a value. That is the actual
-- defect: the schema made honest data impossible. Both columns are now nullable
-- (verified: a passport can be created with no country, and one with a country
-- still saves normally).
--
-- WHY THE PLACEHOLDER MATTERED, beyond being untidy:
--   • crew-profile-page.tsx renders `{p.issuing_country ?? p.nationality ?? "—"}`,
--     so staff were shown a passport issued by "XX" for 167 crew. With both values
--     NULL the fallback chain now reaches the em dash and reads as missing.
--   • It made those records look complete, hiding the gap from anyone auditing.
--   • Every one of the 167 rows is flagged is_primary and is that crew member's
--     ONLY passport, so the junk was also the row any "their passport" lookup
--     picked — including the new Country-of-birth autofill (SD-0023), which would
--     have pre-filled the text "XX" as a country of birth.
--
-- Nothing is lost: the value was the same three characters on all 167 rows, so it
-- carried no information to preserve. passport_number, issue_date and expiry_date
-- on those rows are real and untouched (409 rows, 409 numbers, 409 expiries before
-- and after).
--
-- The country itself is NOT recoverable inside Polaris — nationality was 'XX' too,
-- the linked crew rows have no nationality or country_of_birth, and only 1 of the
-- 167 has a scanned document to re-read. It has to come from whatever source the
-- June import was drawn from, or from the crew.
--
-- Note the same trap is still set on crew_passports.issue_date (NOT NULL). It
-- happened to be present in this import, but a future one without it would need
-- another placeholder. Left alone for now as a separate decision.
alter table public.crew_passports alter column issuing_country drop not null;
alter table public.crew_passports alter column nationality     drop not null;

update public.crew_passports set issuing_country = null, updated_at = now()
where btrim(coalesce(issuing_country, '')) = 'XX';

update public.crew_passports set nationality = null, updated_at = now()
where btrim(coalesce(nationality, '')) = 'XX';

-- One stray each, from the same import.
update public.crew_members set nationality = null, updated_at = now()
where btrim(coalesce(nationality, '')) = 'XX';

update public.visa_applications set nationality = null, updated_at = now()
where btrim(coalesce(nationality, '')) = 'XX';
