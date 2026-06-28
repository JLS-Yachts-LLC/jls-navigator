-- JLS signatories: who can sign Anchor documents, their uploaded signature image,
-- and the approver their documents route to (for DMA-style approval workflows).
create table if not exists public.jls_signatories (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  email           text,
  title           text,
  signature_path  text,
  approver_name   text,
  approver_email  text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.jls_signatories enable row level security;
drop policy if exists jls_signatories_auth on public.jls_signatories;
create policy jls_signatories_auth on public.jls_signatories for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public) values ('signatures', 'signatures', false) on conflict (id) do nothing;
drop policy if exists "signatures auth read" on storage.objects;
create policy "signatures auth read" on storage.objects for select to authenticated using (bucket_id = 'signatures');
drop policy if exists "signatures auth insert" on storage.objects;
create policy "signatures auth insert" on storage.objects for insert to authenticated with check (bucket_id = 'signatures');
drop policy if exists "signatures auth update" on storage.objects;
create policy "signatures auth update" on storage.objects for update to authenticated using (bucket_id = 'signatures');
drop policy if exists "signatures auth delete" on storage.objects;
create policy "signatures auth delete" on storage.objects for delete to authenticated using (bucket_id = 'signatures');
