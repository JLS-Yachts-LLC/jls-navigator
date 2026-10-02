-- Orbit 2 — role-based locks, enforced by the database rather than the screen.
--
-- Until now "Orbit 2 admin" was decided in the browser, by first name against
-- three people (Lovin, Rusty, Keith) who have no Polaris accounts, or by being a
-- global admin. So in practice no one in the operations office could use the
-- admin-only controls — and because the check lived only in the page, anyone who
-- went around the page could still rewrite a Remark or mark a job Complete.
--
-- One definition, used by both the page and these triggers:
--
--   Orbit 2 admin = "Admin" on the Orbit module (Admin panel → user → Module
--                   access), or a global admin. Granted per person; nobody holds
--                   it by default.
--
-- Locked here:
--   1. Status — "Working On It" and "Complete" belong to the field crew's Attend
--      and Done. An admin may set them from the desktop (the override the client
--      asked for), and each override is written to Remarks so it is on record.
--      Assigned crew may make the two normal forward steps. Moving a job back
--      off "Complete" is admin-only, since that clears its completion time.
--   2. Remarks — editable by an admin only; edited_at is stamped here and cannot
--      be faked. Team Comments are the crew's record and are never editable.
--      Author, time and parent record of any log entry are fixed.
--   3. Direct deletion of a Remark or Team Comment is admin-only. Deleting a
--      whole job still removes its log (the foreign-key cascade is allowed).
--
-- Writes with no end user behind them (service role, SQL editor) are not policed:
-- there is no "who" to check, and RLS already keeps anonymous callers out.

create or replace function public.orbit2_is_admin()
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select auth.uid() is not null
     and coalesce(public.has_module_permission(auth.uid(), 'orbit', 'admin'), false)
$fn$;

grant execute on function public.orbit2_is_admin() to authenticated;

/** The signed-in user's name as the field roster spells it — first word, lower-cased. */
create or replace function public.orbit2_my_roster_name()
returns text
language sql stable security definer set search_path = public
as $fn$
  select lower(split_part(trim(coalesce(display_name, '')), ' ', 1))
  from public.user_profiles where user_id = auth.uid()
$fn$;

-- ── 1. Status ───────────────────────────────────────────────────────────────
create or replace function public.orbit2_guard_status()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_old  text := case when tg_op = 'UPDATE' then old.status end;
  v_me   text;
  v_crew boolean;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;

  -- Only transitions into, or back out of, the crew-owned states are locked.
  if not (new.status in ('Working On It', 'Complete') or v_old = 'Complete') then
    return new;
  end if;

  v_me := public.orbit2_my_roster_name();
  v_crew := v_me <> '' and exists (
    select 1 from unnest(coalesce(new.assigned_team, '{}')) t where lower(t) = v_me
  );

  -- The crew's own forward steps: Attend, then Done.
  if v_crew and (
       (new.status = 'Working On It' and v_old = 'Scheduled/Assigned')
    or (new.status = 'Complete'      and v_old = 'Working On It')
  ) then
    return new;
  end if;

  if public.orbit2_is_admin() then
    -- On record, in the same Remarks log the office reads. Only on update: a new
    -- record has no row yet for the note to hang off.
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
      when v_old = 'Complete' then 'Only an Orbit 2 admin can reopen a completed job.'
      else format('Only an Orbit 2 admin can set "%s" from the desktop — the field crew set it with Attend and Done.', new.status)
    end;
end $fn$;

drop trigger if exists orbit2_projects_status_guard on public.orbit2_projects;
create trigger orbit2_projects_status_guard
  before insert or update of status on public.orbit2_projects
  for each row execute function public.orbit2_guard_status();

-- ── 2 & 3. Remarks and Team Comments ────────────────────────────────────────
create or replace function public.orbit2_guard_notes()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if auth.uid() is null then return coalesce(new, old); end if;

  if tg_op = 'DELETE' then
    -- Depth > 1 means this delete comes from the parent record being deleted
    -- (the ON DELETE CASCADE) rather than a log entry being picked off.
    if pg_trigger_depth() > 1 or public.orbit2_is_admin() then return old; end if;
    raise exception using errcode = '42501',
      message = 'Only an Orbit 2 admin can delete a Remark or Team Comment.';
  end if;

  if new.project_id   is distinct from old.project_id
  or new.boat_task_id is distinct from old.boat_task_id
  or new.kind         is distinct from old.kind
  or new.author       is distinct from old.author
  or new.created_at   is distinct from old.created_at
  or new.created_by   is distinct from old.created_by then
    raise exception using errcode = '42501',
      message = 'The author, time and record of a log entry cannot be changed.';
  end if;

  if new.body is distinct from old.body then
    if old.kind <> 'remark' then
      raise exception using errcode = '42501',
        message = 'Team Comments are the field crew''s record and cannot be edited.';
    end if;
    if not public.orbit2_is_admin() then
      raise exception using errcode = '42501',
        message = 'Only an Orbit 2 admin can edit a Remark.';
    end if;
    new.edited_at := now();
  else
    -- edited_at is the system's to set; it cannot be written directly.
    new.edited_at := old.edited_at;
  end if;
  return new;
end $fn$;

drop trigger if exists orbit2_notes_guard on public.orbit2_notes;
create trigger orbit2_notes_guard
  before update or delete on public.orbit2_notes
  for each row execute function public.orbit2_guard_notes();
