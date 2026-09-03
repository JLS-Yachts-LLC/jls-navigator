-- Secure document delivery: one shared layer for every document that leaves the
-- business.
--
-- A share is a tokenised, expiring pointer at a file in storage. The client
-- receives a link to the branded landing page (/d/<token>) rather than a storage
-- URL, so the document is identified before it is opened, the link stops working
-- on a stated date, and every open is recorded against the share.
--
-- Nothing here is readable anonymously: the public route resolves the token with
-- the service role. The policies below exist so staff can see what was issued and
-- what was opened.

create table if not exists public.document_shares (
  id                uuid primary key default gen_random_uuid(),
  token             text        not null unique,
  -- "<bucket>/<path>" — resolved to a short-lived signed URL at open time.
  storage_ref       text        not null,
  filename          text,
  -- What the recipient is looking at, shown on the landing page and in the email.
  title             text        not null,
  reference         text,
  purpose           text,
  vessel_name       text,
  recipient_email   text,
  -- Provenance, so a permit/visa row can find the shares issued from it.
  source_table      text,
  source_id         uuid,
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  first_accessed_at timestamptz,
  last_accessed_at  timestamptz,
  access_count      integer     not null default 0
);

create index if not exists document_shares_source_idx  on public.document_shares (source_table, source_id);
create index if not exists document_shares_expiry_idx  on public.document_shares (expires_at);
create index if not exists document_shares_created_idx on public.document_shares (created_at desc);

-- One row per open, so "when was this document accessed" has an answer rather
-- than just a counter.
create table if not exists public.document_share_access (
  id          uuid primary key default gen_random_uuid(),
  share_id    uuid        not null references public.document_shares (id) on delete cascade,
  action      text        not null check (action in ('viewed', 'downloaded')),
  accessed_at timestamptz not null default now(),
  ip_address  text,
  user_agent  text
);

create index if not exists document_share_access_share_idx on public.document_share_access (share_id, accessed_at desc);

alter table public.document_shares       enable row level security;
alter table public.document_share_access enable row level security;

-- Staff can see the issue/access record. Creation, token lookup and access
-- logging all run with the service role, so no write policies are granted here.
drop policy if exists document_shares_staff_read on public.document_shares;
create policy document_shares_staff_read
  on public.document_shares for select
  to authenticated
  using (true);

drop policy if exists document_share_access_staff_read on public.document_share_access;
create policy document_share_access_staff_read
  on public.document_share_access for select
  to authenticated
  using (true);
