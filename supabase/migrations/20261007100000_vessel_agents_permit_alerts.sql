-- SD-0047 — several agents per vessel, each responsible for particular permits,
-- and permit expiry alerts at 60 / 30 / 7 days and on the day.
--
-- 1. yacht_agents: who looks after which permits on a vessel. A UAE vessel often
--    has the Abu Dhabi agency team on its FMA cruising permit and the Dubai team
--    on its DMA permit. `covers` lists permit types; empty = everything.
--    yachts.agent_user_id stays as the vessel's LEAD agent (the first one added),
--    kept in step both ways by triggers, so "My vessels", the client-portal alerts
--    and everything else that reads it keep working unchanged.
-- 2. permit_expiry_alerts: one row per alert sent, so each reminder goes once.
--    Keyed on the permit, its expiry date and the threshold — a renewed (re-dated)
--    permit gets fresh reminders.
-- 3. The vessel record's own "Cruising Permit Expiry" follows the vessel's cruising
--    permits forward when a permit is saved (never back: some renewals were only
--    typed into the vessel record). No back-fill here — that would push dozens of
--    vessels to SharePoint at once.

-- ── 1. Agents ────────────────────────────────────────────────────────────────
create table if not exists public.yacht_agents (
  id          uuid primary key default gen_random_uuid(),
  yacht_id    uuid not null references public.yachts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  covers      text[] not null default '{}',
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  unique (yacht_id, user_id)
);
create index if not exists yacht_agents_user_idx on public.yacht_agents (user_id);

alter table public.yacht_agents enable row level security;
drop policy if exists yacht_agents_select on public.yacht_agents;
create policy yacht_agents_select on public.yacht_agents
  for select to authenticated using (not public.is_portal_captain());
-- Same people who can change a vessel's agent today: admins and Agency editors.
drop policy if exists yacht_agents_write on public.yacht_agents;
create policy yacht_agents_write on public.yacht_agents
  for all to authenticated
  using (not public.is_portal_captain() and (public.has_role((select auth.uid()), 'admin'::app_role) or public.has_module_permission((select auth.uid()), 'agency', 'edit')))
  with check (not public.is_portal_captain() and (public.has_role((select auth.uid()), 'admin'::app_role) or public.has_module_permission((select auth.uid()), 'agency', 'edit')));

-- Everyone already named on a vessel becomes its first (lead) agent, covering everything.
insert into public.yacht_agents (yacht_id, user_id, created_at)
select id, agent_user_id, coalesce(agent_assigned_at, now())
from public.yachts where agent_user_id is not null
on conflict (yacht_id, user_id) do nothing;

-- The list changed → the lead is the earliest agent left.
create or replace function public.yacht_agents_sync_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_yacht uuid := coalesce(new.yacht_id, old.yacht_id);
  v_lead  uuid;
begin
  if pg_trigger_depth() > 1 then return null; end if;  -- started by yachts_agent_to_list
  select a.user_id into v_lead from public.yacht_agents a
   where a.yacht_id = v_yacht order by a.created_at, a.id limit 1;
  update public.yachts
     set agent_user_id = v_lead,
         agent_assigned_at = case when v_lead is null then null else now() end
   where id = v_yacht and agent_user_id is distinct from v_lead;
  return null;
end $$;
drop trigger if exists yacht_agents_sync_lead on public.yacht_agents;
create trigger yacht_agents_sync_lead
  after insert or update or delete on public.yacht_agents
  for each row execute function public.yacht_agents_sync_lead();

-- The single agent field changed (older screens, new-vessel form) → that person
-- replaces the previous lead in the list, and stays first.
create or replace function public.yachts_agent_to_list()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;  -- started by yacht_agents_sync_lead
  if tg_op = 'UPDATE' and new.agent_user_id is not distinct from old.agent_user_id then return null; end if;
  if tg_op = 'UPDATE' and old.agent_user_id is not null then
    delete from public.yacht_agents where yacht_id = new.id and user_id = old.agent_user_id;
  end if;
  if new.agent_user_id is not null then
    insert into public.yacht_agents (yacht_id, user_id, created_at, created_by)
    values (new.id, new.agent_user_id,
            coalesce((select min(created_at) from public.yacht_agents where yacht_id = new.id), now()) - interval '1 second',
            auth.uid())
    on conflict (yacht_id, user_id) do update set created_at = excluded.created_at;
  end if;
  return null;
end $$;
drop trigger if exists yachts_agent_to_list on public.yachts;
create trigger yachts_agent_to_list
  after insert or update of agent_user_id on public.yachts
  for each row execute function public.yachts_agent_to_list();

-- ── 2. Alerts sent ───────────────────────────────────────────────────────────
create table if not exists public.permit_expiry_alerts (
  alert_key       text primary key,
  permit_id       uuid references public.permits(id) on delete cascade,
  yacht_id        uuid references public.yachts(id) on delete cascade,
  permit_type     text not null,
  expiry_date     date not null,
  threshold       int  not null check (threshold in (60, 30, 7, 0)),
  days_left       int  not null,
  notified_users  uuid[] not null default '{}',
  emailed         text[] not null default '{}',
  sent_at         timestamptz not null default now()
);
create index if not exists permit_expiry_alerts_yacht_idx on public.permit_expiry_alerts (yacht_id);
alter table public.permit_expiry_alerts enable row level security;
drop policy if exists permit_expiry_alerts_select on public.permit_expiry_alerts;
create policy permit_expiry_alerts_select on public.permit_expiry_alerts
  for select to authenticated using (not public.is_portal_captain());
-- Written only by the daily job (service role).

-- ── 3. Vessel cruising expiry follows its cruising permits ──────────────────
create or replace function public.permits_sync_vessel_cruising_expiry()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_yacht uuid;
  v_exp   date;
begin
  foreach v_yacht in array array_remove(array[
    case when tg_op <> 'DELETE' and new.permit_type = 'cruising_mothership' then new.yacht_id end,
    case when tg_op <> 'INSERT' and old.permit_type = 'cruising_mothership' then old.yacht_id end
  ], null) loop
    select max(expiry_date) into v_exp from public.permits
     where yacht_id = v_yacht and permit_type = 'cruising_mothership'
       and status is distinct from 'cancelled' and expiry_date is not null;
    if v_exp is not null then
      update public.yachts set cruising_permit_expiry = v_exp
       where id = v_yacht and (cruising_permit_expiry is null or cruising_permit_expiry < v_exp);
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists permits_sync_vessel_cruising_expiry on public.permits;
create trigger permits_sync_vessel_cruising_expiry
  after insert or update of expiry_date, status, yacht_id, permit_type or delete on public.permits
  for each row execute function public.permits_sync_vessel_cruising_expiry();
