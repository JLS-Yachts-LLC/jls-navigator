-- Put a size cap and a type allow-list on the shared upload bucket.
--
-- `permit-documents` backs 17 different uploaders — permits, crew documents,
-- visa scans, yacht documents, sign-on/off lists, vehicle maintenance photos,
-- profile avatars, feedback attachments and (new) training certificates. It had
-- no limits at all, so a single mistaken drag-and-drop could put an arbitrarily
-- large file of any type into the same store as crew passports.
--
-- SIZE — 25 MiB. Chosen to match the cap the Feedback widget already enforces in
-- the app (MAX_MB = 25), whose screen recorder deliberately stops at 24 MiB to
-- stay underneath it. Measured against what is actually stored: 1,483 files,
-- 474 MB total, and the largest single object is a 9.75 MB PDF — nothing existing
-- comes close, so no current flow is affected.
--
-- TYPES — everything the uploaders' own `accept` attributes already permit:
--   • images — 17 uploaders use `accept="image/*"`, so every common camera and
--     phone format is listed, HEIC/HEIF included (an iPhone upload would
--     otherwise be refused)
--   • pdf, Word, Excel, and the plain-text/CSV imports
--   • rtf / odt / msg / eml — the Feedback widget accepts these
--   • webm / mp4 / quicktime — Feedback screen recordings
-- Deliberately NOT allowed: text/html, javascript and application/octet-stream.
-- Those are the ones with no legitimate use here, and octet-stream would be a
-- hole wide enough to make the rest of the list pointless.
--
-- Note: enforcement is on the content type the browser reports. If a staff member
-- ever reports that a .msg or .eml attachment is refused, that is this list, and
-- the fix is to add the type the browser sent.
update storage.buckets
set file_size_limit = 26214400,  -- 25 MiB, matching the app's own limit
    allowed_mime_types = array[
      -- images (accept="image/*")
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp',
      'image/tiff', 'image/heic', 'image/heif', 'image/avif', 'image/svg+xml',
      -- documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.text',
      'application/rtf', 'text/rtf',
      -- text / imports
      'text/plain', 'text/csv', 'text/tab-separated-values',
      -- mail attachments (Feedback)
      'application/vnd.ms-outlook', 'message/rfc822',
      -- screen recordings (Feedback)
      'video/webm', 'video/mp4', 'video/quicktime'
    ]
where id = 'permit-documents';
