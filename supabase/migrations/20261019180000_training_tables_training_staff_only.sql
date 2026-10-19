-- Training data is for Training staff only.
--
-- Every training_* table was "any authenticated user": captains, guests and
-- Crew Academy learners were already blocked by the restrictive
-- portal_captain_* policies (is_portal_captain() covers all three), but ANY
-- staff login, even one without the Training module, could read the school's
-- students (names, mobiles, addresses, payments), instructors' ID and visa
-- expiries, and crew training records.
--
-- Now: reading or changing these tables needs the Training module, by the same
-- rule as requireAccess() and the sidebar (has_module_permission: a personal
-- grant in user_module_access, else the department default; global admins
-- always pass). On 19 Oct 2026 that is the global admins plus the admin
-- (edit) and crew_care (view) departments.
--
-- Writes use the same check as reads, not a higher level: the Training screens
-- write straight from the browser with no level check of their own, and
-- crew_care's department default is 'view' — requiring 'edit' here would stop
-- the Training team editing the calendar and students.
--
-- training_certifications keeps the one outside reader it had: portal captains
-- see their own vessel's crew certificates (Crew rota / calendar, MFA'd), the
-- same condition as the existing portal_captain_own_crew_select policy.
-- Server code (service role) is unaffected. The restrictive portal_captain_*
-- policies are left in place as a second fence.

create or replace function public.can_access_training()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select auth.uid() is not null
     and not public.is_portal_captain()
     and public.has_module_permission(auth.uid(), 'training', 'view')
$$;
revoke execute on function public.can_access_training() from public, anon;
grant execute on function public.can_access_training() to authenticated;

-- ── The school (Monday mirror + calendar), documents and attachments ────────
do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'training_students', 'training_instructors', 'training_courses', 'training_classes',
    'training_calendar_events', 'training_attachments', 'training_documents',
    'training_document_folders', 'training_records', 'training_certifications'
  ] loop
    -- Drop every PERMISSIVE policy (the "any authenticated user" ones); keep the restrictive fences.
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = t and permissive = 'PERMISSIVE' loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format(
      'create policy training_staff_all on public.%I for all to authenticated
         using ((select public.can_access_training())) with check ((select public.can_access_training()))', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ── Portal captains: their own crew's certificates, read-only ───────────────
create policy portal_captain_own_crew_read on public.training_certifications
  for select to authenticated
  using (
    public.is_portal_captain()
    and public.portal_aal2()
    and crew_member_id in (
      select cm.id from public.crew_members cm
      where cm.yacht_id in (select public.captain_yacht_ids())
    )
  );
