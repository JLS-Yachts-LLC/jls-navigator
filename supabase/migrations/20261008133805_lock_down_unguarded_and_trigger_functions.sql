-- Security advisor tidy-up, part 2 (8 Oct 2026).
--
-- 1. The "__unguarded" bodies were callable by any signed-in user — including
--    client-portal logins — straight past the permission check in their guarded
--    wrappers (qbo_finance_dashboard / retire_orbit_boat). The wrappers are
--    SECURITY DEFINER, so they keep calling these as the owner.
revoke execute on function public.qbo_finance_dashboard__unguarded(integer, text) from public, anon, authenticated;
grant execute on function public.qbo_finance_dashboard__unguarded(integer, text) to service_role;
revoke execute on function public.retire_orbit_boat__unguarded(uuid) from public, anon, authenticated;
grant execute on function public.retire_orbit_boat__unguarded(uuid) to service_role;

-- 2. Trigger functions are never called over the API; triggers fire regardless
--    of EXECUTE (checked: a revoked trigger function still fires for a signed-in
--    user's insert).
do $$
declare f text;
begin
  foreach f in array array[
    'audit_row_change()', 'handle_new_auth_user()', 'log_visa_movement()', 'log_visa_status_change()',
    'mark_sharepoint_dirty()', 'portal_chat_after_message()', 'sync_display_name_from_profile()',
    'sync_orbit_boat_from_small_boat()', 'sync_primary_department()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
