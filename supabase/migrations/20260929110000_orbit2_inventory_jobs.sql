-- Orbit 2 — Managed Boats: the "Inventory" job category (client request, 29 Sep 2026).
--
-- An Inventory job is assigned to a crew member like any other boat job. On their
-- phone it opens the boat's Inventory List so they can physically check it:
-- confirm each item, correct quantities and condition, add anything missing,
-- photograph items, and leave notes — all written straight to the same
-- orbit2_boat_inventory rows the office reads.
--
-- "Checked" is recorded per item — who confirmed it and when — so the office can
-- see which lines were physically verified on the last count and which were not.

alter table public.orbit2_boat_tasks drop constraint if exists orbit2_boat_tasks_kind_check;
alter table public.orbit2_boat_tasks add constraint orbit2_boat_tasks_kind_check
  check (kind in ('maintenance', 'defect', 'inventory'));

alter table public.orbit2_boat_inventory
  add column if not exists checked_at timestamptz,
  add column if not exists checked_by text;
