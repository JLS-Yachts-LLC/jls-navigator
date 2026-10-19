-- Crew Care → Job Cards (client request, 19 Oct 2026).
--
-- "Captain wants a request section for Crew Care to action": transfers, a
-- driver, internal crew moves. A job card can be raised two ways:
--
--   portal    a captain picks "Crew Care" on New request in the Client Portal.
--             That stays a normal captain_requests row (CR-####, so the captain
--             sees it, can message on it and sees its status) and a trigger
--             opens the linked job card. Status is kept in step both ways.
--   internal  staff (Steve, Mike, anyone) raise one from Crew Care → Job Cards.
--
-- Every new job card rings the in-app bell for the Crew Care team straight
-- away (trigger below). Email and Microsoft Teams are optional and switched on
-- in crew_care_settings (Crew Care → Job Cards → Notifications); the worker
-- sends them (lib/crew-care/job-alerts.server.ts) and stamps alert_claimed_at.
--
-- "The Crew Care team" = crew_care_settings.recipient_user_ids, or — while that
-- is empty — every active staff member in the Crew Care department.

-- ── Portal: a Crew Care request category + its structured fields ──────────
alter table public.captain_requests drop constraint if exists captain_requests_category_check;
alter table public.captain_requests add constraint captain_requests_category_check check (category = any (array[
  'provisioning', 'uniform', 'bunkering', 'permits', 'it_support', 'visa_immigration', 'crew_care', 'general']));

-- Pickup / drop-off / when / passengers from the portal form, copied onto the job card.
alter table public.captain_requests add column if not exists crew_care jsonb;

-- ── Settings (one row) ─────────────────────────────────────────────────────
create table if not exists public.crew_care_settings (
  id                 int primary key default 1 check (id = 1),
  recipient_user_ids uuid[] not null default '{}',
  email_enabled      boolean not null default false,
  email_extra        text[] not null default '{}',
  teams_enabled      boolean not null default false,
  -- A Teams "Workflows" webhook (Post to a channel when a webhook request is
  -- received) or a classic incoming webhook. Only Microsoft hosts are accepted,
  -- so this can't be pointed at an arbitrary address.
  teams_webhook_url  text check (teams_webhook_url is null or teams_webhook_url ~
    '^https://[A-Za-z0-9.-]+\.(logic\.azure\.com|powerplatform\.com|webhook\.office\.com|office\.com)(:443)?/'),
  updated_by         uuid,
  updated_at         timestamptz not null default now()
);
insert into public.crew_care_settings (id) values (1) on conflict (id) do nothing;

-- ── Job cards ──────────────────────────────────────────────────────────────
create sequence if not exists public.crew_care_job_ref_seq;

create table if not exists public.crew_care_jobs (
  id                 uuid primary key default gen_random_uuid(),
  reference          text unique,
  source             text not null default 'internal' check (source in ('portal', 'internal')),
  captain_request_id uuid unique references public.captain_requests(id) on delete set null,
  yacht_id           uuid references public.yachts(id) on delete set null,
  job_type           text not null default 'transfer'
                     check (job_type in ('transfer', 'driver', 'airport', 'crew_logistics', 'other')),
  title              text not null,
  details            text,
  pickup             text,
  dropoff            text,
  needed_at          timestamptz,
  passengers         int check (passengers is null or passengers between 0 and 500),
  requested_by_name  text,
  priority           text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status             text not null default 'new'
                     check (status in ('new', 'acknowledged', 'in_progress', 'completed', 'cancelled')),
  assigned_to        uuid references auth.users(id) on delete set null,
  assigned_name      text,
  trip_id            uuid references public.crew_trips(id) on delete set null,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  completed_at       timestamptz,
  -- Email / Teams: claimed by the worker before sending, result kept for the UI.
  alert_claimed_at   timestamptz,
  alert_result       text
);
create index if not exists crew_care_jobs_status_idx  on public.crew_care_jobs (status);
create index if not exists crew_care_jobs_created_idx on public.crew_care_jobs (created_at desc);
create index if not exists crew_care_jobs_alert_idx   on public.crew_care_jobs (created_at) where alert_claimed_at is null;

-- ── RLS: staff only; a portal / guest / Academy login never sees either table ─
alter table public.crew_care_jobs enable row level security;
alter table public.crew_care_settings enable row level security;

drop policy if exists staff_all on public.crew_care_jobs;
create policy staff_all on public.crew_care_jobs for all to authenticated
  using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_block on public.crew_care_jobs;
create policy portal_captain_block on public.crew_care_jobs as restrictive for all to authenticated
  using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));

drop policy if exists staff_read on public.crew_care_settings;
create policy staff_read on public.crew_care_settings for select to authenticated
  using ((select not public.is_portal_captain()));
drop policy if exists staff_update on public.crew_care_settings;
create policy staff_update on public.crew_care_settings for update to authenticated
  using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_block on public.crew_care_settings;
create policy portal_captain_block on public.crew_care_settings as restrictive for all to authenticated
  using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));

-- ── The Crew Care team ─────────────────────────────────────────────────────
create or replace function public.crew_care_recipients()
returns table (user_id uuid, display_name text, email text)
language sql stable security definer set search_path = public as $$
  select up.user_id, up.display_name, up.email
    from public.user_profiles up
    left join public.crew_care_settings s on s.id = 1
   where coalesce(up.active, true)
     and case when coalesce(cardinality(s.recipient_user_ids), 0) > 0
              then up.user_id = any (s.recipient_user_ids)
              else lower(replace(coalesce(up.department, ''), ' ', '_')) = 'crew_care' end
$$;
-- Server and triggers only: it lists staff emails, so no signed-in client calls it.
revoke all on function public.crew_care_recipients() from public, anon, authenticated;
grant execute on function public.crew_care_recipients() to service_role;

-- ── Reference, timestamps ──────────────────────────────────────────────────
create or replace function public.crew_care_job_biu() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.reference is null or new.reference = '' then
      new.reference := 'JC-' || lpad(nextval('public.crew_care_job_ref_seq')::text, 4, '0');
    end if;
  else
    new.reference := old.reference;
    new.updated_at := now();
  end if;
  if new.status = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
  if new.status <> 'completed' then new.completed_at := null; end if;
  return new;
end $$;
drop trigger if exists crew_care_jobs_biu on public.crew_care_jobs;
create trigger crew_care_jobs_biu before insert or update on public.crew_care_jobs
  for each row execute function public.crew_care_job_biu();

-- ── In-app bell for the Crew Care team, straight away ─────────────────────
create or replace function public.crew_care_job_bell() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_vessel text;
begin
  select vessel_name into v_vessel from public.yachts where id = new.yacht_id;
  begin
    insert into public.notifications (user_id, type, urgency, title, body, action_url, metadata)
    select r.user_id, 'crew_care_job',
           case when new.priority in ('high', 'urgent') then 'warning' else 'info' end,
           'Crew Care job ' || new.reference || ': ' || new.title,
           left(concat_ws(' · ',
             nullif(coalesce(v_vessel, ''), ''),
             case when new.requested_by_name is not null then 'from ' || new.requested_by_name end,
             case when new.needed_at is not null then to_char(new.needed_at at time zone 'Asia/Dubai', 'DD Mon HH24:MI') end,
             nullif(concat_ws(' → ', new.pickup, new.dropoff), '')), 500),
           '/crew-cab/jobs?job=' || new.id,
           jsonb_build_object('job_id', new.id, 'source', new.source)
      from public.crew_care_recipients() r
     where r.user_id is distinct from new.created_by;
  exception when others then
    -- Alerting must never block raising the job.
    raise warning 'crew care bell failed: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists crew_care_jobs_bell on public.crew_care_jobs;
create trigger crew_care_jobs_bell after insert on public.crew_care_jobs
  for each row execute function public.crew_care_job_bell();

-- ── Portal request (category crew_care) → job card ────────────────────────
create or replace function public.crew_care_job_from_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_when timestamptz; v_pax int;
begin
  if new.category is distinct from 'crew_care' then return new; end if;
  select coalesce(nullif(ca.display_name, ''), ca.email) into v_name
    from public.captain_accounts ca where ca.user_id = new.created_by and ca.active limit 1;
  begin v_when := nullif(new.crew_care->>'needed_at', '')::timestamptz; exception when others then v_when := null; end;
  begin v_pax  := nullif(new.crew_care->>'passengers', '')::int;       exception when others then v_pax := null; end;
  if v_when is null and new.needed_by is not null then v_when := new.needed_by::timestamptz; end if;
  insert into public.crew_care_jobs (source, captain_request_id, yacht_id, job_type, title, details,
                                     pickup, dropoff, needed_at, passengers, requested_by_name, priority, created_by)
  values ('portal', new.id, new.yacht_id,
          case when new.crew_care->>'job_type' in ('transfer', 'driver', 'airport', 'crew_logistics', 'other')
               then new.crew_care->>'job_type' else 'transfer' end,
          new.title, new.details,
          nullif(left(new.crew_care->>'pickup', 300), ''), nullif(left(new.crew_care->>'dropoff', 300), ''),
          v_when, case when v_pax between 0 and 500 then v_pax end,
          coalesce(v_name, 'Client Portal'), new.priority, new.created_by)
  on conflict (captain_request_id) do nothing;
  return new;
end $$;
drop trigger if exists crew_care_job_from_request on public.captain_requests;
create trigger crew_care_job_from_request after insert on public.captain_requests
  for each row execute function public.crew_care_job_from_request();

-- ── Keep the two statuses in step (each side only writes when it differs) ──
create or replace function public.crew_care_job_status_to_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.captain_request_id is not null and new.status is distinct from old.status then
    update public.captain_requests set status = new.status
     where id = new.captain_request_id and status is distinct from new.status;
  end if;
  return new;
end $$;
drop trigger if exists crew_care_job_status_to_request on public.crew_care_jobs;
create trigger crew_care_job_status_to_request after update of status on public.crew_care_jobs
  for each row execute function public.crew_care_job_status_to_request();

create or replace function public.crew_care_request_status_to_job() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.category = 'crew_care' and new.status is distinct from old.status then
    update public.crew_care_jobs set status = new.status
     where captain_request_id = new.id and status is distinct from new.status;
  end if;
  return new;
end $$;
drop trigger if exists crew_care_request_status_to_job on public.captain_requests;
create trigger crew_care_request_status_to_job after update of status on public.captain_requests
  for each row execute function public.crew_care_request_status_to_job();

revoke all on function public.crew_care_job_biu() from public, anon, authenticated;
revoke all on function public.crew_care_job_bell() from public, anon, authenticated;
revoke all on function public.crew_care_job_from_request() from public, anon, authenticated;
revoke all on function public.crew_care_job_status_to_request() from public, anon, authenticated;
revoke all on function public.crew_care_request_status_to_job() from public, anon, authenticated;
