-- Compass Card → Polaris notifications (client request, 20 Oct 2026).
--
-- Compass Card (compasscard.online: the crew app's API, the admin portal and the
-- vendor portal) tells Polaris the moment something needs a person:
--
--   user_signup      a crew member registers in the app       → the sign-ups team (Crew Care)
--   vendor_signup    a business asks to join as a vendor      → the partners team (Lucy)
--   vendor_status    an admin approves / rejects a vendor     → the partners team
--   offer_submitted  a vendor submits (or re-submits) an offer → the partners team
--   offer_status     an admin approves / rejects an offer     → the partners team
--
-- Compass Card POSTs each event, signed, to /api/compass-card/event
-- (routes/api.compass-card.event.ts), which stores it here once (event_id is
-- Compass Card's own id for it, so a resend is ignored). A trigger rings the
-- in-app bell for the right team straight away. Email is optional and off by
-- default (compass_card_settings.email_enabled); the worker sends it
-- (lib/compass-card/alerts.server.ts) and stamps alert_claimed_at.
--
-- Each team is the people picked in compass_card_settings, or — while nobody is
-- picked — every active staff member in the Crew Care department.

-- ── Settings (one row) ─────────────────────────────────────────────────────
create table if not exists public.compass_card_settings (
  id                     int primary key default 1 check (id = 1),
  signup_recipient_ids   uuid[] not null default '{}',
  partner_recipient_ids  uuid[] not null default '{}',
  email_enabled          boolean not null default false,
  email_extra            text[] not null default '{}',
  updated_by             uuid,
  updated_at             timestamptz not null default now()
);
insert into public.compass_card_settings (id) values (1) on conflict (id) do nothing;

-- The shared signing secret. Its own table with RLS on and no policies, so only
-- the server (service role) can ever read it — no signed-in client can.
create table if not exists public.compass_card_integration (
  id              int primary key default 1 check (id = 1),
  webhook_secret  text,
  updated_at      timestamptz not null default now()
);
insert into public.compass_card_integration (id) values (1) on conflict (id) do nothing;
alter table public.compass_card_integration enable row level security;
revoke all on public.compass_card_integration from anon, authenticated;

-- ── Events ─────────────────────────────────────────────────────────────────
create table if not exists public.compass_card_events (
  id                uuid primary key default gen_random_uuid(),
  event_id          text not null unique,
  event_type        text not null check (event_type in
                      ('user_signup', 'vendor_signup', 'vendor_status', 'offer_submitted', 'offer_status')),
  team              text not null check (team in ('signups', 'partners')),
  occurred_at       timestamptz not null default now(),
  received_at       timestamptz not null default now(),
  title             text not null,
  summary           text,
  status            text,          -- pending / approved / rejected, where it applies
  person_name       text,
  person_email      text,
  admin_url         text,          -- the record in the Compass Card admin portal
  data              jsonb not null default '{}',
  alert_claimed_at  timestamptz,
  alert_result      text
);
create index if not exists compass_card_events_received_idx on public.compass_card_events (received_at desc);
create index if not exists compass_card_events_type_idx     on public.compass_card_events (event_type, received_at desc);
create index if not exists compass_card_events_alert_idx    on public.compass_card_events (received_at) where alert_claimed_at is null;

-- ── RLS: staff only; a portal / guest / Academy login never sees these ─────
-- Rows are only ever written by the server (service role); staff read them.
alter table public.compass_card_events enable row level security;
alter table public.compass_card_settings enable row level security;

drop policy if exists staff_read on public.compass_card_events;
create policy staff_read on public.compass_card_events for select to authenticated
  using ((select not public.is_portal_captain()));
drop policy if exists portal_captain_block on public.compass_card_events;
create policy portal_captain_block on public.compass_card_events as restrictive for all to authenticated
  using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));

drop policy if exists staff_read on public.compass_card_settings;
create policy staff_read on public.compass_card_settings for select to authenticated
  using ((select not public.is_portal_captain()));
drop policy if exists staff_update on public.compass_card_settings;
create policy staff_update on public.compass_card_settings for update to authenticated
  using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_block on public.compass_card_settings;
create policy portal_captain_block on public.compass_card_settings as restrictive for all to authenticated
  using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));

-- ── Who each team is ───────────────────────────────────────────────────────
create or replace function public.compass_card_recipients(p_team text)
returns table (user_id uuid, display_name text, email text)
language sql stable security definer set search_path = public as $$
  with s as (
    select case when p_team = 'signups' then signup_recipient_ids else partner_recipient_ids end as ids
      from public.compass_card_settings where id = 1
  )
  select up.user_id, up.display_name, up.email
    from public.user_profiles up
    left join s on true
   where coalesce(up.active, true)
     and case when coalesce(cardinality(s.ids), 0) > 0
              then up.user_id = any (s.ids)
              else lower(replace(coalesce(up.department, ''), ' ', '_')) = 'crew_care' end
$$;
-- Server and triggers only: it lists staff emails, so no signed-in client calls it.
revoke all on function public.compass_card_recipients(text) from public, anon, authenticated;
grant execute on function public.compass_card_recipients(text) to service_role;

-- ── In-app bell for the right team, straight away ─────────────────────────
create or replace function public.compass_card_event_bell() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.notifications (user_id, type, urgency, title, body, action_url, metadata)
    select r.user_id, 'compass_card_' || new.event_type,
           case when new.event_type in ('vendor_signup', 'offer_submitted') then 'warning' else 'info' end,
           left('Compass Card: ' || new.title, 300),
           left(coalesce(new.summary, ''), 500),
           '/compass-card?event=' || new.id,
           jsonb_build_object('compass_event_id', new.id, 'event_type', new.event_type)
      from public.compass_card_recipients(new.team) r;
  exception when others then
    -- Alerting must never stop the event being recorded.
    raise warning 'compass card bell failed: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists compass_card_events_bell on public.compass_card_events;
create trigger compass_card_events_bell after insert on public.compass_card_events
  for each row execute function public.compass_card_event_bell();

revoke all on function public.compass_card_event_bell() from public, anon, authenticated;
