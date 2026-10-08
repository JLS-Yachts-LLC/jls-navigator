-- Clients can switch their own automated reports on and off (and say who they
-- go to) from the Client Portal — but only the reports staff have offered them
-- (client_can_manage). Every change, staff's or the client's, is recorded.
alter table public.vessel_report_subscriptions
  add column if not exists client_can_manage boolean not null default false,
  add column if not exists changed_by_kind text check (changed_by_kind in ('staff', 'client')),
  add column if not exists changed_by_name text,
  add column if not exists changed_at timestamptz;

grant update (client_can_manage) on public.vessel_report_subscriptions to authenticated;

create table if not exists public.vessel_report_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.vessel_report_subscriptions(id) on delete set null,
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  report_key text not null,
  actor_kind text not null check (actor_kind in ('staff', 'client', 'system')),
  actor_id uuid,
  actor_name text,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists vessel_report_events_yacht_idx on public.vessel_report_events (yacht_id, created_at desc);
alter table public.vessel_report_events enable row level security;
drop policy if exists "staff read" on public.vessel_report_events;
create policy "staff read" on public.vessel_report_events for select to authenticated
  using (not (select public.is_portal_captain()));
revoke all on public.vessel_report_events from anon;
revoke insert, update, delete on public.vessel_report_events from authenticated;
grant select on public.vessel_report_events to authenticated;

-- Staff edits (made through RLS, so auth.uid() is set) are stamped and logged
-- by these triggers. A client's change comes through /api/portal/reports with
-- the service role (no auth.uid()), which stamps and logs it itself.
-- (Function bodies as corrected in 20261008123645 — names come from display_name.)
create or replace function public.vessel_report_subscriptions_touch() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if auth.uid() is not null then
    select coalesce(nullif(display_name, ''), email) into v_name from public.user_profiles where user_id = auth.uid();
    new.changed_by_kind := 'staff';
    new.changed_by_name := v_name;
    new.changed_at := now();
  end if;
  return new;
end $$;

create or replace function public.vessel_report_subscriptions_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_actions text[] := '{}';
  r record;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  select coalesce(nullif(display_name, ''), email) into v_name from public.user_profiles where user_id = auth.uid();
  if tg_op = 'INSERT' then
    v_actions := array['opted_in'];
    r := new;
  elsif tg_op = 'DELETE' then
    v_actions := array['removed'];
    r := old;
  else
    r := new;
    if new.enabled is distinct from old.enabled then v_actions := v_actions || (case when new.enabled then 'switched_on' else 'switched_off' end); end if;
    if new.recipients is distinct from old.recipients or new.cc is distinct from old.cc then v_actions := v_actions || 'recipients_changed'; end if;
    if new.schedule is distinct from old.schedule then v_actions := v_actions || 'schedule_changed'; end if;
    if new.client_can_manage is distinct from old.client_can_manage then v_actions := v_actions || (case when new.client_can_manage then 'offered_to_client' else 'withdrawn_from_client' end); end if;
  end if;
  if cardinality(v_actions) > 0 then
    insert into public.vessel_report_events (subscription_id, yacht_id, report_key, actor_kind, actor_id, actor_name, action, detail)
    select case when tg_op = 'DELETE' then null else r.id end, r.yacht_id, r.report_key, 'staff', auth.uid(), v_name, a,
           jsonb_build_object('recipients', r.recipients, 'cc', r.cc, 'schedule', r.schedule, 'enabled', r.enabled)
    from unnest(v_actions) a;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists vessel_report_subscriptions_log on public.vessel_report_subscriptions;
create trigger vessel_report_subscriptions_log after insert or update or delete on public.vessel_report_subscriptions
  for each row execute function public.vessel_report_subscriptions_log();
revoke execute on function public.vessel_report_subscriptions_log() from public, anon, authenticated;
revoke execute on function public.vessel_report_subscriptions_touch() from public, anon, authenticated;
