-- Captain portal lockdown, part 1+2 (APPLIED — additive only):
-- 1. Every non-portal public table gets a RESTRICTIVE policy that denies portal
--    captains all access (staff unaffected — is_portal_captain() is false for them).
-- 2. Public views run with security_invoker so they respect the caller's RLS.
-- Part 3 (SECURITY DEFINER RPC guards) lives in the next migration and needs a
-- reviewed, manual apply — see 20260702100002_captain_portal_rpc_guard.sql.

do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in (
        'captain_accounts','captain_requests','captain_request_messages','portal_directory',
        'yachts','crew_members','permits','visa_applications')
  loop
    if not exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = t.relname
                     and policyname = 'portal_captain_block') then
      execute format(
        'create policy portal_captain_block on public.%I as restrictive for all to authenticated
         using (not public.is_portal_captain()) with check (not public.is_portal_captain())',
        t.relname);
    end if;
  end loop;
end $$;

do $$
declare v record;
begin
  for v in select viewname from pg_views where schemaname = 'public' loop
    execute format('alter view public.%I set (security_invoker = true)', v.viewname);
  end loop;
end $$;
