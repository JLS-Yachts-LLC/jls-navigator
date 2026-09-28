-- Orbit 2 — fix: the status lock refused every new record made by a non-admin.
--
-- 20260928110000 compared the previous status with "v_old = 'Complete'". On an
-- INSERT there is no previous status, so that comparison is NULL, not false —
-- and "false OR NULL" is NULL, "NOT NULL" is NULL, and an IF on NULL does not
-- run. The early exit for ordinary statuses was skipped, the check fell through
-- to the refusal, and every Project List or Bunkering record created by anyone
-- without Orbit 2 admin failed with 42501 ("Could not save" on screen), whatever
-- status was chosen. Editing existing records was unaffected. The tests before
-- release covered updates only.
--
-- Every condition is now a boolean that cannot be NULL. Behaviour is otherwise
-- identical: re-tested as a non-admin, an admin and assigned crew — new records
-- save with any ordinary status; only "Working On It" / "Complete" are refused
-- on a new record; the override, Attend/Done and reopen rules are unchanged.
--
-- Applied directly on 2026-09-28. The Task ID sequences, advanced by the refused
-- saves and by rolled-back tests (sequences are not transactional), were reset
-- to the highest number in use at the same time — a one-off, not repeated here.

create or replace function public.orbit2_guard_status()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_old  text := case when tg_op = 'UPDATE' then old.status end;
  v_reopening boolean := coalesce(v_old = 'Complete', false);
  v_me   text;
  v_crew boolean;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;

  -- Only transitions into, or back out of, the crew-owned states are locked.
  if not (coalesce(new.status in ('Working On It', 'Complete'), false) or v_reopening) then
    return new;
  end if;

  v_me := coalesce(public.orbit2_my_roster_name(), '');
  v_crew := v_me <> '' and exists (
    select 1 from unnest(coalesce(new.assigned_team, '{}')) t where lower(t) = v_me
  );

  -- The crew's own forward steps: Attend, then Done. Never on a new record.
  if v_crew and coalesce(
       (new.status = 'Working On It' and v_old = 'Scheduled/Assigned')
    or (new.status = 'Complete'      and v_old = 'Working On It'), false) then
    return new;
  end if;

  if public.orbit2_is_admin() then
    if tg_op = 'UPDATE' then
      insert into public.orbit2_notes (project_id, kind, author, body, created_by)
      values (
        new.id, 'remark',
        coalesce((select nullif(trim(display_name), '') from public.user_profiles where user_id = auth.uid()), 'Admin'),
        format('Status set to "%s" by admin override (was "%s").', new.status, coalesce(v_old, '—')),
        auth.uid()
      );
    end if;
    return new;
  end if;

  raise exception using
    errcode = '42501',
    message = case
      when v_reopening then 'Only an Orbit 2 admin can reopen a completed job.'
      else format('Only an Orbit 2 admin can set "%s" from the desktop — the field crew set it with Attend and Done.', new.status)
    end;
end $fn$;
