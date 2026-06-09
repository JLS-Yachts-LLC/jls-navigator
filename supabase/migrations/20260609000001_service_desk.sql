-- Service Desk / IT Support — realises the it_tickets table (created out-of-band
-- by Lovable, previously RLS-off with no repo migration) and adds a threaded
-- message log so tickets can be worked conversation-first.

-- ── Extend it_tickets with lifecycle timestamps ───────────────────────────────
alter table public.it_tickets add column if not exists first_response_at timestamptz;
alter table public.it_tickets add column if not exists resolved_at       timestamptz;
alter table public.it_tickets add column if not exists closed_at          timestamptz;

-- ── Auto ticket number: SD-0001, SD-0002 … ────────────────────────────────────
create sequence if not exists public.it_ticket_seq;

create or replace function public.it_tickets_set_ticket_no()
returns trigger
language plpgsql
as $$
begin
  if new.ticket_no is null or new.ticket_no = '' then
    new.ticket_no := 'SD-' || lpad(nextval('public.it_ticket_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists it_tickets_set_ticket_no on public.it_tickets;
create trigger it_tickets_set_ticket_no
  before insert on public.it_tickets
  for each row execute function public.it_tickets_set_ticket_no();

-- ── Threaded conversation / internal notes ────────────────────────────────────
create table if not exists public.it_ticket_messages (
  id          uuid        primary key default gen_random_uuid(),
  ticket_id   uuid        not null references public.it_tickets(id) on delete cascade,
  body        text        not null,
  internal    boolean     not null default false,
  author_id   uuid,
  author_name text,
  created_at  timestamptz not null default now()
);

create index if not exists it_ticket_messages_ticket_idx
  on public.it_ticket_messages (ticket_id, created_at);

-- ── RLS (matches the app's authenticated-only convention) ─────────────────────
alter table public.it_tickets         enable row level security;
alter table public.it_ticket_messages enable row level security;

drop policy if exists "Authenticated users can manage it_tickets" on public.it_tickets;
create policy "Authenticated users can manage it_tickets"
  on public.it_tickets for all
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can manage it_ticket_messages" on public.it_ticket_messages;
create policy "Authenticated users can manage it_ticket_messages"
  on public.it_ticket_messages for all
  using (auth.role() = 'authenticated');

-- ── Keep updated_at fresh on it_tickets ───────────────────────────────────────
drop trigger if exists it_tickets_updated_at on public.it_tickets;
create trigger it_tickets_updated_at
  before update on public.it_tickets
  for each row execute function public.set_updated_at();
