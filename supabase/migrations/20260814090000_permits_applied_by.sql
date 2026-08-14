-- Permits: "Applied By" gets its own column.
--
-- Reported by Port Operations (Aug 2026): you type a name into "Applied By" on a
-- DMA permit, save, and a permit number appears instead.
--
-- Cause: no applied_by column existed, so four dialogs (DMA, Cruising Mothership,
-- Cruising Tenders, Navigation License) wrote the name into permit_number — the
-- column that holds the actual permit number. Two consequences:
--   • permit_number is the natural key the SharePoint permits sync matches on
--     (TARGET_KEY_FIELDS.permits), so the real permit number coming back from
--     SharePoint overwrote the typed name — exactly the reported symptom;
--   • a person's name in the key column can match the wrong permit row.
--
-- Existing rows are left untouched: a name already sitting in permit_number is
-- indistinguishable from a permit number by inspection, so no guessing here.
-- Backfill (if wanted) is a separate reviewed step.

alter table public.permits
  add column if not exists applied_by text;

comment on column public.permits.applied_by is
  'Who applied for the permit (person/agent name). Distinct from permit_number, which is the authority''s reference and is the SharePoint sync match key.';
