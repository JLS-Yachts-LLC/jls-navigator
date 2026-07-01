-- Migration 085: Storage bucket for ORBIT document uploads (BDN/Master's
-- Declaration supporting docs, orbit_documents.file_path). Mirrors the
-- existing per-module private-bucket pattern (crew-docs, visa-documents,
-- signatures) — no existing bucket fits ORBIT specifically.

insert into storage.buckets (id, name, public)
values ('orbit-documents', 'orbit-documents', false)
on conflict (id) do nothing;

create policy orbit_documents_bucket_read on storage.objects
  for select using (bucket_id = 'orbit-documents' and auth.role() = 'authenticated');
create policy orbit_documents_bucket_write on storage.objects
  for insert with check (bucket_id = 'orbit-documents' and auth.role() = 'authenticated');
create policy orbit_documents_bucket_update on storage.objects
  for update using (bucket_id = 'orbit-documents' and auth.role() = 'authenticated');
