-- Polaris auto-replies: an answer to each invite button tapped, and an away
-- message outside office hours. All off by default; sent as free text inside
-- the 24-hour window the client's own message opens.

create table if not exists public.wa_auto_replies (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('button', 'away')),
  template_id uuid references public.wa_templates(id) on delete cascade,
  button_text text,
  reply_text text not null default '' check (char_length(reply_text) <= 1024),
  enabled boolean not null default false,
  -- away: {"days":[1..7 ISO weekdays], "start":"08:00", "end":"17:00", "outside_hours_only":true, "cooldown_hours":12}
  options jsonb not null default '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'button' and template_id is not null and button_text is not null)
      or (kind = 'away' and template_id is null and button_text is null))
);
create unique index if not exists wa_auto_replies_button_uq on public.wa_auto_replies (template_id, lower(button_text)) where kind = 'button';
create unique index if not exists wa_auto_replies_away_uq on public.wa_auto_replies (kind) where kind = 'away';

drop trigger if exists wa_auto_replies_updated on public.wa_auto_replies;
create trigger wa_auto_replies_updated before update on public.wa_auto_replies
  for each row execute function public.set_updated_at();

insert into public.wa_auto_replies (kind, reply_text, enabled, options)
select 'away',
  'Hello, and thank you for your message. Our team is available Monday to Friday, 8:00–17:00 (Dubai time) and will reply as soon as we''re back. For anything urgent, please email info@jlsyachts.com or call +97143313555.',
  false,
  '{"days":[1,2,3,4,5],"start":"08:00","end":"17:00","outside_hours_only":true,"cooldown_hours":12}'::jsonb
where not exists (select 1 from public.wa_auto_replies where kind = 'away');

alter table public.wa_auto_replies enable row level security;
drop policy if exists "communications view" on public.wa_auto_replies;
create policy "communications view" on public.wa_auto_replies for select to authenticated
  using ((select public.has_module_permission(auth.uid(), 'communications', 'view')) and not (select public.is_portal_captain()));
drop policy if exists "communications insert" on public.wa_auto_replies;
create policy "communications insert" on public.wa_auto_replies for insert to authenticated
  with check ((select public.has_module_permission(auth.uid(), 'communications', 'edit')) and not (select public.is_portal_captain()));
drop policy if exists "communications update" on public.wa_auto_replies;
create policy "communications update" on public.wa_auto_replies for update to authenticated
  using ((select public.has_module_permission(auth.uid(), 'communications', 'edit')) and not (select public.is_portal_captain()))
  with check ((select public.has_module_permission(auth.uid(), 'communications', 'edit')) and not (select public.is_portal_captain()));
drop policy if exists "communications delete" on public.wa_auto_replies;
create policy "communications delete" on public.wa_auto_replies for delete to authenticated
  using ((select public.has_module_permission(auth.uid(), 'communications', 'edit')) and not (select public.is_portal_captain()));
revoke all on public.wa_auto_replies from anon;

-- Mark what Polaris sent by itself, so threads label it and it doesn't count as staff reading.
alter table public.wa_messages add column if not exists auto_reply boolean not null default false;

-- An auto-reply keeps the thread unread and showing the client's own message.
create or replace function public.wa_conversation_on_outbound()
returns trigger language plpgsql security definer set search_path = public as $$
declare at timestamptz := coalesce(new.sent_at, new.queued_at);
begin
  if new.contact_id is null or new.kind = 'campaign' then return new; end if;
  if new.auto_reply then
    update wa_conversations set last_outbound_at = greatest(last_outbound_at, at), updated_at = now()
     where contact_id = new.contact_id;
    return new;
  end if;
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
revoke execute on function public.wa_conversation_on_outbound() from public, anon, authenticated;
