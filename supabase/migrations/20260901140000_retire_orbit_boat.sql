-- Let the ORBIT team remove a boat they added by mistake.
--
-- Nothing in ORBIT could be deleted except projects and tasks: boats had no
-- delete in the UI and no function behind it, so a boat entered in error was
-- stuck there permanently -- for everyone, global admins included.
--
-- This retires rather than deletes. orbit_boats already carries is_active, and
-- v_orbit_boat_home (what the hub reads) already filters on it, so flipping the
-- flag takes the boat off the hub while its jobs, defects and checklist history
-- stay intact and recoverable.
--
-- orbit_boats has RLS with a SELECT policy only, so writes have to go through a
-- SECURITY DEFINER function -- same guarded/__unguarded pair as
-- create_orbit_boat and update_orbit_boat_profile, and the same 'edit' level.
--
-- Idempotent: create or replace on both functions.

create or replace function public.retire_orbit_boat__unguarded(p_boat_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.has_module_permission(auth.uid(), 'orbit', 'edit') then
    raise exception 'Not authorized to remove boats';
  end if;

  update public.orbit_boats
     set is_active = false,
         updated_at = now()
   where id = p_boat_id;
end; $function$;

create or replace function public.retire_orbit_boat(p_boat_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $function$select public.assert_not_portal_captain(); select public.retire_orbit_boat__unguarded($1);$function$;
