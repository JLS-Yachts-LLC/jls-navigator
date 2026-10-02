-- Training Institute — files attached to a training record or a student.
--
-- The Institute asked for two things that are the same thing: documents against
-- a training record on the Records tab, and upload / rename / move / delete on a
-- student's own record on the Students tab. One table serves both, keyed by what
-- the file hangs off, so the browser, the rename and the delete are written once.
--
-- Not folded into training_documents: that table is the yacht-scoped folder tree
-- behind the Documents browser, where a file's place in a hierarchy is the point.
-- Here a file belongs to a person or a course record and to nothing else.
--
-- "Move" means reassigning a file from one owner to another — the mis-filed
-- certificate that belongs on a different student — so owner_id is a plain
-- column to update, not a foreign key that would pin it to one table.
create table if not exists public.training_attachments (
  id          uuid primary key default gen_random_uuid(),
  owner_type  text not null check (owner_type in ('record','student')),
  owner_id    uuid not null,
  -- The display name. Renaming changes this and leaves the stored object alone:
  -- the file in Storage keeps the path it was written to, so a rename can never
  -- break an existing link.
  file_name   text not null,
  storage_ref text not null,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists training_attachments_owner_idx
  on public.training_attachments (owner_type, owner_id, created_at);

alter table public.training_attachments enable row level security;

-- Same shape as training_records and training_documents: any signed-in staff
-- member, never a client-portal captain.
drop policy if exists authenticated_all on public.training_attachments;
create policy authenticated_all on public.training_attachments for all to authenticated
  using ((select auth.role()) = 'authenticated') with check ((select auth.role()) = 'authenticated');

drop policy if exists portal_captain_block on public.training_attachments;
create policy portal_captain_block on public.training_attachments as restrictive for all to authenticated
  using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
