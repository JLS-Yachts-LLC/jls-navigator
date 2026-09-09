-- Close the last gaps in storage access.
--
-- Every sensitive bucket was already private, but four of them still had policies
-- that admitted ANY signed-in user — which now includes client-portal captains.
-- None of these buckets are read by src/components/portal/ (the portal signs its
-- own URLs server-side after an ownership check), so they are all staff-only.
-- "Staff" = has a public.user_profiles row; portal captains never do.
--
-- ShipSync is the exception: delivery drivers legitimately upload PODs, so it is
-- staff OR an active shipsync_drivers row. No driver-only login exists today
-- (all 5 drivers with a user_id are staff) but the rule is in place for when one does.

-- crew-docs (crew placement)
drop policy if exists "crew-docs staff read"   on storage.objects;
drop policy if exists "crew-docs staff insert" on storage.objects;
drop policy if exists "crew-docs staff update" on storage.objects;
drop policy if exists "crew-docs staff delete" on storage.objects;

create policy "crew-docs staff read" on storage.objects for select to authenticated
  using (bucket_id = 'crew-docs' and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));
create policy "crew-docs staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'crew-docs' and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));
create policy "crew-docs staff update" on storage.objects for update to authenticated
  using (bucket_id = 'crew-docs' and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()))
  with check (bucket_id = 'crew-docs' and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));
create policy "crew-docs staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'crew-docs' and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

-- orbit-documents (ORBIT operations)
drop policy if exists "orbit_documents_staff_read"   on storage.objects;
drop policy if exists "orbit_documents_staff_write"  on storage.objects;
drop policy if exists "orbit_documents_staff_update" on storage.objects;

create policy "orbit_documents_staff_read" on storage.objects for select to authenticated
  using (bucket_id = 'orbit-documents' and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));
create policy "orbit_documents_staff_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'orbit-documents' and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));
create policy "orbit_documents_staff_update" on storage.objects for update to authenticated
  using (bucket_id = 'orbit-documents' and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()))
  with check (bucket_id = 'orbit-documents' and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

-- signatures (e-Sign + Anchor drawn signatures)
drop policy if exists "signatures staff read"   on storage.objects;
drop policy if exists "signatures staff insert" on storage.objects;
drop policy if exists "signatures staff update" on storage.objects;
drop policy if exists "signatures staff delete" on storage.objects;

create policy "signatures staff read" on storage.objects for select to authenticated
  using (bucket_id = 'signatures' and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));
create policy "signatures staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'signatures' and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));
create policy "signatures staff update" on storage.objects for update to authenticated
  using (bucket_id = 'signatures' and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()))
  with check (bucket_id = 'signatures' and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));
create policy "signatures staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'signatures' and exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

-- shipsync — staff or an active driver, on all four verbs
drop policy if exists "shipsync_obj_read"   on storage.objects;
drop policy if exists "shipsync_obj_write"  on storage.objects;
drop policy if exists "shipsync_obj_update" on storage.objects;
drop policy if exists "shipsync_obj_delete" on storage.objects;

create policy "shipsync_obj_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'shipsync' and (
      exists (select 1 from public.user_profiles up where up.user_id = auth.uid())
      or exists (select 1 from public.shipsync_drivers d where d.user_id = auth.uid() and d.active)
    )
  );
create policy "shipsync_obj_write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'shipsync' and (
      exists (select 1 from public.user_profiles up where up.user_id = auth.uid())
      or exists (select 1 from public.shipsync_drivers d where d.user_id = auth.uid() and d.active)
    )
  );
create policy "shipsync_obj_update" on storage.objects for update to authenticated
  using (
    bucket_id = 'shipsync' and (
      exists (select 1 from public.user_profiles up where up.user_id = auth.uid())
      or exists (select 1 from public.shipsync_drivers d where d.user_id = auth.uid() and d.active)
    )
  )
  with check (
    bucket_id = 'shipsync' and (
      exists (select 1 from public.user_profiles up where up.user_id = auth.uid())
      or exists (select 1 from public.shipsync_drivers d where d.user_id = auth.uid() and d.active)
    )
  );
create policy "shipsync_obj_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'shipsync' and (
      exists (select 1 from public.user_profiles up where up.user_id = auth.uid())
      or exists (select 1 from public.shipsync_drivers d where d.user_id = auth.uid() and d.active)
    )
  );
