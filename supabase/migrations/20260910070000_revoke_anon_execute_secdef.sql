-- Take every SECURITY DEFINER function in `public` off the unauthenticated API.
--
-- Supabase's advisor raised "Public Can Execute SECURITY DEFINER Function"
-- (anon_security_definer_function_executable) against 58 functions. These are all
-- internal business operations — creating port calls and bunker requests, advancing
-- placement workflows, retiring boats, issuing document numbers — and every one of
-- them was reachable at /rest/v1/rpc/<name> by anyone holding the publishable key,
-- which ships in the browser and is therefore public.
--
-- It was not theoretical. `crm_phone_lookup` (the 3CX screen-pop lookup, which
-- searches crew, staff, suppliers, vendors, agency contacts, emergency contacts,
-- the portal directory, placed crew and placement candidates) returned a real
-- person's name, phone, type and subtitle to an unauthenticated caller. Verified
-- before the fix, and 401 "permission denied for function" after it.
--
-- WHY `from public, anon` AND NOT `from anon`:
-- Functions are created with EXECUTE granted to PUBLIC, which shows in the ACL as
-- a bare `=X/postgres` entry. anon inherits from that, so `revoke ... from anon`
-- silently does nothing — it removes a grant anon never held directly. Only two of
-- the first 55 revokes took effect for exactly this reason. Revoking from PUBLIC is
-- what actually closes it; `anon` is included for the handful that also carried an
-- explicit anon grant.
--
-- SAFE BECAUSE: every one of the 58 also holds explicit `authenticated=X` and
-- `service_role=X` grants, so staff (browser RPCs) and the worker (service role)
-- are untouched — verified after the fact: staff still read 184 yachts / 3,793
-- permits and can call crm_phone_lookup and admin_user_stats; the AQUILA test
-- captain is still scoped to 1 vessel; /, /auth, /sign/$token and /d/$token all
-- still serve 200.
--
-- The RLS helpers (is_portal_captain, captain_yacht_ids, assert_not_portal_captain)
-- are revoked too. They are called from inside policies, but only ever on behalf of
-- an `authenticated` caller — the public pages (/sign/$token, /forms/fill/$token,
-- /qb-upload/$token, /d/$token) all read through server functions and API routes on
-- the service role, never the anon key. If an anon request ever does reach a policy
-- that calls one, it now errors instead of returning rows, which is the safe way to
-- fail.
--
-- Written as a loop so a function added later is covered by re-running this file.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;

-- Leaves the `authenticated_security_definer_function_executable` advisor warning
-- standing on 66 functions. That one is expected: those ARE the staff RPCs the app
-- calls from the browser, and they carry their own guards (assert_not_portal_captain
-- wrappers, internal admin checks). Revoking `authenticated` would break the app.
