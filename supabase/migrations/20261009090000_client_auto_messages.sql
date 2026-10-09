-- Automatic messages to a client — switched on by hand, per vessel or managed boat.
--
-- Nothing Polaris sends a client on its own (phone notifications, "job complete"
-- emails to boat owners, "delivery 5 minutes away" emails, WhatsApp expiry
-- reminders and auto-replies) goes out unless staff have switched that client on
-- here. No row = off. The check runs in the Worker at the moment of sending
-- (src/lib/client-auto-messages.server.ts); anything raised while a client is off
-- is marked held, never queued for later.
--
-- A yacht OR a managed boat (orbit2_boats) owns a row, never both — the same
-- shape as yacht_portal_modules / captain_accounts.
create table if not exists public.client_auto_messages (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid references public.yachts(id) on delete cascade,
  boat_id uuid references public.orbit2_boats(id) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_auto_messages_one_vessel check (num_nonnulls(yacht_id, boat_id) = 1)
);

create unique index if not exists client_auto_messages_yacht_uq
  on public.client_auto_messages (yacht_id) where yacht_id is not null;
create unique index if not exists client_auto_messages_boat_uq
  on public.client_auto_messages (boat_id) where boat_id is not null;

drop trigger if exists client_auto_messages_updated on public.client_auto_messages;
create trigger client_auto_messages_updated before update on public.client_auto_messages
  for each row execute function public.set_updated_at();

alter table public.client_auto_messages enable row level security;

-- Staff only. Portal logins neither read nor write it — the Worker reads it with
-- the service role.
drop policy if exists staff_manage on public.client_auto_messages;
create policy staff_manage on public.client_auto_messages
  for all to authenticated
  using (not public.is_portal_captain())
  with check (not public.is_portal_captain());

drop policy if exists portal_captain_denied on public.client_auto_messages;
create policy portal_captain_denied on public.client_auto_messages
  as restrictive for all to authenticated
  using (not public.is_portal_captain())
  with check (not public.is_portal_captain());
