-- Two-way conversations: every inbound message and every direct reply lands in
-- one thread per contact, with unread, assignment and open/closed state.

alter table public.wa_messages
  add column if not exists kind text not null default 'campaign' check (kind in ('campaign', 'reply', 'template')),
  add column if not exists body text,
  add column if not exists template_id uuid references public.wa_templates(id) on delete set null,
  add column if not exists sent_by uuid;

alter table public.wa_inbound
  add column if not exists profile_name text,
  add column if not exists media_id text,
  add column if not exists media_mime text,
  add column if not exists context_wamid text;

create index if not exists wa_messages_contact_idx on public.wa_messages (contact_id, queued_at desc);
create index if not exists wa_inbound_contact_idx on public.wa_inbound (contact_id, received_at desc);

create table if not exists public.wa_conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null unique references public.wa_contacts(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_message_at timestamptz,
  last_preview text,
  last_direction text check (last_direction in ('in', 'out')),
  unread_count int not null default 0,
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wa_conversations_recent_idx on public.wa_conversations (status, last_message_at desc);

-- Staff can only assign, close and reopen; the counters are kept by triggers.
alter table public.wa_conversations enable row level security;
drop policy if exists "communications view" on public.wa_conversations;
create policy "communications view" on public.wa_conversations for select to authenticated
  using ((select public.has_module_permission(auth.uid(), 'communications', 'view'))
         and not (select public.is_portal_captain()));
drop policy if exists "communications update" on public.wa_conversations;
create policy "communications update" on public.wa_conversations for update to authenticated
  using ((select public.has_module_permission(auth.uid(), 'communications', 'edit'))
         and not (select public.is_portal_captain()))
  with check ((select public.has_module_permission(auth.uid(), 'communications', 'edit'))
              and not (select public.is_portal_captain()));
revoke all on public.wa_conversations from anon;
revoke insert, update, delete on public.wa_conversations from authenticated;
grant select on public.wa_conversations to authenticated;
grant update (status, assigned_to) on public.wa_conversations to authenticated;

create or replace function public.wa_conversations_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    if new.status = 'closed' then
      new.closed_at := now();
      new.closed_by := auth.uid();
    else
      new.closed_at := null;
      new.closed_by := null;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists wa_conversations_stamp on public.wa_conversations;
create trigger wa_conversations_stamp before update on public.wa_conversations
  for each row execute function public.wa_conversations_stamp();

-- A message from the client opens (or reopens) their thread and counts as unread.
create or replace function public.wa_conversation_on_inbound()
returns trigger language plpgsql security definer set search_path = public as $$
declare preview text := left(coalesce(nullif(new.body, ''), '[' || coalesce(new.type, 'message') || ']'), 160);
begin
  if new.contact_id is null then return new; end if;
  insert into wa_conversations as c (contact_id, status, last_inbound_at, last_message_at, last_preview, last_direction, unread_count)
  values (new.contact_id, 'open', new.received_at, new.received_at, preview, 'in', 1)
  on conflict (contact_id) do update set
    status = 'open', closed_at = null, closed_by = null,
    last_inbound_at = greatest(c.last_inbound_at, excluded.last_inbound_at),
    last_preview = case when excluded.last_message_at >= coalesce(c.last_message_at, '-infinity') then excluded.last_preview else c.last_preview end,
    last_direction = case when excluded.last_message_at >= coalesce(c.last_message_at, '-infinity') then 'in' else c.last_direction end,
    last_message_at = greatest(c.last_message_at, excluded.last_message_at),
    unread_count = c.unread_count + 1,
    updated_at = now();
  return new;
end;
$$;
drop trigger if exists wa_conversation_on_inbound on public.wa_inbound;
create trigger wa_conversation_on_inbound after insert on public.wa_inbound
  for each row execute function public.wa_conversation_on_inbound();

-- A direct message from staff keeps the thread current; replying means it's been read.
create or replace function public.wa_conversation_on_outbound()
returns trigger language plpgsql security definer set search_path = public as $$
declare at timestamptz := coalesce(new.sent_at, new.queued_at);
begin
  if new.contact_id is null or new.kind = 'campaign' then return new; end if;
  insert into wa_conversations as c (contact_id, status, last_outbound_at, last_message_at, last_preview, last_direction, unread_count)
  values (new.contact_id, 'open', at, at, left(coalesce(new.body, '[template]'), 160), 'out', 0)
  on conflict (contact_id) do update set
    status = 'open', closed_at = null, closed_by = null,
    last_outbound_at = greatest(c.last_outbound_at, excluded.last_outbound_at),
    last_message_at = greatest(c.last_message_at, excluded.last_message_at),
    last_preview = excluded.last_preview,
    last_direction = 'out',
    unread_count = 0,
    updated_at = now();
  return new;
end;
$$;
drop trigger if exists wa_conversation_on_outbound on public.wa_messages;
create trigger wa_conversation_on_outbound after insert on public.wa_messages
  for each row execute function public.wa_conversation_on_outbound();

revoke execute on function public.wa_conversation_on_inbound() from public, anon, authenticated;
revoke execute on function public.wa_conversation_on_outbound() from public, anon, authenticated;
revoke execute on function public.wa_conversations_stamp() from public, anon, authenticated;
