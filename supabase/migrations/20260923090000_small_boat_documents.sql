-- Real files behind the small boat document checklist.
--
-- Registration already tracked eighteen required documents, but only as yes/no
-- ticks on small_boats (doc_emirates_id, doc_insurance_policy, …). The "6/18"
-- on the list was therefore a claim rather than evidence: someone ticked a box,
-- and the file itself lived in SharePoint behind a pasted link, or in an inbox.
--
-- This table puts the file where the record is. Each row is one uploaded file
-- belonging to one boat, optionally answering one of the eighteen checklist
-- items via doc_key; a null doc_key is a supporting file that belongs to the
-- boat but not to any specific requirement.
--
-- doc_key is deliberately NOT a foreign key or enum — the checklist lives in
-- the app (DOC_FIELDS in small-boat-registration-page.tsx) and changes with DMA
-- requirements, and a file should survive the checklist being re-cut. Unknown
-- keys simply group under "Other" instead of blocking the upload.

create table if not exists public.small_boat_documents (
  id          uuid primary key default gen_random_uuid(),
  boat_id     uuid not null references public.small_boats(id) on delete cascade,
  doc_key     text,
  title       text,
  file_url    text not null,
  file_name   text,
  file_size   bigint,
  mime_type   text,
  uploaded_by uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table  public.small_boat_documents          is 'Files attached to a small boat registration record; doc_key ties one to a checklist requirement.';
comment on column public.small_boat_documents.doc_key  is 'A DOC_FIELDS key such as doc_insurance_policy, or null for a supporting file with no specific requirement.';
comment on column public.small_boat_documents.title    is 'Display name. Renaming a document changes this and leaves the stored object untouched.';
comment on column public.small_boat_documents.file_url is 'Storage reference including the bucket, e.g. permit-documents/small-boats/<boat>/<key>-<name>.pdf';

-- The two reads this table gets: everything for one boat, and the per-checklist
-- grouping inside that. One index serves both.
create index if not exists small_boat_documents_boat_idx
  on public.small_boat_documents (boat_id, doc_key);

alter table public.small_boat_documents enable row level security;

-- Same shape as training_documents: staff may manage them, portal captains
-- never see them.
drop policy if exists authenticated_all on public.small_boat_documents;
create policy authenticated_all on public.small_boat_documents
  for all
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists portal_captain_block on public.small_boat_documents;
create policy portal_captain_block on public.small_boat_documents
  for all
  using ((select not is_portal_captain()))
  with check ((select not is_portal_captain()));

-- Keep updated_at honest: renames and moves are both plain UPDATEs.
create or replace function public.touch_small_boat_documents()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_small_boat_documents on public.small_boat_documents;
create trigger trg_touch_small_boat_documents
  before update on public.small_boat_documents
  for each row execute function public.touch_small_boat_documents();
