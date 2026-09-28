-- Attach the actual certificate to a training certification, and link it to a
-- real crew member.
--
-- Two gaps this closes:
--   • There was nowhere to put the document. The Training screens recorded that
--     a certificate existed (name, issuer, dates) but the PDF or scan lived
--     nowhere, so the team kept it in SharePoint or email and the record was a
--     note rather than evidence. file_url/file_name mirror crew_documents: the
--     Supabase Storage object is the source of truth, and the upload is copied
--     into SharePoint best-effort, exactly like a crew document.
--   • crew_member_id existed but nothing ever set it — the add form saved the
--     crew member as free text. The Beta Training screen filters by that link
--     when a vessel is chosen, so every certification added in the app showed
--     under "All vessels" and vanished the moment a vessel was picked. The form
--     now picks a crew member, and the index keeps that filter quick.
alter table public.training_certifications
  add column if not exists file_url  text,
  add column if not exists file_name text;

comment on column public.training_certifications.file_url is
  'Storage reference for the certificate itself (bucket/path, permit-documents) — read through a signed URL, never public.';
comment on column public.training_certifications.file_name is
  'Original filename as uploaded, for display.';

create index if not exists training_certifications_crew_member_id_idx
  on public.training_certifications (crew_member_id);
