-- ⚠️ NOT YET APPLIED — needs a reviewed, manual apply (large blast radius).
--
-- Captain portal lockdown, part 3: guard SECURITY DEFINER RPCs.
-- These ~43 functions run as their owner and BYPASS row-level security, so a
-- portal captain could call e.g. qbo_finance_dashboard() or create_port_call()
-- directly via the API even though every table is locked down.
--
-- This migration renames each one to <name>__unguarded (client execute revoked,
-- service_role keeps it) and installs a same-signature SECURITY DEFINER wrapper
-- that raises for portal captains and forwards for everyone else. Staff and
-- server code keep calling the original names and notice nothing.
--
-- Drift note: a later `create or replace function <original name>` in another
-- migration will replace the WRAPPER — re-run this migration afterwards to
-- re-guard (it is idempotent; already-wrapped functions are skipped).

do $$
declare
  f record;
  i int;
  argfwd text;
  newname text;
begin
  for f in
    select p.oid, p.proname, p.pronargs,
           pg_get_function_arguments(p.oid) as fargs,
           pg_get_function_identity_arguments(p.oid) as iargs,
           pg_get_function_result(p.oid) as fret
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
      and p.provariadic = 0 and p.proargmodes is null
      and pg_get_function_result(p.oid) <> 'trigger'
      and p.proname not in (
        'has_role','has_module_permission','is_polaris_global_admin',
        'is_portal_captain','captain_yacht_ids','portal_aal2','assert_not_portal_captain')
      and p.proname not like '%\_\_unguarded'
  loop
    begin
      newname := f.proname || '__unguarded';
      if exists (select 1 from pg_proc p2 join pg_namespace n2 on n2.oid = p2.pronamespace
                 where n2.nspname = 'public' and p2.proname = newname) then
        continue;
      end if;

      argfwd := '';
      if f.pronargs > 0 then
        for i in 1..f.pronargs loop
          argfwd := argfwd || case when i > 1 then ', ' else '' end || '$' || i;
        end loop;
      end if;

      execute format('alter function public.%I(%s) rename to %I', f.proname, f.iargs, newname);
      execute format('revoke execute on function public.%I(%s) from public, anon, authenticated',
                     newname, f.iargs);
      execute format('grant execute on function public.%I(%s) to service_role', newname, f.iargs);
      execute format(
        'create function public.%I(%s) returns %s language sql security definer set search_path = public as %L',
        f.proname, f.fargs, f.fret,
        format('select public.assert_not_portal_captain(); select public.%I(%s);', newname, argfwd));
    exception when others then
      raise notice 'lockdown: skipped %: %', f.proname, sqlerrm;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
