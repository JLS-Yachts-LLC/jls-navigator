-- Guest sharing, part 2: vessel documents (the Documents card on a yacht).
--
-- New shareable items:
--   yacht_all       resource_id = yachts.id                 — every document of one vessel
--   yacht_folder    resource_id = yacht_document_folders.id — one of its folders
--   yacht_document  resource_id = yacht_documents.id        — one document
--
-- A vessel or folder share also shows the guest the vessel's SharePoint-only files
-- (served live, read-only, with the "Crew Documents" folder excluded exactly as the
-- staff card excludes it). A single SharePoint-only file is imported into Polaris
-- before it is shared, so a one-document share is always a yacht_documents row.

alter table public.guest_shares drop constraint if exists guest_shares_resource_type_check;
alter table public.guest_shares add constraint guest_shares_resource_type_check
  check (resource_type in ('training_folder', 'training_document', 'yacht_all', 'yacht_folder', 'yacht_document'));

-- Files a guest uploaded into a shared vessel (a guest may only remove these).
alter table public.yacht_documents
  add column if not exists guest_uploaded_by uuid references public.guest_accounts(id) on delete set null;
