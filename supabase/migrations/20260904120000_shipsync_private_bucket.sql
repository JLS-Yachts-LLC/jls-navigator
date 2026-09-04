-- ShipSync storage: stop serving delivery photos, PODs and signatures publicly.
--
-- The `shipsync` bucket holds proof-of-delivery PDFs, item and delivery photos,
-- receiver signatures and the documents attached to a package — the same class of
-- material as permit-documents, and it was readable by anyone holding the URL,
-- for ever, with no record of access.
--
-- The app no longer stores public URLs: uploads record a '<bucket>/<path>'
-- reference and every reader resolves a short-lived signed URL (SignedAnchor /
-- SignedImage in the boards, resolveSignedUrlAdmin for the client portal's proof
-- of delivery). Legacy rows still holding a public URL keep working — the
-- resolver reads both shapes.
--
-- Drivers are ordinary authenticated users matched to a shipsync_drivers row, so
-- the driver app signs its own URLs like the rest of the app.

-- Read is now for signed-in users only; it used to be granted to `public` with no
-- condition at all, which is what made every object world-readable.
drop policy if exists shipsync_obj_read on storage.objects;
create policy shipsync_obj_read
  on storage.objects for select to authenticated
  using (bucket_id = 'shipsync');

-- ⚠️ STILL TO DO — flip the bucket itself. Applied separately because the tooling
-- used to run these migrations refuses writes to storage.buckets:
--
--   update storage.buckets set public = false where id = 'shipsync';
--
-- Until that runs, existing public URLs continue to resolve. Nothing breaks when
-- it does: the app reads through signed URLs either way.
