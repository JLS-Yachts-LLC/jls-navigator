-- Staff usage tracking + "who changed this" stamps (16 Oct 2026).
--
-- 1. usage_events: one row per screen a signed-in person opens (written by the
--    browser, see src/lib/usage-tracking.ts). Each person may add only their own
--    rows; only global admins can read them. Kept 180 days — purged by
--    purge_usage_events(), which the Worker's hourly cron calls (pg_cron is not
--    installed on this project).
-- 2. admin_usage_report(): the Admin → Usage page in one call.
-- 3. created_by / updated_by stamped by the database on the tables whose edits
--    recorded no actor (visa applications, ShipSync, the Finance billing tabs),
--    so every app path is covered, not just the ones that remember to set it.
--    Server/sync writes (service role, no auth.uid()) leave updated_by NULL =
--    "system", unless the code sets it explicitly.

-- ── 1. usage_events ──────────────────────────────────────────────────────────
create table if not exists public.usage_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  screen      text not null,
  module      text,
  occurred_at timestamptz not null default now()
);

create index if not exists usage_events_user_time_idx on public.usage_events (user_id, occurred_at);
create index if not exists usage_events_time_idx on public.usage_events (occurred_at);

alter table public.usage_events enable row level security;

drop policy if exists usage_events_insert_own on public.usage_events;
create policy usage_events_insert_own on public.usage_events
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists usage_events_admin_read on public.usage_events;
create policy usage_events_admin_read on public.usage_events
  for select to authenticated
  using (public.is_polaris_global_admin((select auth.uid())));

revoke all on public.usage_events from anon;
grant insert on public.usage_events to authenticated;
grant select on public.usage_events to authenticated;

create or replace function public.purge_usage_events()
returns integer
language sql
security definer
set search_path = public
as $$
  with d as (delete from public.usage_events where occurred_at < now() - interval '180 days' returning 1)
  select count(*)::int from d;
$$;
revoke all on function public.purge_usage_events() from public, anon, authenticated;
grant execute on function public.purge_usage_events() to service_role;

-- ── 2. admin_usage_report ───────────────────────────────────────────────────
-- Staff = every sign-in except client captains, guests, New Horizon IT, the
-- shared itsupport@ mailbox, test logins, and banned (locked-out) accounts.
-- (user_profiles.active is NOT a leaver flag here — it is false for people in daily.)
-- "Days active" / "screens" come from usage_events; "days signed in" comes from
-- auth.refresh_tokens (renewed about hourly while a tab is open), which also
-- gives the history from before usage_events existed.
create or replace function public.admin_usage_report(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 180)));
  v_result jsonb;
begin
  if not public.is_polaris_global_admin(auth.uid()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  with staff as (
    select u.id as user_id,
           lower(u.email) as email,
           coalesce(nullif(up.display_name, ''), nullif(sp.full_name::text, ''), u.email) as name,
           coalesce(nullif(up.department, ''), d.name) as department,
           sp.position::text as position
    from auth.users u
    left join public.user_profiles up on up.user_id = u.id
    left join lateral (
      select s.full_name, s.position, s.department_id from public.staff_profiles s
      where lower(s.email) = lower(u.email) order by s.is_active desc nulls last limit 1
    ) sp on true
    left join public.departments d on d.id = sp.department_id
    where u.email is not null
      and (u.banned_until is null or u.banned_until < now())
      and u.deleted_at is null
      and lower(u.email) not like '%@newhorizon-it.co.uk'
      and lower(u.email) not like 'itsupport@%'
      and lower(u.email) not like 'captain.test@%'
      and split_part(lower(u.email), '@', 1) !~ '(^|[._+-])test([._+-]|[0-9]|$)'
      and not exists (select 1 from public.captain_accounts c where c.user_id = u.id)
      and not exists (select 1 from public.guest_accounts g where g.user_id = u.id)
  ),
  ev as (
    select e.* from public.usage_events e join staff s on s.user_id = e.user_id
    where e.occurred_at >= v_since
  ),
  tok as (
    select r.user_id::uuid as user_id, r.updated_at, r.created_at
    from auth.refresh_tokens r join staff s on s.user_id = r.user_id::uuid
  ),
  per_ev as (
    select user_id,
           count(distinct (occurred_at at time zone 'Asia/Dubai')::date) as days_active,
           count(*) as screens_visited,
           count(distinct screen) as distinct_screens,
           max(occurred_at) as last_event
    from ev group by user_id
  ),
  per_tok as (
    select user_id,
           count(distinct (ts at time zone 'Asia/Dubai')::date) filter (where ts >= v_since) as days_signed_in,
           max(ts) as last_token
    from (select user_id, created_at as ts from tok union all select user_id, updated_at from tok) x
    where ts is not null
    group by user_id
  ),
  mods as (
    select user_id, jsonb_agg(jsonb_build_object('module', module, 'views', n) order by n desc) filter (where rn <= 3) as top_modules
    from (
      select user_id, coalesce(module, 'Other') as module, count(*) as n,
             row_number() over (partition by user_id order by count(*) desc) as rn
      from ev group by user_id, coalesce(module, 'Other')
    ) m group by user_id
  ),
  people as (
    select jsonb_agg(jsonb_build_object(
             'user_id', s.user_id,
             'name', s.name,
             'email', s.email,
             'department', s.department,
             'position', s.position,
             'days_active', coalesce(pe.days_active, 0),
             'days_signed_in', coalesce(pt.days_signed_in, 0),
             'screens_visited', coalesce(pe.screens_visited, 0),
             'distinct_screens', coalesce(pe.distinct_screens, 0),
             'top_modules', coalesce(m.top_modules, '[]'::jsonb),
             'last_seen', greatest(pe.last_event, pt.last_token, au.last_sign_in_at)
           ) order by coalesce(pe.days_active, 0) desc, coalesce(pt.days_signed_in, 0) desc, s.name) as rows
    from staff s
    join auth.users au on au.id = s.user_id
    left join per_ev pe on pe.user_id = s.user_id
    left join per_tok pt on pt.user_id = s.user_id
    left join mods m on m.user_id = s.user_id
  ),
  no_login as (
    select jsonb_agg(jsonb_build_object(
             'name', sp.full_name, 'email', sp.email, 'position', sp.position, 'department', d.name
           ) order by sp.full_name) as rows
    from public.staff_profiles sp
    left join public.departments d on d.id = sp.department_id
    where coalesce(sp.is_active, true)
      and (sp.email is null or not exists (select 1 from auth.users u where lower(u.email) = lower(sp.email)))
  ),
  weeks as (
    select generate_series(date_trunc('week', now() - interval '11 weeks'), date_trunc('week', now()), interval '1 week') as wk
  ),
  weekly as (
    select jsonb_agg(jsonb_build_object(
             'week', to_char(w.wk, 'YYYY-MM-DD'),
             'using', (select count(distinct e.user_id) from public.usage_events e join staff s on s.user_id = e.user_id
                       where e.occurred_at >= w.wk and e.occurred_at < w.wk + interval '1 week'),
             'signed_in', (select count(distinct t.user_id) from tok t
                           where (t.updated_at >= w.wk and t.updated_at < w.wk + interval '1 week')
                              or (t.created_at >= w.wk and t.created_at < w.wk + interval '1 week'))
           ) order by w.wk) as rows
    from weeks w
  )
  select jsonb_build_object(
    'since', v_since,
    'generated_at', now(),
    'tracking_started', (select min(occurred_at) from public.usage_events),
    'people', coalesce((select rows from people), '[]'::jsonb),
    'no_login', coalesce((select rows from no_login), '[]'::jsonb),
    'weekly', coalesce((select rows from weekly), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.admin_usage_report(integer) from public, anon;
grant execute on function public.admin_usage_report(integer) to authenticated;

-- ── 3. created_by / updated_by stamps ────────────────────────────────────────
create or replace function public.stamp_row_actor()
returns trigger
language plpgsql
as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then new.created_by := v_uid; end if;
    if new.updated_by is null then new.updated_by := coalesce(v_uid, new.created_by); end if;
  else
    -- A signed-in person's edit is theirs. A server/sync edit keeps an actor the
    -- code set explicitly, otherwise it's the system (NULL) — never left pointing
    -- at whoever edited the row before.
    if v_uid is not null then
      new.updated_by := v_uid;
    elsif new.updated_by is not distinct from old.updated_by then
      new.updated_by := null;
    end if;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'visa_applications', 'shipsync_packages', 'shipsync_delivery_notes', 'yacht_shipments', 'ship_spares',
    'crew_trips', 'packages', 'yacht_it_contracts', 'procurement_items', 'orbit_projects'
  ] loop
    execute format('alter table public.%I add column if not exists updated_by uuid references auth.users(id) on delete set null', t);
    execute format('drop trigger if exists stamp_row_actor on public.%I', t);
    execute format('create trigger stamp_row_actor before insert or update on public.%I for each row execute function public.stamp_row_actor()', t);
  end loop;
end $$;
