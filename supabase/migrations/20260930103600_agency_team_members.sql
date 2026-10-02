-- The Agency team: the people a vessel can be handed to as its Responsible Agent.
--
-- Defined as whoever can edit Agency vessels — the same has_module_permission
-- check the yachts UPDATE policy uses, so the picker can never offer someone
-- who couldn't then work the vessel — minus the admins, whose edit rights come
-- from being an admin rather than from being on the team. Today that is Hilary,
-- Geraldine, Marcian, Regie and Ruby, via the operations department; it follows
-- the department automatically as people join or leave.
--
-- SECURITY DEFINER because department_permissions and other users' module grants
-- aren't readable by the caller. It returns only names, which every signed-in
-- user can already read from user_profiles.
create or replace function public.agency_team_members()
returns table (user_id uuid, label text)
language sql stable security definer set search_path = public as $$
  select up.user_id, coalesce(nullif(trim(up.display_name), ''), up.email, 'Unnamed user')
  from user_profiles up
  where coalesce(up.active, true)
    and public.has_module_permission(up.user_id, 'agency', 'edit')
    and not public.is_polaris_global_admin(up.user_id)
    and up.department is distinct from 'admin'
  order by 2;
$$;

revoke execute on function public.agency_team_members() from public, anon;
grant execute on function public.agency_team_members() to authenticated;
