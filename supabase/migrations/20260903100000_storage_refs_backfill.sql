-- Normalise stored document locations from permanent public URLs to
-- "<bucket>/<path>" references.
--
-- Why: a public URL is unauthenticated and never expires, so once one is emailed
-- or forwarded the document is readable by anyone who ever sees the link. The app
-- now stores a reference and mints a short-lived signed URL per viewer instead
-- (src/lib/signed-url.ts). The resolver understands both shapes, so this backfill
-- is not required for the app to work — it just makes the stored data uniform and
-- removes the last places a raw public URL could be copied out of the database.
--
-- Access is NOT changed here: the buckets stay public until the separate
-- privatisation migration runs.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('permits',                 'document_url'),
      ('crew_documents',          'file_url'),
      ('crew_passports',          'document_url'),
      ('crew_passports',          'cover_url'),
      ('crew_passports',          'headshot_url'),
      ('crew_passports',          'seamans_book_url'),
      ('crew_passports',          'crew_verification_letter_url'),
      ('visa_applications',       'visa_document_url'),
      ('visa_application_fields', 'document_url'),
      ('yacht_documents',         'file_url'),
      ('forms',                   'pdf_url'),
      ('feedback',                'screenshot_url'),
      ('immigration_crew_lists',  'file_url'),
      ('crew_vehicles',           'photo_url'),
      ('crew_drivers',            'photo_url'),
      ('crew_vehicle_photos',     'url'),
      ('vehicle_damage_reports',  'photo_url'),
      ('vehicle_service_requests','photo_url')
    ) as t(tbl, col)
  loop
    execute format(
      'update public.%I
          set %I = regexp_replace(split_part(%I, ''?'', 1), ''^.*/storage/v1/object/public/'', '''')
        where %I like ''%%/storage/v1/object/public/permit-documents/%%''',
      r.tbl, r.col, r.col, r.col
    );
  end loop;
end $$;
