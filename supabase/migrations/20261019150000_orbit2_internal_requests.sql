-- Orbit 2 — Project → Internal Request (client request, 19 Oct 2026).
--
-- A request from one office department to another — Logistic asking IT for a
-- laptop, Accounts asking Operation for a delivery note — logged and tracked
-- like any other Orbit 2 record. Office-only: it lives on the web screen, not
-- in the field app.
--
--   Task ID      INTREQ-26-00001 — prefix, 2-digit year, 5-digit number that
--                restarts at 00001 each year. Generated, never typed.
--   Department   one of the thirteen departments below
--   Status       Assigned → On-going → Completed
--   Description, Assigned Team, Requestor, Date, Location
--
-- RLS is the same shape as orbit2_projects (20260922140100): any signed-in staff
-- member can work it, and a client-portal / guest / Crew Academy login never
-- can (restrictive portal_captain_block — is_portal_captain() covers all three
-- outside logins). Deleting is Orbit 2 admin only, enforced by the same
-- orbit2_guard_delete() trigger the Project List uses (20260929090000).

create table if not exists public.orbit2_internal_requests (
  id             uuid primary key default gen_random_uuid(),
  task_id        text unique,
  department     text not null check (department in (
                   'Logistic', 'Operation', 'Admin', 'Managers', 'Port Agency', 'Crewcare',
                   'HR', 'Warehouse', 'Waypoint', 'Accounts', 'Provisioning', 'IT', 'Marketing')),
  status         text not null default 'Assigned'
                 check (status in ('Assigned', 'On-going', 'Completed')),
  description    text not null,
  assigned_team  text[] not null default '{}',
  requestor_name text,
  request_date   date,
  location       text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists orbit2_internal_requests_status_idx on public.orbit2_internal_requests (status);
create index if not exists orbit2_internal_requests_date_idx   on public.orbit2_internal_requests (request_date);
create index if not exists orbit2_internal_requests_dept_idx   on public.orbit2_internal_requests (department);

-- ── Task ID: INTREQ-<YY>-<NNNNN>, counting per year ─────────────────────────
-- Same approach as the boat job numbers (20260929100000): the next number is
-- one past the highest already issued this year, and a transaction-scoped
-- advisory lock keyed on the year serialises two requests saved at the same
-- moment so they cannot be handed the same number. Set on insert only; an
-- update never renumbers a request.
create or replace function public.orbit2_assign_intreq_task_id()
returns trigger language plpgsql set search_path = public as $fn$
declare v_year text := to_char(now(), 'YY'); v_prefix text; v_next int;
begin
  if tg_op = 'INSERT' then
    if new.task_id is null or new.task_id = '' then
      v_prefix := 'INTREQ-' || v_year || '-';
      perform pg_advisory_xact_lock(hashtext('orbit2_intreq_task_id:' || v_year));
      select coalesce(max(substring(task_id from '^INTREQ-' || v_year || '-(\d+)$')::int), 0) + 1
        into v_next from public.orbit2_internal_requests
        where task_id ~ ('^INTREQ-' || v_year || '-\d+$');
      new.task_id := v_prefix || lpad(v_next::text, 5, '0');
    end if;
  else
    -- The number is fixed once issued.
    new.task_id := old.task_id;
  end if;
  new.updated_at := now();
  return new;
end $fn$;

revoke execute on function public.orbit2_assign_intreq_task_id() from public, anon, authenticated;
grant execute on function public.orbit2_assign_intreq_task_id() to service_role;

drop trigger if exists orbit2_internal_requests_biu on public.orbit2_internal_requests;
create trigger orbit2_internal_requests_biu
  before insert or update on public.orbit2_internal_requests
  for each row execute function public.orbit2_assign_intreq_task_id();

-- ── Delete: Orbit 2 admin only (same guard as the Project List) ─────────────
drop trigger if exists orbit2_internal_requests_delete_guard on public.orbit2_internal_requests;
create trigger orbit2_internal_requests_delete_guard
  before delete on public.orbit2_internal_requests
  for each row execute function public.orbit2_guard_delete();

-- ── RLS — same shape as every other Orbit 2 table ───────────────────────────
alter table public.orbit2_internal_requests enable row level security;

drop policy if exists authenticated_all on public.orbit2_internal_requests;
create policy authenticated_all on public.orbit2_internal_requests for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

-- A fence is only a fence when it says `as restrictive` (20261005150000).
drop policy if exists portal_captain_block on public.orbit2_internal_requests;
create policy portal_captain_block on public.orbit2_internal_requests as restrictive for all to authenticated
  using ((select not public.is_portal_captain()))
  with check ((select not public.is_portal_captain()));
