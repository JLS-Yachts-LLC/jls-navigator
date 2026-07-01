-- Migration 074: Security & Permissions (FRS §18) + masked candidate view
-- Reuses the real roles/user_module_access/is_polaris_global_admin model
-- (already used by Port Calls, migration 056) against the already-existing
-- 'crew_placement' module, gated by permission_level
-- (view/create/edit/approve/finance/admin — same cumulative order as
-- PERMISSION_ORDER in src/lib/auth/claims.ts) instead of the original zip's
-- five invented auth.jwt()->>'role' strings, which don't correspond to any
-- role this app actually issues.
--
-- Anon execute is revoked at creation time here, not as a follow-up fix —
-- lesson learned from the Port Calls RPCs earlier this session.

create or replace function public.has_module_permission(
  p_user_id uuid,
  p_module_name text,
  p_min_level text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_polaris_global_admin(p_user_id)
    or exists (
      select 1
      from public.user_module_access uma
      join public.modules m on m.module_id = uma.module_id
      where uma.user_id = p_user_id
        and m.name = p_module_name
        and coalesce(uma.active, true)
        and array_position(array['view','create','edit','approve','finance','admin'], uma.permission_level)
            >= array_position(array['view','create','edit','approve','finance','admin'], p_min_level)
    );
$$;

revoke all on function public.has_module_permission(uuid, text, text) from public, anon;
grant execute on function public.has_module_permission(uuid, text, text) to authenticated;

-- Masked candidate view: hides salary fields from anyone without at least
-- 'approve' level on the crew_placement module (FRS §18: Operations sees
-- null salary fields, a Recruitment Manager sees real values).
create or replace view public.v_candidate_profiles_masked as
select
  cp.*,
  case when public.has_module_permission(auth.uid(), 'crew_placement', 'approve')
       then cp.salary_expectation_min else null end as salary_expectation_min_visible,
  case when public.has_module_permission(auth.uid(), 'crew_placement', 'approve')
       then cp.salary_expectation_max else null end as salary_expectation_max_visible,
  case when public.has_module_permission(auth.uid(), 'crew_placement', 'approve')
       then cp.previous_salary else null end as previous_salary_visible
from public.placement_candidates cp;

alter view public.v_candidate_profiles_masked set (security_invoker = true);

comment on view public.v_candidate_profiles_masked is
  'Use this view (not placement_candidates directly) in any UI surface shown
   to a role without approve-level crew_placement access — e.g. an
   Operations-only dashboard. *_visible columns are null when the requesting
   user lacks permission; the underlying salary_expectation_min/max/
   previous_salary columns are still present for users who DO have
   permission — read those directly in consultant/manager-facing screens
   instead of the _visible aliases.';
