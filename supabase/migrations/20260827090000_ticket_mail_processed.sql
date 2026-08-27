-- Inbound ticket mail dedupe (see live migration ticket_mail_processed).
create table if not exists public.ticket_mail_processed (
  message_id   text primary key,
  ticket_id    uuid references public.it_tickets(id) on delete set null,
  outcome      text not null default 'appended',
  processed_at timestamptz not null default now()
);
alter table public.ticket_mail_processed enable row level security;
create policy ticket_mail_processed_staff on public.ticket_mail_processed
  for select to authenticated using (not is_portal_captain());
