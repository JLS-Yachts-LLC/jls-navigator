-- Record REFUSED portal document requests, not just the successful ones.
--
-- /api/portal/documents/open answers every refusal with the same generic 404 on
-- purpose: the caller must not learn whether an id exists. But the log behind it
-- only ever recorded the opens that succeeded, so a captain walking other
-- vessels' document ids left no trace whatsoever — and a burst of refusals from
-- one portal account is the clearest probing signal this platform has.
--
-- `outcome` separates the four things that can happen:
--   allowed   — a signed URL was issued.
--   denied    — the row exists and belongs to ANOTHER vessel. The signal.
--   not_found — nothing to serve: no such row, no file on it, an unassigned row,
--               or a request naming a document type / id we don't recognise.
--   error     — the document is the caller's own but its file could not be signed.
--
-- Existing rows are all successful opens, which is why the default is 'allowed'
-- rather than something that would have to be backfilled.
alter table public.portal_document_access
  add column if not exists outcome text not null default 'allowed';

-- A refused attempt has no file behind it, and a malformed request has no row id,
-- so neither column can stay NOT NULL.
alter table public.portal_document_access alter column storage_ref drop not null;
alter table public.portal_document_access alter column source_id   drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'portal_document_access_outcome_check'
  ) then
    alter table public.portal_document_access
      add constraint portal_document_access_outcome_check
      check (outcome in ('allowed', 'denied', 'not_found', 'error'));
  end if;
end $$;

comment on column public.portal_document_access.outcome is
  'allowed | denied | not_found | error. Refused attempts are recorded too — the caller sees an unchanged generic 404.';
comment on column public.portal_document_access.source_id is
  'The document that was ASKED FOR. On a denied row it is deliberately not the caller''s own — that is the point of the row. user_id and yacht_id stay the caller''s: this table records who asked, not who owns.';
comment on column public.portal_document_access.source_table is
  'The table the file hangs off, e.g. ''permits''. A request naming a type the portal does not serve is stored as ''unknown:<type>''.';

-- "Show me the refused attempts, newest first" — what the audit view asks for.
create index if not exists portal_document_access_refused_idx
  on public.portal_document_access (accessed_at desc)
  where outcome <> 'allowed';
