-- Client Portal — per-vessel presentation settings (the default look).
--
-- theme: the portal look a vessel's people see unless they've picked their own
-- (each person's choice lives in user_preferences.prefs.portal_theme).
--   bridge          navy & gold (the house look)
--   midnight        near-black & brass
--   private_office  ivory & ink, light
-- Staff set it in Manage Users → Client Portal; a portal login reads its own
-- vessel's row only.
create table if not exists public.portal_vessel_settings (
  yacht_id uuid primary key references public.yachts(id) on delete cascade,
  theme text not null default 'bridge' check (theme in ('bridge', 'midnight', 'private_office')),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.portal_vessel_settings enable row level security;
drop policy if exists staff_manage on public.portal_vessel_settings;
create policy staff_manage on public.portal_vessel_settings for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists captain_select on public.portal_vessel_settings;
create policy captain_select on public.portal_vessel_settings for select to authenticated
  using (public.is_portal_captain() and yacht_id in (select public.captain_yacht_ids()));
drop policy if exists portal_captain_block_write on public.portal_vessel_settings;
create policy portal_captain_block_write on public.portal_vessel_settings as restrictive for insert to authenticated
  with check (not public.is_portal_captain());
drop policy if exists portal_captain_block_update on public.portal_vessel_settings;
create policy portal_captain_block_update on public.portal_vessel_settings as restrictive for update to authenticated
  using (not public.is_portal_captain());
drop policy if exists portal_captain_block_delete on public.portal_vessel_settings;
create policy portal_captain_block_delete on public.portal_vessel_settings as restrictive for delete to authenticated
  using (not public.is_portal_captain());
