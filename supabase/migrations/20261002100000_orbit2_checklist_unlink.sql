-- Managed Boats checklists: a line can be told "no inventory item".
--
-- 2 Oct 2026. Inventory matches made by name could be changed but not removed —
-- clearing the link just fell back to the same automatic match. This flag
-- records that the team has said the line has no inventory item, so neither
-- the automatic match nor Sync from inventory applies to it until it is
-- linked again or set back to automatic.
alter table public.orbit2_boat_checklist add column if not exists inventory_unlinked boolean not null default false;
