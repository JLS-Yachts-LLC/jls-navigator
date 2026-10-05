-- Close six tables a client-portal login could read and write.
--
-- Found by the boat-owner isolation sweep (5 Oct 2026): simulating an
-- MFA-verified portal login against every public table showed orbit2 checklist,
-- attendance and small-boat-document rows readable. Every portal login was
-- affected, yacht captains included, not just the new boat owners.
--
-- Cause: these tables were created after the 9 Sep default-deny fence
-- (20260909140000) with their own `portal_captain_block` policy, but written
-- without `as restrictive`. A PERMISSIVE policy is OR'd with the table's
-- `authenticated_all`, so it blocks nothing. Thirteen other tables carry the
-- same permissive mistake but are already covered by the restrictive
-- `portal_captain_denied` fence; these six were not.
--
-- Fix: the same restrictive `portal_captain_denied` policy the default-deny
-- migration uses. Rule for new tables: a captain fence is only a fence when it
-- says `as restrictive`.

do $fence$
declare t text;
begin
  foreach t in array array[
    'orbit2_attendance', 'orbit2_boat_checklist', 'orbit2_boat_checklist_forms',
    'orbit2_checklist_forms', 'orbit2_checklist_templates', 'small_boat_documents'
  ] loop
    execute format('drop policy if exists portal_captain_denied on public.%I', t);
    execute format(
      'create policy portal_captain_denied on public.%I as restrictive for all to authenticated '
      || 'using ((select not public.is_portal_captain())) '
      || 'with check ((select not public.is_portal_captain()))', t);
  end loop;
end $fence$;
