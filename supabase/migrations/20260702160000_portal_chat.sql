-- Client Portal chat: one thread per portal user, two-way staff <-> portal.
-- claimed_by marks which staff member is handling the conversation so two
-- staff don't both reply to the same client.
create table if not exists public.portal_chats (
  id                  uuid primary key default gen_random_uuid(),
  captain_account_id  uuid not null unique references public.captain_accounts(id) on delete cascade,
  yacht_id            uuid not null references public.yachts(id) on delete cascade,
  claimed_by          uuid,
  claimed_by_name     text,
  claimed_at          timestamptz,
  last_message_at     timestamptz,
  last_sender_role    text check (last_sender_role in ('staff','portal')),
  portal_unread       int not null default 0,
  staff_unread        int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.portal_chat_messages (
  id             uuid primary key default gen_random_uuid(),
  chat_id        uuid not null references public.portal_chats(id) on delete cascade,
  sender_user_id uuid,
  sender_name    text,
  sender_role    text not null check (sender_role in ('staff','portal')),
  body           text not null,
  created_at     timestamptz not null default now()
);
create index if not exists portal_chat_messages_chat_idx on public.portal_chat_messages (chat_id, created_at);

create or replace function public.portal_chat_after_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update portal_chats set
    last_message_at  = new.created_at,
    last_sender_role = new.sender_role,
    portal_unread    = portal_unread + case when new.sender_role = 'staff' then 1 else 0 end,
    staff_unread     = staff_unread  + case when new.sender_role = 'portal' then 1 else 0 end,
    updated_at       = now()
  where id = new.chat_id;
  return new;
end $$;
drop trigger if exists portal_chat_after_message on public.portal_chat_messages;
create trigger portal_chat_after_message
  after insert on public.portal_chat_messages
  for each row execute function public.portal_chat_after_message();

drop trigger if exists portal_chats_touch on public.portal_chats;
create trigger portal_chats_touch before update on public.portal_chats
  for each row execute function public.portal_touch_updated_at();

alter table public.portal_chats enable row level security;
alter table public.portal_chat_messages enable row level security;

drop policy if exists staff_all on public.portal_chats;
create policy staff_all on public.portal_chats
  for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists portal_select on public.portal_chats;
create policy portal_select on public.portal_chats
  for select to authenticated
  using (public.is_portal_captain() and public.portal_aal2()
         and captain_account_id in (select id from public.captain_accounts where user_id = auth.uid() and active));
drop policy if exists portal_insert on public.portal_chats;
create policy portal_insert on public.portal_chats
  for insert to authenticated
  with check (public.is_portal_captain() and public.portal_aal2()
              and captain_account_id in (select id from public.captain_accounts where user_id = auth.uid() and active));
drop policy if exists portal_update on public.portal_chats;
create policy portal_update on public.portal_chats
  for update to authenticated
  using (public.is_portal_captain() and public.portal_aal2()
         and captain_account_id in (select id from public.captain_accounts where user_id = auth.uid() and active));

drop policy if exists staff_all on public.portal_chat_messages;
create policy staff_all on public.portal_chat_messages
  for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists portal_select on public.portal_chat_messages;
create policy portal_select on public.portal_chat_messages
  for select to authenticated
  using (public.is_portal_captain() and public.portal_aal2()
         and chat_id in (select id from public.portal_chats));
drop policy if exists portal_insert on public.portal_chat_messages;
create policy portal_insert on public.portal_chat_messages
  for insert to authenticated
  with check (public.is_portal_captain() and public.portal_aal2()
              and sender_role = 'portal' and sender_user_id = auth.uid()
              and chat_id in (select id from public.portal_chats));

-- Backfill portal login emails recorded before the email column existed.
update public.captain_accounts ca
set email = au.email
from auth.users au
where au.id = ca.user_id and ca.email is null;
