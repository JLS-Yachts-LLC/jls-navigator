-- Client Portal → staff alerts.
--
-- Everything a client does in the portal that needs JLS — a new request (which
-- is also how requisitions, quotation decisions, pre-arrival forms and seaport
-- requests reach the team), a message on a request, a chat message — now alerts
-- the team instead of waiting to be noticed as an unread badge.
--
--   portal_alert_recipients  the staff who get every client alert (chosen in
--                            Settings → Manage Users → Client Portal). The
--                            vessel's responsible agent (yachts.agent_user_id)
--                            is alerted for their own vessels as well.
--   portal_alert_outbox      one row per alert. Written by the triggers below in
--                            the same transaction as the client's action; the
--                            worker emails new rows every few minutes and stamps
--                            emailed_at.
--
-- The in-app bell gets its notification immediately from the trigger. A burst of
-- chat or request messages is folded into one alert per thread while it's still
-- waiting to be emailed, so a chatty client doesn't flood anyone's inbox.

create table if not exists public.portal_alert_recipients (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.portal_alert_outbox (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid references public.yachts(id) on delete cascade,
  kind text not null check (kind in ('request', 'request_message', 'chat')),
  source_id uuid not null,
  title text not null,
  body text,
  urgency text not null default 'info' check (urgency in ('info', 'warning', 'danger')),
  message_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  emailed_at timestamptz,
  email_error text
);
create index if not exists portal_alert_outbox_pending_idx on public.portal_alert_outbox (created_at) where emailed_at is null;
create index if not exists portal_alert_outbox_thread_idx on public.portal_alert_outbox (kind, source_id) where emailed_at is null;

alter table public.portal_alert_recipients enable row level security;
alter table public.portal_alert_outbox enable row level security;

-- Staff only. A portal login can neither see who is alerted nor read the outbox.
drop policy if exists staff_manage on public.portal_alert_recipients;
create policy staff_manage on public.portal_alert_recipients for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists staff_read on public.portal_alert_outbox;
create policy staff_read on public.portal_alert_outbox for select to authenticated
  using (not public.is_portal_captain());
drop policy if exists portal_captain_block on public.portal_alert_recipients;
create policy portal_captain_block on public.portal_alert_recipients as restrictive for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists portal_captain_block on public.portal_alert_outbox;
create policy portal_captain_block on public.portal_alert_outbox as restrictive for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());

-- Raise one alert: fold into a waiting alert for the same thread, or add a new
-- one; then ring the bell for each recipient.
create or replace function public.portal_alert_raise(
  p_yacht_id uuid, p_kind text, p_source_id uuid, p_title text, p_body text, p_urgency text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folded boolean := false;
  v_action text := '/polaris-redesign?screen=client-requests';
begin
  if p_kind in ('request_message', 'chat') then
    update public.portal_alert_outbox
       set message_count = message_count + 1, body = p_body, title = p_title, updated_at = now()
     where kind = p_kind and source_id = p_source_id and emailed_at is null
       and created_at > now() - interval '30 minutes';
    v_folded := found;
  end if;
  if not v_folded then
    insert into public.portal_alert_outbox (yacht_id, kind, source_id, title, body, urgency)
    values (p_yacht_id, p_kind, p_source_id, p_title, p_body, coalesce(p_urgency, 'info'));
  end if;

  -- In-app: one unread notification per thread is enough; don't stack them.
  insert into public.notifications (user_id, type, urgency, title, body, action_url, metadata)
  select r.user_id, 'portal_' || p_kind, coalesce(p_urgency, 'info'), p_title, left(p_body, 500), v_action,
         jsonb_build_object('yacht_id', p_yacht_id, 'source_id', p_source_id, 'kind', p_kind)
    from (
      select user_id from public.portal_alert_recipients
      union
      select agent_user_id from public.yachts where id = p_yacht_id and agent_user_id is not null
    ) r
   where not exists (
     select 1 from public.notifications n
      where n.user_id = r.user_id and n.read_at is null
        and n.metadata->>'source_id' = p_source_id::text and n.type = 'portal_' || p_kind
   );
end $$;
revoke all on function public.portal_alert_raise(uuid, text, uuid, text, text, text) from public, anon, authenticated;

-- New request from a vessel (portal-created — staff don't raise these).
create or replace function public.portal_alert_on_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_vessel text;
begin
  select vessel_name into v_vessel from public.yachts where id = new.yacht_id;
  begin
    perform public.portal_alert_raise(
      new.yacht_id, 'request', new.id,
      coalesce(v_vessel, 'Client') || ': ' || coalesce(new.reference || ' · ', '') || new.title,
      left(coalesce(new.details, ''), 2000),
      case when new.priority in ('high', 'urgent') then 'warning' else 'info' end
    );
  exception when others then
    -- Alerting must never block the client's own action.
    raise warning 'portal alert failed: %', sqlerrm;
  end;
  return new;
end $$;

-- A client's message on a request (staff replies don't alert).
create or replace function public.portal_alert_on_request_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.sender_role is distinct from 'captain' then return new; end if;
  select cr.yacht_id, cr.reference, cr.title, y.vessel_name into r
    from public.captain_requests cr left join public.yachts y on y.id = cr.yacht_id where cr.id = new.request_id;
  begin
    perform public.portal_alert_raise(
      r.yacht_id, 'request_message', new.request_id,
      coalesce(r.vessel_name, 'Client') || ': reply on ' || coalesce(r.reference, 'a request') || ' from ' || coalesce(new.sender_name, 'the client'),
      left(new.body, 2000), 'info'
    );
  exception when others then
    -- Alerting must never block the client's own action.
    raise warning 'portal alert failed: %', sqlerrm;
  end;
  return new;
end $$;

-- A client's chat message (staff replies don't alert).
create or replace function public.portal_alert_on_chat_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.sender_role is distinct from 'portal' then return new; end if;
  select c.yacht_id, y.vessel_name into r
    from public.portal_chats c left join public.yachts y on y.id = c.yacht_id where c.id = new.chat_id;
  begin
    perform public.portal_alert_raise(
      r.yacht_id, 'chat', new.chat_id,
      coalesce(r.vessel_name, 'Client') || ': chat from ' || coalesce(new.sender_name, 'the client'),
      left(new.body, 2000), 'info'
    );
  exception when others then
    -- Alerting must never block the client's own action.
    raise warning 'portal alert failed: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists portal_alert_request on public.captain_requests;
create trigger portal_alert_request after insert on public.captain_requests
  for each row execute function public.portal_alert_on_request();
drop trigger if exists portal_alert_request_message on public.captain_request_messages;
create trigger portal_alert_request_message after insert on public.captain_request_messages
  for each row execute function public.portal_alert_on_request_message();
drop trigger if exists portal_alert_chat_message on public.portal_chat_messages;
create trigger portal_alert_chat_message after insert on public.portal_chat_messages
  for each row execute function public.portal_alert_on_chat_message();

revoke all on function public.portal_alert_on_request() from public, anon, authenticated;
revoke all on function public.portal_alert_on_request_message() from public, anon, authenticated;
revoke all on function public.portal_alert_on_chat_message() from public, anon, authenticated;
