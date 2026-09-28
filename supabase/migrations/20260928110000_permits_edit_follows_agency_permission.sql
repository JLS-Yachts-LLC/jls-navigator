-- Permits: editing follows the Agency permission, as yachts now do (SD-0028).
--
-- Same trap as yachts. The UPDATE policy allowed only a permit's creator or
-- has_role('admin') — but 3,737 of 3,798 permits came from the SharePoint sync and
-- have no creator, and has_role checks the older app_role system, which no Polaris
-- global_admin satisfies. Nobody could edit a synced permit at all: even a global
-- admin could edit 0 of 3,798. With the permits sync switched off since
-- 2026-09-03, permits had effectively been frozen.
--
-- There is no `permits` module, and the permits screens declare none, so there was
-- no existing rule to mirror. Matt chose `agency`: permits sit beside Vessels under
-- Operations, and the operations department already holds agency view/create/edit.
--
-- Verified before applying, as the real users inside a rolled-back transaction:
--   Matt (global_admin)        0 → 3,798
--   Hilary (operations)        0 → 3,798
--   ORBIT staff, no agency     0 → 0
-- Every account that has ever created a permit (all operations) holds agency
-- create, so tightening INSERT removes nobody's existing ability.
--
-- The RESTRICTIVE portal_captain_block_* policies are untouched and still apply.

drop policy if exists "Owner or admin update permits" on public.permits;
drop policy if exists "Agency editors update permits" on public.permits;
create policy "Agency editors update permits" on public.permits
  for update to authenticated
  using (
    (select auth.uid()) = created_by
    or has_role((select auth.uid()), 'admin'::app_role)
    or has_module_permission((select auth.uid()), 'agency', 'edit')
  );

drop policy if exists "Authenticated insert permits" on public.permits;
drop policy if exists "Agency creators insert permits" on public.permits;
create policy "Agency creators insert permits" on public.permits
  for insert to authenticated
  with check (
    (select auth.uid()) = created_by
    and (
      has_role((select auth.uid()), 'admin'::app_role)
      or has_module_permission((select auth.uid()), 'agency', 'create')
    )
  );
