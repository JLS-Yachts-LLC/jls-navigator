-- Everything Polaris sends out about a vessel, in one place (permit emails
-- first, deliberately generic so other modules can log here too).
create table if not exists public.yacht_activity_log (
  id           uuid primary key default gen_random_uuid(),
  yacht_id     uuid references public.yachts(id) on delete cascade,
  permit_id    uuid references public.permits(id) on delete set null,
  kind         text not null,
  channel      text not null default 'email',
  direction    text not null default 'out',
  subject      text,
  recipients   text[] not null default '{}',
  cc           text[] not null default '{}',
  body_html    text,
  attachments  jsonb not null default '[]'::jsonb,
  status       text not null default 'sent' check (status in ('sent','blocked','failed','preview')),
  error        text,
  actor_id     uuid references auth.users(id) on delete set null,
  actor_name   text,
  created_at   timestamptz not null default now()
);
create index if not exists yacht_activity_log_yacht_idx on public.yacht_activity_log (yacht_id, created_at desc);
create index if not exists yacht_activity_log_permit_idx on public.yacht_activity_log (permit_id, created_at desc);
alter table public.yacht_activity_log enable row level security;
create policy yacht_activity_log_staff on public.yacht_activity_log
  for all to authenticated using (not is_portal_captain()) with check (not is_portal_captain());
alter table public.permits add column if not exists email_sent_to text;
