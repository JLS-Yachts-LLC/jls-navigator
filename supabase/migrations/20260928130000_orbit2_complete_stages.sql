-- Orbit 2 — completion stages and Re-assign (client request, 28 Sep 2026).
--
--   "Complete"                 → renamed "Complete - Team": what the crew's Done sets.
--   "Complete - To be Invoiced" (new, admin)  → the office has it, not yet billed.
--   "Complete - Invoiced"       (new, admin)  → billed; the job is finished.
--   "Re-assigned"               (new, admin)  → sent back to the crew for more work
--                                               or amendments. It reappears in their
--                                               field app to Attend again.
--
-- The completion time is stamped when a job first reaches any "Complete - …"
-- stage and kept as it moves through the invoicing stages; it is cleared only if
-- the job leaves completion altogether (Re-assigned), and stamped again when the
-- crew next press Done.
--
-- The old value "Complete" is still accepted on write and turned into
-- "Complete - Team", so a field app loaded before this release keeps working.

-- ── Completion stamp + legacy value ─────────────────────────────────────────
create or replace function public.orbit2_assign_task_id()
returns trigger language plpgsql as $fn$
begin
  -- A client built before the rename still sends "Complete".
  if new.status = 'Complete' then new.status := 'Complete - Team'; end if;

  if new.task_id is null or new.task_id = '' then
    new.task_id := case when new.record_type = 'bunkering'
      then 'BUNK' || to_char(now(), 'YY') || '-' || lpad(nextval('public.orbit2_bunk_seq')::text, 4, '0')
      else 'OPS'  || to_char(now(), 'YY') || '-' || lpad(nextval('public.orbit2_ops_seq')::text,  4, '0')
    end;
  end if;

  if new.status like 'Complete - %' then
    if new.work_completed_at is null then new.work_completed_at := now(); end if;
  else
    new.work_completed_at := null;
  end if;
  new.updated_at := now();
  return new;
end $fn$;

-- ── Who may set what ────────────────────────────────────────────────────────
create or replace function public.orbit2_guard_status()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  crew_owned constant text[] := array['Working On It', 'Complete - Team'];
  admin_only constant text[] := array['Re-assigned', 'Complete - To be Invoiced', 'Complete - Invoiced'];
  v_old  text := case when tg_op = 'UPDATE' then old.status end;
  -- Non-NULL booleans throughout: on INSERT v_old is NULL, and a NULL in these
  -- conditions once refused every new record (see 20260928120000).
  v_was_complete boolean := coalesce(v_old like 'Complete%', false);
  v_locked_new   boolean := coalesce(new.status = any (crew_owned || admin_only), false);
  v_me   text;
  v_crew boolean;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;

  -- Ordinary statuses, on a job that is not complete: anyone.
  if not (v_locked_new or v_was_complete) then return new; end if;

  v_me := coalesce(public.orbit2_my_roster_name(), '');
  v_crew := v_me <> '' and exists (
    select 1 from unnest(coalesce(new.assigned_team, '{}')) t where lower(t) = v_me
  );

  -- The crew's own steps: Attend (from Scheduled/Assigned, or Re-assigned), then Done.
  if v_crew and coalesce(
       (new.status = 'Working On It'   and v_old in ('Scheduled/Assigned', 'Re-assigned'))
    or (new.status = 'Complete - Team' and v_old = 'Working On It'), false) then
    return new;
  end if;

  if public.orbit2_is_admin() then
    if tg_op = 'UPDATE' then
      insert into public.orbit2_notes (project_id, kind, author, body, created_by)
      values (
        new.id, 'remark',
        coalesce((select nullif(trim(display_name), '') from public.user_profiles where user_id = auth.uid()), 'Admin'),
        case when new.status = any (crew_owned)
          then format('Status set to "%s" by admin override (was "%s").', new.status, coalesce(v_old, '—'))
          else format('Status changed to "%s" (was "%s").', new.status, coalesce(v_old, '—'))
        end,
        auth.uid()
      );
    end if;
    return new;
  end if;

  raise exception using
    errcode = '42501',
    message = case
      when v_was_complete then 'Only an Orbit 2 admin can change the status of a completed job.'
      when new.status = any (admin_only) then format('Only an Orbit 2 admin can set "%s".', new.status)
      else format('Only an Orbit 2 admin can set "%s" from the desktop — the field crew set it with Attend and Done.', new.status)
    end;
end $fn$;

-- ── The allowed list, and the rename of existing rows ───────────────────────
alter table public.orbit2_projects drop constraint if exists orbit2_projects_status_check;

-- No end user here, so the guard stands aside; the stamp trigger keeps each
-- job's completion time, since the new status is still a "Complete - …" stage.
update public.orbit2_projects set status = 'Complete - Team' where status = 'Complete';

alter table public.orbit2_projects add constraint orbit2_projects_status_check check (status in (
  'Not Yet Initiated', 'Quote in Process/Approval', 'Quotation Approved', 'On Hold', 'Cancelled',
  'Scheduled/Assigned', 'Re-assigned', 'Working On It',
  'Complete - Team', 'Complete - To be Invoiced', 'Complete - Invoiced'
));
