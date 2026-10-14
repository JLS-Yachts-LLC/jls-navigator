-- Guest sharing, part 3: crew documents (the Documents card on a crew profile).
--
-- New shareable items:
--   crew_all            resource_id = crew_members.id           — all of one crew member's documents
--   crew_folder         resource_id = crew_document_folders.id  — one of their folders
--   crew_document       resource_id = crew_documents.id         — one document
--   crew_passport_file  resource_id = crew_passports.id, resource_part = the file column
--                       (cover_url, document_url, headshot_url, seamans_book_url,
--                        crew_verification_letter_url) — one passport file
--   crew_sp_file        resource_id = crew_members.id, resource_part = SharePoint item id
--                       — one file that only exists in their SharePoint folder
--
-- resource_part names the piece of a row that is shared, for the two kinds of
-- file that are not rows of their own. resource_label is the item's name as it
-- was when shared, so the Shared items list can still name something that has
-- since been renamed or removed (and a SharePoint file, which Polaris holds no
-- row for).
--
-- Crew documents are personal data. The API only lets staff with Crew &
-- Immigration access share them, and the dialog defaults them to a 30-day end.

alter table public.guest_shares add column if not exists resource_part text;
alter table public.guest_shares add column if not exists resource_label text;

alter table public.guest_shares drop constraint if exists guest_shares_resource_type_check;
alter table public.guest_shares add constraint guest_shares_resource_type_check
  check (resource_type in (
    'training_folder', 'training_document',
    'yacht_all', 'yacht_folder', 'yacht_document',
    'crew_all', 'crew_folder', 'crew_document', 'crew_passport_file', 'crew_sp_file'
  ));

-- One live share per item (and part) per guest / per group.
drop index if exists public.guest_shares_live_guest_key;
drop index if exists public.guest_shares_live_group_key;
create unique index guest_shares_live_guest_key
  on public.guest_shares (resource_type, resource_id, coalesce(resource_part, ''), guest_id)
  where revoked_at is null and guest_id is not null;
create unique index guest_shares_live_group_key
  on public.guest_shares (resource_type, resource_id, coalesce(resource_part, ''), group_id)
  where revoked_at is null and group_id is not null;

-- Files a guest uploaded into a shared crew file (a guest may only remove these).
alter table public.crew_documents
  add column if not exists guest_uploaded_by uuid references public.guest_accounts(id) on delete set null;
