-- Make Department Permissions real.
--
-- Until now the Settings → Permissions grid wrote to department_permissions and
-- nothing ever read it: the table appeared in exactly two places in the codebase,
-- its own migration and the screen that saves it. Access was governed only by
-- per-user grants in user_module_access. Worse, users had no department at all,
-- so there was no way to know which row of the grid applied to whom.
--
-- This migration supplies the two missing pieces:
--   1. user_profiles.department  — which department a person belongs to.
--   2. department_permissions.module_slug — the canonical module name that the
--      enforcement layer (requireAccess / claims) actually checks, instead of the
--      display labels the grid was storing ("Yachts", "Small Boat Registration").
--
-- Effective access then resolves as: per-user grant → department default → none,
-- with global admins bypassing both. Additive only: a user with no department
-- keeps exactly the access they have today.

-- ── 1. Department on the user ────────────────────────────────────────────────
alter table public.user_profiles add column if not exists department text;

create index if not exists user_profiles_department_idx
  on public.user_profiles (department) where department is not null;

comment on column public.user_profiles.department is
  'Department name, matching department_permissions.department. Drives default module access; per-user rows in user_module_access override it.';

-- ── 2. Canonical module slug on the permission grid ──────────────────────────
alter table public.department_permissions add column if not exists module_slug text;

-- Map the labels the grid has been storing onto real module names. Yachts,
-- Permits and Small Boat Registration all live inside Port & Operations work and
-- have no module of their own, so they map to the modules that own those screens.
update public.department_permissions set module_slug = case module
  when 'Yachts'                  then 'agency'
  when 'Permits'                 then 'agency'
  when 'Small Boat Registration' then 'agency'
  when 'Orbit'                   then 'orbit'
  when 'ShipSync'                then 'shipsync'
  when 'Crew Cab'                then 'transport'
  when 'Director'                then 'finance'
  else null
end
where module_slug is null;

create unique index if not exists department_permissions_dept_slug_key
  on public.department_permissions (department, module_slug) where module_slug is not null;

comment on column public.department_permissions.module_slug is
  'modules.name this row grants. The enforcement layer keys on this, not the display label in `module`.';

-- ── 3. Read access ───────────────────────────────────────────────────────────
-- Every signed-in user must be able to read the grid to resolve their own access.
alter table public.department_permissions enable row level security;
drop policy if exists department_permissions_read on public.department_permissions;
create policy department_permissions_read on public.department_permissions
  for select using ((select auth.role()) = 'authenticated');
