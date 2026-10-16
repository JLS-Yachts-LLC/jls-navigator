-- Staff Usage page (16 Oct 2026): the live version of the one-off staff usage
-- dashboard — who uses Polaris, how often, and what they get done.
--
-- Admins = global admins (is_polaris_global_admin) or has_role(_, 'admin').
-- Replaces admin_usage_report() from 20261016150000.
--
-- Activity (days in, days this week, hours open, last active) = auth.refresh_tokens
-- (renewed about hourly while Polaris is open; created_at/updated_at) together with
-- usage_events. last_sign_in_at is NOT used: people stay signed in for months.
-- Actions = rows a person created (every uuid "…_by" column, author_id, actor_id;
-- not updated_by) + audit_log rows with their user_id, in the window.

drop function if exists public.admin_usage_report(integer);

-- The caller only: it takes no user id, so nobody can probe whether someone else is an admin.
create or replace function public.is_usage_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $
  select auth.uid() is not null
     and (public.is_polaris_global_admin(auth.uid()) or public.has_role(auth.uid(), 'admin'::app_role));
$;
revoke all on function public.is_usage_admin() from public, anon;
grant execute on function public.is_usage_admin() to authenticated;

-- Admins who are has_role(admin) but not global admins can read usage_events too.
drop policy if exists usage_events_admin_read on public.usage_events;
create policy usage_events_admin_read on public.usage_events
  for select to authenticated
  using ((select public.is_usage_admin()));

-- Which part of Polaris a table belongs to, for "Main area".
create or replace function public.usage_area_for_table(t text)
returns text
language sql
immutable
as $$
  select case
    when t like 'visa%' then 'Visas'
    when t in ('crew_signon_events', 'crew_timeline_events', 'immigration_crew_lists', 'masters_declarations', 'sign_on_off', 'movements')
      or t like 'seaport%' then 'Sign On/Off'
    when t = 'crew_trips' or t like 'vehicle_%' or t like 'crew_cab%' or t = 'transport' then 'Crew Care'
    when t like 'crew_document%' then 'Crew documents'
    when t like 'crew%' then 'Crew records'
    when t like 'permit%' or t like 'yacht_license%' then 'Permits'
    when t like 'shipsync%' or t in ('ship_spares', 'packages', 'deliveries', 'logistics') then 'ShipSync'
    when t like 'warehouse%' then 'Warehouse'
    when t like 'yacht_shipment%' then 'Shipments'
    when t like 'orbit2%' then 'Orbit 2'
    when t like 'orbit%' then 'Orbit'
    when t like 'it_%' or t like 'yacht_it%' or t = 'sim_cards' then 'IT'
    when t like 'wa_%' or t = 'whatsapp' then 'WhatsApp'
    when t like 'training%' then 'Training'
    when t like 'esign%' or t like 'anchor%' then 'Anchor'
    when t like 'placement%' or t = 'crew_placement' then 'Crew Placement'
    when t like 'port_call%' or t like 'agency%' or t = 'yacht_agents' then 'Port Calls / Agency'
    when t like 'bunker%' then 'Bunkering'
    when t like 'berth%' then 'Berth Billing'
    when t like 'waypoint%' or t like 'procurement%' then 'Waypoint'
    when t like 'provisioning%' then 'Provisioning'
    when t like 'qbo%' or t like 'yacht_qbo%' or t in ('onboard_expenses', 'finance') then 'Finance'
    when t in ('document_shares', 'guest_shares', 'guest_groups', 'guest_group_members') then 'Document sharing'
    when t like 'yacht_document%' then 'Vessel documents'
    when t like 'yacht%' or t like 'vessel%' then 'Vessels'
    when t like 'portal%' or t = 'captain_requests' then 'Client Portal'
    when t in ('guides', 'forms', 'form_submissions') then 'Knowledge base & forms'
    when t like 'directory%' then 'Directory'
    when t = 'feedback' then 'Feedback'
    when t like 'user_%' or t in ('permission_rules', 'office_vessel_access', 'dev_users', 'admin', 'users') then 'Admin, setup'
    when t = 'recycle_bin' then 'Recycle Bin'
    when t like 'review%' or t = 'google_business_connection' then 'Reviews'
    when coalesce(t, '') = '' then 'Other'
    else initcap(replace(t, '_', ' '))
  end;
$$;

create or replace function public.admin_staff_usage()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tz constant text := 'Asia/Dubai';
  v_since timestamptz := now() - interval '30 days';
  v_week timestamptz := (date_trunc('week', now() at time zone 'Asia/Dubai')) at time zone 'Asia/Dubai';
  v_launch constant date := date '2026-06-22';
  r record;
  v_result jsonb;
begin
  if not public.is_usage_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  -- Staff logins: everyone except client captains, guests, New Horizon IT, the
  -- itsupport@ system mailbox, test logins and locked-out accounts.
  -- (user_profiles.active is not a leaver flag — it is false for daily users.)
  create temp table if not exists _su_staff (user_id uuid primary key, email text, name text, area text, created_at timestamptz) on commit drop;
  truncate _su_staff;
  insert into _su_staff
  select u.id, lower(u.email),
         coalesce(nullif(sp.full_name::text, ''), nullif(up.display_name, ''), u.email),
         coalesce(d.name, nullif(up.department, '')),
         u.created_at
  from auth.users u
  left join public.user_profiles up on up.user_id = u.id
  left join lateral (
    select s.full_name, s.department_id from public.staff_profiles s
    where lower(s.email) = lower(u.email) order by s.is_active desc nulls last limit 1
  ) sp on true
  left join public.departments d on d.id = sp.department_id
  where u.email is not null
    and u.deleted_at is null
    and (u.banned_until is null or u.banned_until < now())
    and lower(u.email) not like '%@newhorizon-it.co.uk'
    and lower(u.email) not like 'itsupport@%'
    and lower(u.email) not like 'captain.test@%'
    and split_part(lower(u.email), '@', 1) !~ '(^|[._+-])test([._+-]|[0-9]|$)'
    and not exists (select 1 from public.captain_accounts c where c.user_id = u.id)
    and not exists (select 1 from public.guest_accounts g where g.user_id = u.id);

  -- Every moment Polaris was open: session renewals + screens opened.
  create temp table if not exists _su_act (user_id uuid, ts timestamptz) on commit drop;
  truncate _su_act;
  insert into _su_act
  select r2.user_id::uuid, x.ts
  from auth.refresh_tokens r2
  join _su_staff s on s.user_id = r2.user_id::uuid
  cross join lateral (values (r2.created_at), (r2.updated_at)) x(ts)
  where x.ts is not null;
  insert into _su_act
  select e.user_id, e.occurred_at from public.usage_events e join _su_staff s on s.user_id = e.user_id;

  -- Actions in the last 30 days, by area.
  create temp table if not exists _su_actions (user_id uuid, area text, n bigint) on commit drop;
  truncate _su_actions;
  for r in
    select c.table_name, c.column_name,
           (select tc.column_name from information_schema.columns tc
             where tc.table_schema = 'public' and tc.table_name = c.table_name
               and tc.column_name in ('created_at', 'changed_at', 'occurred_at', 'sent_at', 'uploaded_at')
               and tc.data_type like 'timestamp%'
             order by array_position(array['created_at', 'changed_at', 'occurred_at', 'sent_at', 'uploaded_at']::text[], tc.column_name::text)
             limit 1) as ts_col
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.data_type = 'uuid'
      and (c.column_name ~ '_by$' or c.column_name in ('author_id', 'actor_id'))
      and c.column_name <> 'updated_by'
      and c.table_name !~ '(backup|_removed_|dedupe)'
      and c.table_name not in ('usage_events', 'audit_log')
  loop
    continue when r.ts_col is null;
    execute format(
      'insert into _su_actions select a.%1$I, public.usage_area_for_table(%2$L), count(*) from public.%3$I a
         join _su_staff s on s.user_id = a.%1$I where a.%4$I >= $1 group by 1',
      r.column_name, r.table_name, r.table_name, r.ts_col)
    using v_since;
  end loop;
  insert into _su_actions
  select a.user_id, public.usage_area_for_table(lower(coalesce(nullif(a.module, ''), nullif(a.resource_type, ''), nullif(a.target_type, ''), ''))), count(*)
  from public.audit_log a join _su_staff s on s.user_id = a.user_id
  where a.created_at >= v_since
  group by 1, 2;

  with per_act as (
    select user_id,
           count(distinct (ts at time zone v_tz)::date) filter (where ts >= v_since) as days_30,
           count(distinct (ts at time zone v_tz)::date) filter (where ts >= v_week) as days_7,
           count(distinct date_trunc('hour', ts)) filter (where ts >= v_since) as hours_30,
           max(ts) as last_active
    from _su_act group by user_id
  ),
  per_actions as (
    select user_id, sum(n)::bigint as actions_30 from _su_actions group by user_id
  ),
  -- Main area: the screens they open most (once tracked), else where their actions are.
  view_areas as (
    select user_id, string_agg(module, ', ' order by n desc) as areas
    from (
      select e.user_id, coalesce(e.module, 'Other') as module, count(*) as n,
             row_number() over (partition by e.user_id order by count(*) desc) as rn
      from public.usage_events e join _su_staff s on s.user_id = e.user_id
      where e.occurred_at >= v_since
      group by 1, 2
    ) v where rn <= 2 group by user_id
  ),
  action_areas as (
    select user_id, string_agg(area, ', ' order by n desc) as areas
    from (
      select user_id, area, sum(n) as n, row_number() over (partition by user_id order by sum(n) desc) as rn
      from _su_actions group by 1, 2
    ) a where rn <= 2 group by user_id
  ),
  people as (
    select s.user_id, s.name, s.email,
           coalesce(pa.days_30, 0) as days_30,
           coalesce(pa.days_7, 0) as days_7,
           coalesce(pa.hours_30, 0) as hours_30,
           coalesce(px.actions_30, 0) as actions_30,
           coalesce(va.areas, aa.areas, s.area) as main_area,
           pa.last_active,
           case
             when s.created_at > now() - interval '7 days' then 'New'
             when coalesce(pa.days_30, 0) >= 12 then 'Daily'
             when coalesce(pa.days_30, 0) >= 5 then 'Regular'
             when coalesce(pa.days_30, 0) >= 2 then 'Light'
             when coalesce(pa.days_30, 0) = 1 then 'Once'
             else 'Inactive'
           end as status,
           s.created_at as account_created
    from _su_staff s
    left join per_act pa on pa.user_id = s.user_id
    left join per_actions px on px.user_id = s.user_id
    left join view_areas va on va.user_id = s.user_id
    left join action_areas aa on aa.user_id = s.user_id
  ),
  no_login as (
    select sp.full_name::text as name, lower(sp.email) as email, d.name as main_area
    from public.staff_profiles sp
    left join public.departments d on d.id = sp.department_id
    where coalesce(sp.is_active, true)
      and (sp.email is null or not exists (select 1 from auth.users u where lower(u.email) = lower(sp.email)))
  ),
  weeks as (
    select generate_series(date_trunc('week', v_launch::timestamp), date_trunc('week', now() at time zone v_tz), interval '1 week') as wk
  ),
  weekly as (
    select w.wk,
           (select count(distinct a.user_id) from _su_act a
             where (a.ts at time zone v_tz) >= w.wk and (a.ts at time zone v_tz) < w.wk + interval '1 week') as staff,
           (select count(distinct (a.user_id, date_trunc('hour', a.ts))) from _su_act a
             where (a.ts at time zone v_tz) >= w.wk and (a.ts at time zone v_tz) < w.wk + interval '1 week') as hours
    from weeks w
  )
  select jsonb_build_object(
    'generated_at', now(),
    'since', v_since,
    'week_start', v_week,
    'tracking_started', (select min(occurred_at) from public.usage_events),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', p.user_id, 'person', p.name, 'email', p.email, 'status', p.status,
        'days_30', p.days_30, 'days_7', p.days_7, 'hours_30', p.hours_30, 'actions_30', p.actions_30,
        'main_area', p.main_area, 'last_active', p.last_active, 'account_created', p.account_created
      ) order by p.days_30 desc, p.hours_30 desc, p.name) from people p), '[]'::jsonb)
      || coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', 'nl:' || coalesce(n.email, n.name), 'person', n.name, 'email', n.email, 'status', 'No login',
        'days_30', 0, 'days_7', 0, 'hours_30', 0, 'actions_30', 0,
        'main_area', n.main_area, 'last_active', null, 'account_created', null
      ) order by n.name) from no_login n), '[]'::jsonb),
    'weekly', coalesce((
      select jsonb_agg(jsonb_build_object('week', to_char(w.wk, 'YYYY-MM-DD'), 'staff', w.staff, 'hours', w.hours) order by w.wk)
      from weekly w), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.admin_staff_usage() from public, anon;
grant execute on function public.admin_staff_usage() to authenticated;

-- Sidebar switch for the page (Dev Settings → feature flags). 'live' = shown to
-- admins; set it back to 'dev' to hide it from everyone without dev access.
insert into public.feature_flags (key, name, description, icon, stage, released_at)
values ('staff-usage', 'Staff Usage', 'Admin page: who uses Polaris, how often and what they get done', 'chart-bar', 'live', now())
on conflict (key) do nothing;
