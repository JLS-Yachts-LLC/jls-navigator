-- Anchor → Confidential: documents, templates and signatories that only admins
-- and people given the "Anchor — Confidential" permission can see.
--
-- Enforced in the database, not just hidden on screen:
--   • esign_documents / esign_templates / jls_signatories gain `confidential`;
--     a RESTRICTIVE policy hides confidential rows from everyone else (read and
--     write), on top of the existing staff policies.
--   • esign_events and esign_template_versions follow their document / template.
--     The check goes through SECURITY DEFINER helpers: a plain EXISTS on
--     esign_documents would run under the caller's own RLS, see nothing, and so
--     let the events of a hidden document through.
--   • Confidential files are stored under "confidential/" in the esign-documents
--     and signatures buckets, and that prefix is fenced the same way — otherwise
--     any staff login could list the bucket and open them.
-- The server (service role) is unaffected; it checks access in code where a
-- staff member acts on a document by id.

-- ── Who may see it ───────────────────────────────────────────────────────────
insert into public.modules (name, display_name, active, icon)
select 'anchor_confidential', 'Anchor — Confidential', true, 'lock'
where not exists (select 1 from public.modules where name = 'anchor_confidential');

create or replace function public.can_see_anchor_confidential(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    p_user_id is not null and (
      public.is_polaris_global_admin(p_user_id)
      or public.has_role(p_user_id, 'admin'::app_role)
      or public.has_module_permission(p_user_id, 'anchor_confidential', 'view')
    ), false);
$$;
revoke all on function public.can_see_anchor_confidential(uuid) from public, anon;
grant execute on function public.can_see_anchor_confidential(uuid) to authenticated, service_role;

-- ── The flag ─────────────────────────────────────────────────────────────────
alter table public.esign_documents add column if not exists confidential boolean not null default false;
alter table public.esign_templates add column if not exists confidential boolean not null default false;
alter table public.jls_signatories add column if not exists confidential boolean not null default false;

create or replace function public.esign_document_is_confidential(p_document_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select confidential from public.esign_documents where id = p_document_id), false);
$$;
create or replace function public.esign_template_is_confidential(p_template_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select confidential from public.esign_templates where id = p_template_id), false);
$$;
revoke all on function public.esign_document_is_confidential(uuid) from public, anon;
revoke all on function public.esign_template_is_confidential(uuid) from public, anon;
grant execute on function public.esign_document_is_confidential(uuid) to authenticated, service_role;
grant execute on function public.esign_template_is_confidential(uuid) to authenticated, service_role;

-- ── Row fences ───────────────────────────────────────────────────────────────
drop policy if exists anchor_confidential_fence on public.esign_documents;
create policy anchor_confidential_fence on public.esign_documents as restrictive for all to authenticated
  using (not confidential or public.can_see_anchor_confidential((select auth.uid())))
  with check (not confidential or public.can_see_anchor_confidential((select auth.uid())));

drop policy if exists anchor_confidential_fence on public.esign_templates;
create policy anchor_confidential_fence on public.esign_templates as restrictive for all to authenticated
  using (not confidential or public.can_see_anchor_confidential((select auth.uid())))
  with check (not confidential or public.can_see_anchor_confidential((select auth.uid())));

drop policy if exists anchor_confidential_fence on public.jls_signatories;
create policy anchor_confidential_fence on public.jls_signatories as restrictive for all to authenticated
  using (not confidential or public.can_see_anchor_confidential((select auth.uid())))
  with check (not confidential or public.can_see_anchor_confidential((select auth.uid())));

drop policy if exists anchor_confidential_fence on public.esign_events;
create policy anchor_confidential_fence on public.esign_events as restrictive for all to authenticated
  using (not public.esign_document_is_confidential(document_id) or public.can_see_anchor_confidential((select auth.uid())))
  with check (not public.esign_document_is_confidential(document_id) or public.can_see_anchor_confidential((select auth.uid())));

drop policy if exists anchor_confidential_fence on public.esign_template_versions;
create policy anchor_confidential_fence on public.esign_template_versions as restrictive for all to authenticated
  using (not public.esign_template_is_confidential(template_id) or public.can_see_anchor_confidential((select auth.uid())))
  with check (not public.esign_template_is_confidential(template_id) or public.can_see_anchor_confidential((select auth.uid())));

-- ── File fence ───────────────────────────────────────────────────────────────
drop policy if exists anchor_confidential_files on storage.objects;
create policy anchor_confidential_files on storage.objects as restrictive for all to authenticated
  using (
    not (bucket_id in ('esign-documents', 'signatures') and name like 'confidential/%')
    or public.can_see_anchor_confidential((select auth.uid()))
  )
  with check (
    not (bucket_id in ('esign-documents', 'signatures') and name like 'confidential/%')
    or public.can_see_anchor_confidential((select auth.uid()))
  );
