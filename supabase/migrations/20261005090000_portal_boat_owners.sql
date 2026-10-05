-- Client portal — small-boat owners (Phase 1: accounts and isolation).
--
-- A portal login has until now always been a yacht captain: captain_accounts
-- links an auth user to exactly one row in `yachts`. Owners of the small boats
-- JLS manages in Orbit 2 (orbit2_boats) get the same portal, the same MFA and
-- the same preview, so a captain_accounts row now links to a yacht OR a boat —
-- never both, never neither.
--
-- Isolation is unchanged and needs nothing new: a boat owner is a portal
-- captain (is_portal_captain() is "has an active captain_accounts row"), so the
-- restrictive portal_captain_block / portal_captain_denied fences on every
-- staff table, Orbit 2's included, already shut them out. Boat data reaches the
-- portal only through /api/portal/boats, which runs with the service role and
-- checks ownership against captain_boat_ids() semantics in code. The Orbit 2
-- tables are deliberately NOT opened to portal logins: RLS is row-level, and a
-- boat's job rows carry team comments, technician names and internal remarks.
--
-- One login may own several boats — one captain_accounts row per boat, same
-- user_id — and the portal shows a boat picker.

alter table public.captain_accounts
  alter column yacht_id drop not null;

alter table public.captain_accounts
  add column if not exists boat_id uuid references public.orbit2_boats(id) on delete cascade;

alter table public.captain_accounts
  drop constraint if exists captain_accounts_one_vessel;
alter table public.captain_accounts
  add constraint captain_accounts_one_vessel check (num_nonnulls(yacht_id, boat_id) = 1);

create unique index if not exists captain_accounts_user_boat_uq
  on public.captain_accounts (user_id, boat_id) where boat_id is not null;
create index if not exists captain_accounts_boat_idx
  on public.captain_accounts (boat_id) where boat_id is not null;

-- A boat-owner row has no yacht. Keep the yacht helper to real yachts so a
-- NULL never reaches an `in (...)` (harmless today, a trap for a `not in`).
create or replace function public.captain_yacht_ids()
returns setof uuid language sql stable security definer set search_path = public as
$$ select yacht_id from captain_accounts where user_id = auth.uid() and active and yacht_id is not null $$;

create or replace function public.captain_boat_ids()
returns setof uuid language sql stable security definer set search_path = public as
$$ select boat_id from captain_accounts where user_id = auth.uid() and active and boat_id is not null $$;

revoke all on function public.captain_boat_ids() from public, anon;
grant execute on function public.captain_boat_ids() to authenticated;
