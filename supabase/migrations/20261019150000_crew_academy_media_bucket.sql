-- Crew Academy — course files (Phase 2 of POLARIS_CREW_ACADEMY.md).
--
-- Private bucket for course videos (MP4), images and PDFs. It has NO storage
-- policies on purpose: nobody reads or writes it with their own login. Uploads
-- go through a signed upload URL handed out by /api/academy-admin (JLS) after
-- its permission check, and every read is a short-lived signed URL from
-- /api/academy (crew, only for files in a course enrolled to them) or the admin
-- route. Paths: jls/<course id>/<file> and vessel/<yacht id>/<course id>/<file>.
--
-- 500 MB per file: one quality only (no adaptive streaming), so the course
-- creator asks for 720p H.264 MP4 and warns on big files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'academy-media', 'academy-media', false, 524288000,
  array['video/mp4', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
