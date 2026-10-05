-- Client Portal — log a boat owner's document opens the same way as a captain's.
--
-- portal_document_access records every attempt to open a document through the
-- portal (allowed, denied, not found). It was keyed to a yacht; boat owners open
-- documents of an Orbit 2 Managed Boat, so a row now names a yacht OR a boat.
alter table public.portal_document_access alter column yacht_id drop not null;
alter table public.portal_document_access
  add column if not exists boat_id uuid references public.orbit2_boats(id) on delete cascade;
alter table public.portal_document_access drop constraint if exists portal_document_access_one_vessel;
alter table public.portal_document_access
  add constraint portal_document_access_one_vessel check (num_nonnulls(yacht_id, boat_id) = 1);
create index if not exists portal_document_access_boat_idx on public.portal_document_access (boat_id, accessed_at desc) where boat_id is not null;
