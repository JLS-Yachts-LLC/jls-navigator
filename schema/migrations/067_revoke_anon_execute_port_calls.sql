-- Migration 067: Actually revoke anon EXECUTE (066 was insufficient)
--
-- Migration 066 ran `revoke all on function ... from public`, but Supabase
-- grants EXECUTE to the `anon` role explicitly and separately by default
-- (ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon,
-- authenticated) for every new function in the public schema — this is
-- independent of the PUBLIC pseudo-role grant and survives a `revoke ...
-- from public`. Confirmed via information_schema.routine_privileges: anon
-- still had EXECUTE on all six functions after 066. Revoking the correct,
-- explicit grant here.

revoke execute on function public.create_port_call(uuid, uuid, timestamptz, timestamptz, uuid, uuid) from anon;
revoke execute on function public.start_port_call_workflow(uuid, text) from anon;
revoke execute on function public.advance_workflow_step(uuid, text, text, text) from anon;
revoke execute on function public.update_port_call_document_status(uuid, text, text) from anon;
revoke execute on function public.is_polaris_global_admin(uuid) from anon;
revoke execute on function public.handle_new_auth_user() from anon;
