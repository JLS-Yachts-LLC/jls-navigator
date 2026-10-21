-- Orbit 2 email thread — the client's replies to a bunkering request, in Polaris.
--
-- The bunkering request email names its Task ID in the subject (BUNK26-0007 -
-- BUNKERING REQUEST - …) and now asks for replies to come back to the platform
-- mailbox as well as to the person who sent it. Polaris watches the mailboxes in
-- orbit2_mail_mailboxes (polaris@ to start with), files every message whose
-- subject names an Orbit 2 Task ID on that record, and copies its attachments
-- into the record's Documents. The team reads and answers the thread from the
-- record's Email Threads tab; answers are sent as a reply-all on the client's message,
-- so the conversation stays one thread in everyone's Outlook too.
--
-- Writes happen only through the Worker (service role): the poller and
-- /api/orbit2/email. Orbit staff read, like the rest of Orbit 2.

create table if not exists public.orbit2_mail_mailboxes (
  mailbox        text primary key,
  label          text,
  enabled        boolean not null default true,
  last_polled_at timestamptz,
  last_ok_at     timestamptz,
  last_error     text,
  created_at     timestamptz not null default now()
);

insert into public.orbit2_mail_mailboxes (mailbox, label)
values ('polaris@jlsyachts.com', 'Polaris platform mailbox')
on conflict (mailbox) do nothing;

create table if not exists public.orbit2_emails (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.orbit2_projects(id) on delete cascade,
  -- 'in' from the client (or anyone outside), 'out' from the team — sent from
  -- Polaris, or from someone's own Outlook on the same thread.
  direction           text not null check (direction in ('in', 'out')),
  -- The mailbox it was read from / sent through; replies go out through it.
  mailbox             text,
  graph_message_id    text,
  -- Stable across folders and mailboxes, so a message copied to several watched
  -- mailboxes is filed once.
  internet_message_id text unique,
  conversation_id     text,
  from_address        text,
  from_name           text,
  to_addresses        text[] not null default '{}',
  cc_addresses        text[] not null default '{}',
  subject             text,
  body_text           text,
  sent_by             uuid,
  sent_at             timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create index if not exists orbit2_emails_project_idx on public.orbit2_emails (project_id, sent_at);
create index if not exists orbit2_emails_conversation_idx on public.orbit2_emails (conversation_id);

-- Every message the poller has looked at, matched or not, so it is read once.
create table if not exists public.orbit2_mail_seen (
  internet_message_id text primary key,
  outcome             text not null,
  project_id          uuid,
  seen_at             timestamptz not null default now()
);

-- A document that arrived on (or went out with) an email points back at it.
alter table public.orbit2_files
  add column if not exists email_id uuid references public.orbit2_emails(id) on delete set null;

alter table public.orbit2_mail_mailboxes enable row level security;
alter table public.orbit2_emails enable row level security;
alter table public.orbit2_mail_seen enable row level security;

drop policy if exists orbit2_emails_read on public.orbit2_emails;
create policy orbit2_emails_read on public.orbit2_emails
  for select using ((select auth.role()) = 'authenticated' and (select not is_portal_captain()));

drop policy if exists orbit2_mail_mailboxes_read on public.orbit2_mail_mailboxes;
create policy orbit2_mail_mailboxes_read on public.orbit2_mail_mailboxes
  for select using ((select auth.role()) = 'authenticated' and (select not is_portal_captain()));
-- orbit2_mail_seen: service role only (no policies).
