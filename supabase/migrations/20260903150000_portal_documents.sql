-- Client portal: let a captain open their own vessel's documents, and record
-- each client's preferred way of receiving them.
--
-- Storage paths are grouped by document type ("navigation-license/…", "visa/…"),
-- never by vessel, so a path-scoped storage policy cannot express "this captain's
-- documents". Portal access is therefore server-mediated: /api/portal/documents
-- resolves the caller's vessel from their JWT, confirms the requested row belongs
-- to it, and only then signs a short-lived URL with the service role.

create table if not exists public.portal_document_access (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  yacht_id     uuid        not null references public.yachts (id) on delete cascade,
  -- Which record the file hangs off, e.g. ('permits', <permit id>).
  source_table text        not null,
  source_id    uuid        not null,
  storage_ref  text        not null,
  accessed_at  timestamptz not null default now(),
  ip_address   text,
  user_agent   text
);

create index if not exists portal_document_access_yacht_idx on public.portal_document_access (yacht_id, accessed_at desc);
create index if not exists portal_document_access_user_idx  on public.portal_document_access (user_id, accessed_at desc);

alter table public.portal_document_access enable row level security;

-- Staff read the log; the portal never reads it and all writes are service-role.
drop policy if exists portal_document_access_staff_read on public.portal_document_access;
create policy portal_document_access_staff_read
  on public.portal_document_access for select
  to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

-- How this client wants documents delivered. 'secure_link' (the default) emails
-- the branded link; 'portal' tells the sender to point them at the portal they
-- already sign in to, rather than emailing a link at all.
alter table public.yachts
  add column if not exists preferred_document_delivery text not null default 'secure_link';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'yachts_preferred_document_delivery_check'
  ) then
    alter table public.yachts
      add constraint yachts_preferred_document_delivery_check
      check (preferred_document_delivery in ('secure_link', 'portal'));
  end if;
end $$;
