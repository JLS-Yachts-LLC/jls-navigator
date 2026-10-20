-- Permit Inbox — permits that arrive by email, waiting for the Agency team.
--
-- Polaris watches the mailboxes in permit_inbox_mailboxes (m.faisal@ to start
-- with — he receives the GDRFA entry permits), reads every PDF attachment, and
-- files the ones that are permits here with the vessel it thinks they belong to.
-- Nothing becomes a real permit until someone on the Agency team confirms the
-- match; confirming creates/updates the permit and copies the PDF into the
-- vessel's SharePoint folder.
--
-- Writes happen only through the Worker (service role): the inbox poller and the
-- /api/permits/inbox endpoints. Staff with Agency access can read.

create table if not exists public.permit_inbox_mailboxes (
  mailbox        text primary key,
  label          text,
  enabled        boolean not null default true,
  last_polled_at timestamptz,
  last_ok_at     timestamptz,
  last_error     text,
  created_at     timestamptz not null default now()
);

insert into public.permit_inbox_mailboxes (mailbox, label)
values ('m.faisal@jlsyachts.com', 'Mohammed Faisal')
on conflict (mailbox) do nothing;

create table if not exists public.permit_inbox (
  id                  uuid primary key default gen_random_uuid(),
  source              text not null check (source in ('email', 'upload')),
  -- Where it came from (email). internet_message_id is stable when the mail is
  -- moved between folders; Graph's own id is not, so it is kept only to re-fetch.
  mailbox             text,
  graph_message_id    text,
  internet_message_id text,
  attachment_key      text,
  received_at         timestamptz,
  from_address        text,
  from_name           text,
  subject             text,
  file_name           text,
  file_size           integer,
  file_sha256         text,
  document_url        text,          -- storage ref (permit-documents bucket)
  status              text not null default 'pending'
                      check (status in ('pending', 'filed', 'rejected', 'not_permit', 'duplicate', 'error')),
  -- What was read from the PDF.
  reading             jsonb,
  permit_type         text,
  dma_phase           text,
  permit_number       text,
  issue_date          date,
  expiry_date         date,
  issuing_authority   text,
  vessel_name         text,
  imo_no              text,
  official_no         text,
  -- Vessel match.
  suggested_yacht_id  uuid references public.yachts(id) on delete set null,
  match_score         integer,
  match_reason        text,
  candidates          jsonb not null default '[]'::jsonb,
  existing_permit_id  uuid references public.permits(id) on delete set null,
  duplicate_of        uuid references public.permit_inbox(id) on delete set null,
  -- Outcome.
  yacht_id            uuid references public.yachts(id) on delete set null,
  permit_id           uuid references public.permits(id) on delete set null,
  sharepoint_web_url  text,
  sharepoint_filed_at timestamptz,
  sharepoint_error    text,
  error               text,
  reviewed_by         uuid,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists permit_inbox_email_uniq
  on public.permit_inbox (mailbox, internet_message_id, attachment_key)
  where source = 'email';
create index if not exists permit_inbox_status_idx on public.permit_inbox (status, created_at desc);
create index if not exists permit_inbox_sha_idx on public.permit_inbox (file_sha256);

-- Emails already looked at (with or without a PDF), so each tick only opens the
-- attachments of mail it has not seen. Worker-only: RLS on, no policies.
create table if not exists public.permit_inbox_seen (
  mailbox             text not null,
  internet_message_id text not null,
  seen_at             timestamptz not null default now(),
  primary key (mailbox, internet_message_id)
);
create index if not exists permit_inbox_seen_at_idx on public.permit_inbox_seen (seen_at);

alter table public.permit_inbox enable row level security;
alter table public.permit_inbox_mailboxes enable row level security;
alter table public.permit_inbox_seen enable row level security;

-- Read: Agency staff (the PDFs carry crew passport details — never portal accounts).
drop policy if exists permit_inbox_agency_read on public.permit_inbox;
create policy permit_inbox_agency_read on public.permit_inbox for select to authenticated
  using (
    (not public.is_portal_captain())
    and (public.has_role((select auth.uid()), 'admin'::app_role)
         or public.has_module_permission((select auth.uid()), 'agency', 'view'))
  );

drop policy if exists permit_inbox_mailboxes_agency_read on public.permit_inbox_mailboxes;
create policy permit_inbox_mailboxes_agency_read on public.permit_inbox_mailboxes for select to authenticated
  using (
    (not public.is_portal_captain())
    and (public.has_role((select auth.uid()), 'admin'::app_role)
         or public.has_module_permission((select auth.uid()), 'agency', 'view'))
  );
