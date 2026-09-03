-- Close the door: make the client-document buckets private.
--
-- `permit-documents` (permits, passports, visas, seaman's books, crew lists,
-- yacht documents, forms) and `esign-documents` (contracts, signed PDFs and the
-- branded guide PDFs) were both public, meaning every stored file was readable by
-- anyone holding its URL, with no expiry and no audit trail.
--
-- Reads inside the app already go through signed URLs (src/lib/signed-url.ts and
-- signed-url.server.ts), and the "authenticated read" policies these buckets
-- already carry are what those signatures are minted against — so staff access is
-- unaffected.
--
-- ⚠️ BREAKING FOR LINKS ALREADY SENT. Every public URL previously emailed to a
-- client stops working the moment this runs. Run it as an announced cutover, not
-- quietly. Documents can be re-sent from the app afterwards.

update storage.buckets set public = false where id in ('permit-documents', 'esign-documents');
