-- Training documents: files and folders on the Training screen.
--
-- The screen used to offer only "Add Certification", a form asking for crew
-- member, certificate name, type, issuing body, issue and expiry dates. That is
-- the right shape for a certification REGISTER (which still lives on the full
-- Training page), but the wrong shape for what the team actually needed here:
-- somewhere to put a document, and folders to organise them into.
--
-- Deliberately minimal. A document is a file with a name. A folder has a name and
-- an optional parent. No expiry, no crew link, no type — none of it was wanted,
-- and every field asked for is a field someone has to fill in.
--
-- Vessel scope follows the picker already on the screen rather than adding a
-- field: whatever vessel is selected when the document or folder is created is
-- what it belongs to, and "All vessels" (null) means everyone sees it. A vessel
-- view shows its own items plus the shared ones.
create table if not exists public.training_document_folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- Nested folders. ON DELETE CASCADE so removing a folder removes what is
  -- inside it rather than leaving orphans pointing at nothing.
  parent_id  uuid references public.training_document_folders(id) on delete cascade,
  -- null = visible under every vessel.
  yacht_id   uuid references public.yachts(id) on delete cascade,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.training_documents (
  id         uuid primary key default gen_random_uuid(),
  -- null = sitting at the top level rather than inside a folder.
  folder_id  uuid references public.training_document_folders(id) on delete cascade,
  yacht_id   uuid references public.yachts(id) on delete cascade,
  title      text,
  -- Storage reference (bucket/path) in permit-documents — read through a signed
  -- URL, never public. Same convention as crew_documents.file_url.
  file_url   text not null,
  file_name  text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists training_document_folders_parent_idx on public.training_document_folders (parent_id);
create index if not exists training_document_folders_yacht_idx  on public.training_document_folders (yacht_id);
create index if not exists training_documents_folder_idx        on public.training_documents (folder_id);
create index if not exists training_documents_yacht_idx         on public.training_documents (yacht_id);

alter table public.training_document_folders enable row level security;
alter table public.training_documents        enable row level security;

-- Same access shape as training_certifications: any signed-in staff member, and
-- never a client-portal captain.
drop policy if exists authenticated_all on public.training_document_folders;
create policy authenticated_all on public.training_document_folders for all to authenticated
  using ((select auth.role()) = 'authenticated') with check ((select auth.role()) = 'authenticated');
drop policy if exists portal_captain_block on public.training_document_folders;
create policy portal_captain_block on public.training_document_folders as restrictive for all to authenticated
  using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));

drop policy if exists authenticated_all on public.training_documents;
create policy authenticated_all on public.training_documents for all to authenticated
  using ((select auth.role()) = 'authenticated') with check ((select auth.role()) = 'authenticated');
drop policy if exists portal_captain_block on public.training_documents;
create policy portal_captain_block on public.training_documents as restrictive for all to authenticated
  using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
