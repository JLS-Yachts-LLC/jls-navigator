-- Client Portal modules, assigned per vessel.
--
-- The portal has two modules: "core" (everything JLS does for the vessel as its
-- agent — included for every client) and "management" (the crew's own on-board
-- tools — switched on per vessel, usually on a trial first). Each module has a
-- set of features that staff can hide for that vessel. The lists of modules and
-- features live in code (src/lib/portal/portal-modules.ts); `features` only
-- records the ones switched OFF, as {"<feature>": false}, so a new feature is on
-- by default everywhere.
--
-- No row = the default: core on, management off. A yacht OR a managed boat
-- (orbit2_boats) owns a row, never both — the same shape as captain_accounts.
create table if not exists public.yacht_portal_modules (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid references public.yachts(id) on delete cascade,
  boat_id uuid references public.orbit2_boats(id) on delete cascade,
  module text not null check (module in ('core', 'management')),
  enabled boolean not null default true,
  trial_ends_at timestamptz,
  features jsonb not null default '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint yacht_portal_modules_one_vessel check (num_nonnulls(yacht_id, boat_id) = 1)
);

create unique index if not exists yacht_portal_modules_yacht_uq
  on public.yacht_portal_modules (yacht_id, module) where yacht_id is not null;
create unique index if not exists yacht_portal_modules_boat_uq
  on public.yacht_portal_modules (boat_id, module) where boat_id is not null;

drop trigger if exists yacht_portal_modules_updated on public.yacht_portal_modules;
create trigger yacht_portal_modules_updated before update on public.yacht_portal_modules
  for each row execute function public.set_updated_at();

alter table public.yacht_portal_modules enable row level security;

-- Staff manage every row; a portal login reads only its own vessel's rows, and
-- only from an MFA-verified session — the same scoping as the other vessel
-- tables the portal reads.
drop policy if exists staff_manage on public.yacht_portal_modules;
create policy staff_manage on public.yacht_portal_modules
  for all to authenticated
  using (not public.is_portal_captain())
  with check (not public.is_portal_captain());

drop policy if exists captain_select on public.yacht_portal_modules;
create policy captain_select on public.yacht_portal_modules
  for select to authenticated
  using (
    public.is_portal_captain() and public.portal_aal2()
    and (
      yacht_id in (select public.captain_yacht_ids())
      or boat_id in (select public.captain_boat_ids())
    )
  );

-- Belt and braces: a portal login can never write here, whatever else changes.
drop policy if exists portal_captain_block_write on public.yacht_portal_modules;
create policy portal_captain_block_write on public.yacht_portal_modules
  as restrictive for insert to authenticated
  with check (not public.is_portal_captain());
drop policy if exists portal_captain_block_update on public.yacht_portal_modules;
create policy portal_captain_block_update on public.yacht_portal_modules
  as restrictive for update to authenticated
  using (not public.is_portal_captain());
drop policy if exists portal_captain_block_delete on public.yacht_portal_modules;
create policy portal_captain_block_delete on public.yacht_portal_modules
  as restrictive for delete to authenticated
  using (not public.is_portal_captain());
