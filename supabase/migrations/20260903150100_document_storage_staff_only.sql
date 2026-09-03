-- Narrow the document buckets from "any signed-in user" to "staff".
--
-- Portal logins are ordinary Supabase `authenticated` users, so the previous
-- policies let a captain sign — and upload, overwrite or delete — ANY object in
-- permit-documents or esign-documents, not just their own vessel's. Storage paths
-- are grouped by document type rather than by vessel, so no path-scoped policy can
-- express "this captain's documents"; instead the portal reads documents through
-- /api/portal/documents, which checks ownership against the owning row and signs
-- with the service role. That leaves these buckets needing staff access only.
--
-- Staff are identified by having a `user_profiles` row; captains never do.
--
-- The SELECT halves are already applied. The write halves below were refused by
-- the tooling and still need running.

-- ── Already applied ──────────────────────────────────────────────────────────
-- drop policy if exists "permit docs authenticated read" on storage.objects;
-- create policy "permit docs staff read" on storage.objects for select to authenticated
--   using (bucket_id = 'permit-documents'
--          and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));
-- drop policy if exists "esign authenticated read" on storage.objects;
-- create policy "esign staff read" on storage.objects for select to authenticated
--   using (bucket_id = 'esign-documents'
--          and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

-- ── Still to apply ───────────────────────────────────────────────────────────
drop policy if exists "Authenticated users can upload permit documents" on storage.objects;
create policy "permit docs staff write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'permit-documents'
              and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

drop policy if exists "Authenticated users can update permit documents" on storage.objects;
create policy "permit docs staff update"
  on storage.objects for update to authenticated
  using (bucket_id = 'permit-documents'
         and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()))
  with check (bucket_id = 'permit-documents'
              and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

drop policy if exists "Authenticated users can delete permit documents" on storage.objects;
create policy "permit docs staff delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'permit-documents'
         and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

drop policy if exists "esign auth write" on storage.objects;
create policy "esign staff write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'esign-documents'
              and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

drop policy if exists "esign auth update" on storage.objects;
create policy "esign staff update"
  on storage.objects for update to authenticated
  using (bucket_id = 'esign-documents'
         and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()))
  with check (bucket_id = 'esign-documents'
              and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

drop policy if exists "esign auth delete" on storage.objects;
create policy "esign staff delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'esign-documents'
         and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));
