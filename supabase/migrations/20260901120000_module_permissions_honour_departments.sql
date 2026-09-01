-- Make the database's module-permission check honour department permissions.
--
-- Polaris had two permission systems that disagreed. The app works out what you
-- can do from department_permissions plus your own per-user grants
-- (lib/auth/claims.ts), which is why buttons like ORBIT's "Add boat" appear. But
-- every guarded write goes through has_module_permission, which only ever looked
-- at global-admin status or a per-user user_module_access row -- it never read
-- department_permissions. With zero user_module_access rows for 'orbit', nobody
-- outside the five global admins could actually save a boat: the form opened and
-- the insert was refused with "Not authorized to create boats".
--
-- This teaches the database the same precedence the app already applies:
--   1. Global admins pass everything.
--   2. A per-user grant is an OVERRIDE -- it wins outright, even when it is LOWER
--      than the department default, and active = false is an explicit deny.
--   3. Otherwise the department default applies (can_edit > can_create > can_view).
--
-- Idempotent: create or replace of a single function, same signature.

create or replace function public.has_module_permission(
  p_user_id     uuid,
  p_module_name text,
  p_min_level   text
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- coalesce to false: a null level must never read as "allowed". Callers do
  -- `if not has_module_permission(...) then raise`, and `not null` is null, which
  -- would skip the raise and let the write through.
  select coalesce(
    public.is_polaris_global_admin(p_user_id)
    or array_position(
         array['view','create','edit','approve','finance','admin'],
         case
           when exists (
             select 1
             from public.user_module_access uma
             join public.modules m on m.module_id = uma.module_id
             where uma.user_id = p_user_id
               and m.name = p_module_name
           ) then (
             -- Their own grant, whatever it says. Inactive => null => denied.
             select case when coalesce(uma.active, true) then uma.permission_level end
             from public.user_module_access uma
             join public.modules m on m.module_id = uma.module_id
             where uma.user_id = p_user_id
               and m.name = p_module_name
             limit 1
           )
           else (
             -- No personal grant, so fall back to whatever their department gets.
             -- Matched exactly on the department string, the same way claims.ts
             -- queries it (note department_permissions holds case variants such
             -- as 'orbit' and 'Orbit' as separate rows).
             select case
                      when dp.can_edit   then 'edit'
                      when dp.can_create then 'create'
                      when dp.can_view   then 'view'
                    end
             from public.user_profiles up
             join public.department_permissions dp on dp.department = up.department
             where up.user_id = p_user_id
               and dp.module_slug = p_module_name
             limit 1
           )
         end
       )
       >= array_position(array['view','create','edit','approve','finance','admin'], p_min_level),
    false
  );
$function$;
