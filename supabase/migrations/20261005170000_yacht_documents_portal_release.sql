-- Vessel documents are now released to the Client Portal one by one.
-- Until now /api/portal/documents listed every yacht_documents row for the vessel;
-- from here a document reaches the portal only once staff release it from the
-- vessel's Documents card, and the open endpoint refuses an unreleased one too.
-- Default false: nothing new is shared by accident. (0 rows existed when applied.)
alter table public.yacht_documents
  add column if not exists portal_visible boolean not null default false,
  add column if not exists portal_released_at timestamptz,
  add column if not exists portal_released_by uuid;

comment on column public.yacht_documents.portal_visible is
  'Released to the vessel''s Client Portal (read-only: list + open via /api/portal/documents). Staff toggle on the Documents card.';
