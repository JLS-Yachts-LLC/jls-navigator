-- Security advisor tidy-up (8 Oct 2026).
--
-- 1. Trigger functions are not something anyone should call over the API.
--    Postgres doesn't check EXECUTE when a trigger fires, so revoking it changes
--    nothing for the writes they guard. Revoke from PUBLIC too: anon/authenticated
--    otherwise keep it through PUBLIC.
do $$
declare f text;
begin
  foreach f in array array[
    'orbit2_guard_delete()', 'orbit2_guard_notes()', 'orbit2_guard_status()',
    'permits_sync_vessel_cruising_expiry()', 'yacht_agents_sync_lead()', 'yachts_agent_to_list()',
    'orbit2_assign_task_id()', 'orbit2_assign_noc_ref()', 'touch_small_boat_documents()',
    'orbit2_touch_boat_inventory()', 'orbit2_assign_boat_job_no()', 'orbit2_boat_prefix_default()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- 2. Orbit 2's "am I an admin / who am I" checks: signed-in staff call them
--    (orbit2-identity.ts); signed-out visitors have no use for them.
revoke execute on function public.orbit2_is_admin() from public, anon;
grant execute on function public.orbit2_is_admin() to authenticated, service_role;
revoke execute on function public.orbit2_my_roster_name() from public, anon;
grant execute on function public.orbit2_my_roster_name() to authenticated, service_role;

-- 3. Pin the search path on the functions that didn't set one.
alter function public.orbit2_assign_task_id() set search_path = public;
alter function public.orbit2_assign_noc_ref() set search_path = public;
alter function public.touch_small_boat_documents() set search_path = public;
alter function public.orbit2_touch_boat_inventory() set search_path = public;
alter function public.orbit2_assign_boat_job_no() set search_path = public;
alter function public.orbit2_default_job_prefix(text) set search_path = public;
alter function public.orbit2_boat_prefix_default() set search_path = public;
