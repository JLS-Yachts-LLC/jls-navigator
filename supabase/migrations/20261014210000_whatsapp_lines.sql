-- ════════════════════════════════════════════════════════════════════════════
-- WhatsApp: more than one number ("line").
--
-- Until now Polaris spoke for exactly one WhatsApp number, configured by Worker
-- secrets. This adds wa_lines so a second number — the Training number, onboarded
-- by Embedded Signup with Coexistence (the WhatsApp Business app keeps working on
-- the phone) — has its own threads, replies, templates and token.
--
-- The existing office number becomes the DEFAULT line (token_source 'env': it
-- keeps using the Worker secrets). Every new line_id column defaults to it, so
-- each existing insert path keeps working unchanged and lands on the office line;
-- only code that knows about another line passes one.
--
-- Also:
--   · source 'history' marks messages imported from the Business app's chat
--     history at onboarding: shown in the Inbox, but they never count as new
--     (no unread, no reopening, no 24-hour reply window, no auto-replies).
--   · wa_conversations.human_until — set whenever a person replies (in Polaris or
--     on the phone); automatic replies stay quiet until it passes.
--   · wa_line_tokens — a line's access token, readable by the server only.
--   · wa_onboarding_sessions — every Embedded Signup attempt, with Meta's errors.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.wa_lines (
  id                          uuid primary key default gen_random_uuid(),
  label                       text not null,
  phone_number_id             text unique,
  waba_id                     text,
  display_phone               text,
  verified_name               text,
  is_default                  boolean not null default false,
  token_source                text not null default 'stored' check (token_source in ('env', 'stored')),
  coexistence                 boolean not null default true,
  status                      text not null default 'connected' check (status in ('pending', 'connected', 'disconnected')),
  auto_replies_enabled        boolean not null default false,
  human_pause_hours           integer not null default 4 check (human_pause_hours between 0 and 168),
  onboarded_at                timestamptz,
  onboarded_by                uuid,
  contacts_sync_requested_at  timestamptz,
  contacts_sync_error         text,
  history_sync_requested_at   timestamptz,
  history_sync_error          text,
  history_progress            integer,
  history_declined            boolean not null default false,
  disconnected_at             timestamptz,
  disconnect_reason           text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create unique index if not exists wa_lines_one_default on public.wa_lines (is_default) where is_default;

drop trigger if exists wa_lines_touch on public.wa_lines;
create trigger wa_lines_touch before update on public.wa_lines
  for each row execute function public.portal_touch_updated_at();

-- The office number, as it is today: Worker secrets, office auto-replies allowed.
insert into public.wa_lines (label, waba_id, is_default, token_source, coexistence, status, auto_replies_enabled, display_phone)
select 'JLS Yachts (office)', '1971999177522959', true, 'env', true, 'connected', true, '+971 4 331 3555'
where not exists (select 1 from public.wa_lines where is_default);

create or replace function public.wa_default_line_id()
returns uuid language sql stable security definer set search_path = public as
$$ select id from wa_lines where is_default limit 1 $$;

-- A line's access token (the Business Integration token from Embedded Signup).
create table if not exists public.wa_line_tokens (
  line_id      uuid primary key references public.wa_lines(id) on delete cascade,
  access_token text not null,
  token_kind   text not null default 'business_integration',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.wa_onboarding_sessions (
  id               uuid primary key default gen_random_uuid(),
  started_by       uuid,
  started_by_email text,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  status           text not null default 'started'
                   check (status in ('started', 'finished', 'cancelled', 'error', 'connected')),
  events           jsonb not null default '[]'::jsonb,
  waba_id          text,
  phone_number_id  text,
  line_id          uuid references public.wa_lines(id) on delete set null,
  meta_session_id  text,
  error_code       text,
  error_message    text,
  fbtrace_id       text
);

-- ── line_id + source on the message tables ───────────────────────────────────
alter table public.wa_inbound
  add column if not exists line_id uuid not null default public.wa_default_line_id() references public.wa_lines(id),
  add column if not exists source text not null default 'live' check (source in ('live', 'history'));
alter table public.wa_messages
  add column if not exists line_id uuid not null default public.wa_default_line_id() references public.wa_lines(id),
  add column if not exists source text not null default 'live' check (source in ('live', 'history'));
alter table public.wa_campaigns
  add column if not exists line_id uuid not null default public.wa_default_line_id() references public.wa_lines(id);
alter table public.wa_templates
  add column if not exists line_id uuid not null default public.wa_default_line_id() references public.wa_lines(id);
alter table public.wa_conversations
  add column if not exists line_id uuid not null default public.wa_default_line_id() references public.wa_lines(id),
  add column if not exists human_until timestamptz;

create index if not exists wa_inbound_line_contact_idx on public.wa_inbound (line_id, contact_id, received_at desc);
create index if not exists wa_messages_line_contact_idx on public.wa_messages (line_id, contact_id);

-- One thread per contact PER NUMBER; templates are per number's WABA.
alter table public.wa_conversations drop constraint if exists wa_conversations_contact_id_key;
drop index if exists public.wa_conversations_contact_id_key;
create unique index if not exists wa_conversations_contact_line_key on public.wa_conversations (contact_id, line_id);
alter table public.wa_templates drop constraint if exists wa_templates_name_language_key;
drop index if exists public.wa_templates_name_language_key;
create unique index if not exists wa_templates_line_name_language_key on public.wa_templates (line_id, name, language);

-- Contacts can now also arrive from the phone's address book (smb_app_state_sync).
alter table public.wa_contacts drop constraint if exists wa_contacts_source_check;
alter table public.wa_contacts add constraint wa_contacts_source_check
  check (source in ('manual', 'vessel', 'agency_contact', 'whatsapp_app'));

-- ── Conversation triggers, now per line ──────────────────────────────────────
create or replace function public.wa_conversation_on_inbound()
returns trigger language plpgsql security definer set search_path = public as $$
declare preview text := left(coalesce(nullif(new.body, ''), '[' || coalesce(new.type, 'message') || ']'), 160);
begin
  if new.contact_id is null then return new; end if;
  -- Imported history: the thread exists and shows it, but nothing is "new".
  if new.source = 'history' then
    insert into wa_conversations as c (contact_id, line_id, status, last_message_at, last_preview, last_direction, unread_count)
    values (new.contact_id, new.line_id, 'open', new.received_at, preview, 'in', 0)
    on conflict (contact_id, line_id) do update set
      last_preview = case when excluded.last_message_at > coalesce(c.last_message_at, '-infinity') then excluded.last_preview else c.last_preview end,
      last_direction = case when excluded.last_message_at > coalesce(c.last_message_at, '-infinity') then 'in' else c.last_direction end,
      last_message_at = greatest(c.last_message_at, excluded.last_message_at),
      updated_at = now();
    return new;
  end if;
  insert into wa_conversations as c (contact_id, line_id, status, last_inbound_at, last_message_at, last_preview, last_direction, unread_count)
  values (new.contact_id, new.line_id, 'open', new.received_at, new.received_at, preview, 'in', 1)
  on conflict (contact_id, line_id) do update set
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
revoke execute on function public.wa_conversation_on_inbound() from public, anon, authenticated;

create or replace function public.wa_conversation_on_outbound()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  at timestamptz := coalesce(new.sent_at, new.queued_at);
  pause int;
begin
  if new.contact_id is null or new.kind = 'campaign' then return new; end if;
  if new.source = 'history' then
    insert into wa_conversations as c (contact_id, line_id, status, last_message_at, last_preview, last_direction, unread_count)
    values (new.contact_id, new.line_id, 'open', at, left(coalesce(new.body, '[message]'), 160), 'out', 0)
    on conflict (contact_id, line_id) do update set
      last_preview = case when excluded.last_message_at > coalesce(c.last_message_at, '-infinity') then excluded.last_preview else c.last_preview end,
      last_direction = case when excluded.last_message_at > coalesce(c.last_message_at, '-infinity') then 'out' else c.last_direction end,
      last_message_at = greatest(c.last_message_at, excluded.last_message_at),
      updated_at = now();
    return new;
  end if;
  if new.auto_reply then
    update wa_conversations set last_outbound_at = greatest(last_outbound_at, at), updated_at = now()
     where contact_id = new.contact_id and line_id = new.line_id;
    return new;
  end if;
  -- A person replied (in Polaris or on the phone): automatic replies hold off.
  select human_pause_hours into pause from wa_lines where id = new.line_id;
  insert into wa_conversations as c (contact_id, line_id, status, last_outbound_at, last_message_at, last_preview, last_direction, unread_count, human_until)
  values (new.contact_id, new.line_id, 'open', at, at, left(coalesce(new.body, '[template]'), 160), 'out', 0,
          at + make_interval(hours => coalesce(pause, 4)))
  on conflict (contact_id, line_id) do update set
    status = 'open', closed_at = null, closed_by = null,
    last_outbound_at = greatest(c.last_outbound_at, excluded.last_outbound_at),
    last_message_at = greatest(c.last_message_at, excluded.last_message_at),
    last_preview = excluded.last_preview,
    last_direction = 'out',
    unread_count = 0,
    human_until = greatest(c.human_until, excluded.human_until),
    updated_at = now();
  return new;
end;
$$;
revoke execute on function public.wa_conversation_on_outbound() from public, anon, authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.wa_lines enable row level security;
drop policy if exists "communications view" on public.wa_lines;
create policy "communications view" on public.wa_lines for select to authenticated
  using ((select public.has_module_permission(auth.uid(), 'communications', 'view')) and not (select public.is_portal_captain()));
revoke insert, update, delete on public.wa_lines from anon, authenticated;
revoke all on public.wa_lines from anon;

-- Tokens: server only. RLS on with no policy, and no grants, belt and braces.
alter table public.wa_line_tokens enable row level security;
revoke all on public.wa_line_tokens from anon, authenticated;

alter table public.wa_onboarding_sessions enable row level security;
drop policy if exists "communications view" on public.wa_onboarding_sessions;
create policy "communications view" on public.wa_onboarding_sessions for select to authenticated
  using ((select public.has_module_permission(auth.uid(), 'communications', 'view')) and not (select public.is_portal_captain()));
revoke insert, update, delete on public.wa_onboarding_sessions from anon, authenticated;
revoke all on public.wa_onboarding_sessions from anon;
