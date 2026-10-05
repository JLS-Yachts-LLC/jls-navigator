-- Client Portal — files the crew attach to their own records (photos on a
-- checklist item, a drill's record sheet, a defect photo…).
--
-- One row per file, pointing at the record it belongs to (ref_table + ref_id,
-- and for a checklist the item within it). Stored privately in permit-documents
-- under portal/<yacht_id>/…, uploaded through /api/portal/upload (type, size and
-- contents checked) and opened through /api/portal/documents/open, which checks
-- the vessel, signs a short-lived link and records the open.
--
-- Same isolation as the portal's other tables: staff manage everything; a portal
-- login reads its own vessel's rows from an MFA-verified session and never
-- writes directly.

create table if not exists public.portal_files (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  ref_table text not null check (ref_table in ('onboard_checklist_runs', 'ism_drills', 'pms_tasks', 'onboard_handover_notes')),
  ref_id uuid not null,
  item_key text,
  storage_ref text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists portal_files_ref_idx on public.portal_files (ref_table, ref_id);
create index if not exists portal_files_yacht_idx on public.portal_files (yacht_id, created_at desc);

alter table public.portal_files enable row level security;
drop policy if exists staff_manage on public.portal_files;
create policy staff_manage on public.portal_files for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists captain_select on public.portal_files;
create policy captain_select on public.portal_files for select to authenticated
  using (public.is_portal_captain() and public.portal_aal2() and yacht_id in (select public.captain_yacht_ids()));
drop policy if exists portal_captain_block_insert on public.portal_files;
create policy portal_captain_block_insert on public.portal_files as restrictive for insert to authenticated
  with check (not public.is_portal_captain());
drop policy if exists portal_captain_block_update on public.portal_files;
create policy portal_captain_block_update on public.portal_files as restrictive for update to authenticated
  using (not public.is_portal_captain());
drop policy if exists portal_captain_block_delete on public.portal_files;
create policy portal_captain_block_delete on public.portal_files as restrictive for delete to authenticated
  using (not public.is_portal_captain());
