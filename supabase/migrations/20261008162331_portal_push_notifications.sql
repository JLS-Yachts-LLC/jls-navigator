-- Client Portal phone notifications (Web Push).
--
-- portal_push_subscriptions: one row per device a portal user switched
--   notifications on for. Written only by the server (/api/portal/push).
-- portal_push_outbox: what to tell clients. Filled by the triggers below when
--   JLS does something a client should hear about; the worker sends each one to
--   the right people's devices and stamps it.
create table if not exists public.portal_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  failures int not null default 0
);
create index if not exists portal_push_subscriptions_user_idx on public.portal_push_subscriptions (user_id);
alter table public.portal_push_subscriptions enable row level security;
revoke all on public.portal_push_subscriptions from anon, authenticated;

create table if not exists public.portal_push_outbox (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid,
  boat_id uuid,
  captain_account_id uuid,          -- set: only this person (a live chat is one person's)
  kind text not null,               -- chat | request_message | request_status | owner_notice
  title text not null,
  body text,
  tab text,                          -- the portal section a tap opens
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_count int,
  error text
);
create index if not exists portal_push_outbox_pending_idx on public.portal_push_outbox (created_at) where sent_at is null;
alter table public.portal_push_outbox enable row level security;
revoke all on public.portal_push_outbox from anon, authenticated;

-- JLS wrote in a client's live chat.
create or replace function public.portal_push_on_chat() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if new.sender_role is distinct from 'staff' then return new; end if;
  select captain_account_id, yacht_id, boat_id into c from portal_chats where id = new.chat_id;
  if c.captain_account_id is null then return new; end if;
  insert into portal_push_outbox (yacht_id, boat_id, captain_account_id, kind, title, body, tab)
  values (c.yacht_id, c.boat_id, c.captain_account_id, 'chat',
          coalesce(nullif(trim(new.sender_name), ''), 'JLS Yachts') || ' sent you a message',
          left(new.body, 160), 'chat');
  return new;
end $$;
drop trigger if exists trg_portal_push_on_chat on public.portal_chat_messages;
create trigger trg_portal_push_on_chat after insert on public.portal_chat_messages
  for each row execute function public.portal_push_on_chat();

-- JLS replied on a request.
create or replace function public.portal_push_on_request_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.sender_role is distinct from 'staff' then return new; end if;
  select reference, title, yacht_id, boat_id into r from captain_requests where id = new.request_id;
  if r.yacht_id is null and r.boat_id is null then return new; end if;
  insert into portal_push_outbox (yacht_id, boat_id, kind, title, body, tab)
  values (r.yacht_id, r.boat_id, 'request_message',
          'JLS replied on ' || coalesce(r.reference, 'your request') || coalesce(' — ' || left(r.title, 60), ''),
          left(new.body, 160), 'requests');
  return new;
end $$;
drop trigger if exists trg_portal_push_on_request_message on public.captain_request_messages;
create trigger trg_portal_push_on_request_message after insert on public.captain_request_messages
  for each row execute function public.portal_push_on_request_message();

-- JLS moved a request on (the client cancelling their own isn't news to them).
create or replace function public.portal_push_on_request_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if auth.uid() is not null and (select public.is_portal_captain()) then return new; end if;
  insert into portal_push_outbox (yacht_id, boat_id, kind, title, body, tab)
  values (new.yacht_id, new.boat_id, 'request_status',
          coalesce(new.reference, 'Your request') || ' is now ' || initcap(replace(new.status, '_', ' ')),
          left(new.title, 160), 'requests');
  return new;
end $$;
drop trigger if exists trg_portal_push_on_request_status on public.captain_requests;
create trigger trg_portal_push_on_request_status after update of status on public.captain_requests
  for each row execute function public.portal_push_on_request_status();

-- A boat job finished (the same notice that's emailed to the owner).
create or replace function public.portal_push_on_owner_notice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into portal_push_outbox (boat_id, kind, title, body, tab)
  values (new.boat_id, 'owner_notice', new.title, left(new.body, 160), 'home');
  return new;
end $$;
drop trigger if exists trg_portal_push_on_owner_notice on public.portal_owner_notices;
create trigger trg_portal_push_on_owner_notice after insert on public.portal_owner_notices
  for each row execute function public.portal_push_on_owner_notice();

revoke all on function public.portal_push_on_chat(), public.portal_push_on_request_message(),
  public.portal_push_on_request_status(), public.portal_push_on_owner_notice() from public, anon, authenticated;
