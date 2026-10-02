-- Supabase's default privileges grant EXECUTE to anon and authenticated
-- directly, so `revoke ... from public` alone leaves both able to call these.
-- Revoke from the roles themselves, then grant back only what is intended.
revoke execute on function public.yacht_it_sync_changes(timestamptz) from anon, authenticated;
revoke execute on function public.yacht_it_sync_apply(jsonb)         from anon, authenticated;
revoke execute on function public.yacht_it_record_deletion()          from anon, authenticated;
revoke execute on function public.yacht_it_touch_updated_at()         from anon, authenticated;
revoke execute on function public.yacht_it_sync_status()              from anon;

grant execute on function public.yacht_it_sync_changes(timestamptz) to service_role;
grant execute on function public.yacht_it_sync_apply(jsonb)         to service_role;
grant execute on function public.yacht_it_sync_status()             to authenticated;
