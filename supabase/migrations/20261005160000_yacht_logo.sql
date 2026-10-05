-- A vessel's badge / logo, shown in the Client Portal and on the staff vessel page.
-- Stored in the public vessel-images bucket under logos/<yacht_id>/ — set by staff
-- from the vessel page, or by the vessel's own portal users via /api/portal/vessel-logo.
-- Not part of the SharePoint yacht list, so the yacht sync never touches it.
alter table public.yachts add column if not exists logo_url text;

comment on column public.yachts.logo_url is
  'Public URL of the vessel''s badge/logo (vessel-images bucket, logos/<yacht_id>/). Set from the vessel page or the Client Portal.';

-- vessel-images write policies were open to every authenticated login, portal
-- captains included — so a captain could overwrite or delete any vessel's photo
-- (and now logo). The portal never writes here from the browser (logo uploads go
-- through /api/portal/vessel-logo with the service role), so fence writes to staff.
-- Reads stay as they were: the bucket is public on purpose.
create policy portal_captain_denied_vessel_images_insert on storage.objects
  as restrictive for insert to authenticated
  with check (bucket_id <> 'vessel-images' or not (select public.is_portal_captain()));
create policy portal_captain_denied_vessel_images_update on storage.objects
  as restrictive for update to authenticated
  using (bucket_id <> 'vessel-images' or not (select public.is_portal_captain()));
create policy portal_captain_denied_vessel_images_delete on storage.objects
  as restrictive for delete to authenticated
  using (bucket_id <> 'vessel-images' or not (select public.is_portal_captain()));
