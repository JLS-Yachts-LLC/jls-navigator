-- SD-0028: staff with agency edit permission could not edit any yacht.
--
-- The yachts UPDATE policy allowed only the row's creator or an admin. But 183 of
-- 186 yachts were created by the SharePoint sync and have no creator at all, so
-- no non-admin could edit any of them — whatever Polaris granted them. Hilary
-- (operations department, which grants agency view/create/edit) could add a new
-- yacht and edit that one, but could not change a photo, a remark or the agent
-- on any other vessel.
--
-- Meanwhile INSERT was open to anyone signed in, so creating a yacht required
-- nothing while editing one required ownership: backwards.
--
-- Both now follow the permission model the app already uses, via
-- has_module_permission() — a personal module grant, else the department's, else
-- global admin — so the database and the UI answer the same question. The
-- RESTRICTIVE portal_captain_block_* policies are untouched and still apply.
--
-- Verified before applying, as the real users inside rolled-back transactions:
--   Hilary edits O3 (sync-created): 0 rows before, 1 after
--   Hilary edits Shelly (hers):     1 row before (why "I could add a yacht" worked)
--   ORBIT staff, no agency perm:    0 rows on all 186 yachts after

drop policy if exists "Owner or admin update yachts" on public.yachts;
drop policy if exists "Agency editors update yachts" on public.yachts;
create policy "Agency editors update yachts" on public.yachts
  for update to authenticated
  using (
    -- Kept so nobody loses the ability to correct a vessel they just added.
    (select auth.uid()) = created_by
    or has_role((select auth.uid()), 'admin'::app_role)
    or has_module_permission((select auth.uid()), 'agency', 'edit')
  );

drop policy if exists "Authenticated insert yachts" on public.yachts;
drop policy if exists "Agency creators insert yachts" on public.yachts;
create policy "Agency creators insert yachts" on public.yachts
  for insert to authenticated
  with check (
    (select auth.uid()) = created_by
    and (
      has_role((select auth.uid()), 'admin'::app_role)
      or has_module_permission((select auth.uid()), 'agency', 'create')
    )
  );
