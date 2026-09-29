-- Orbit 2 — deleting a Project List / Bunkering record is admin-only.
--
-- The Project List gains a Delete button (client request, 29 Sep 2026). Deleting
-- a job takes its Remarks, Team Comments and attachments with it, so it is held
-- to the same rule as editing a Remark or changing a completed job's status:
-- Orbit 2 admin only, enforced here as well as on the page, so it cannot be
-- done by going around the page. Writes with no end user behind them (service
-- role, SQL editor) are not policed, as with the other Orbit 2 guards.
create or replace function public.orbit2_guard_delete()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if auth.uid() is null or public.orbit2_is_admin() then return old; end if;
  raise exception using errcode = '42501',
    message = format('Only an Orbit 2 admin can delete %s.', old.task_id);
end $fn$;

drop trigger if exists orbit2_projects_delete_guard on public.orbit2_projects;
create trigger orbit2_projects_delete_guard
  before delete on public.orbit2_projects
  for each row execute function public.orbit2_guard_delete();
