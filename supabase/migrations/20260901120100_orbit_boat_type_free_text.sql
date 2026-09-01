-- Let ORBIT boats carry any vessel type, not just the nine hard-coded ones.
--
-- The logistics team's point: the list of vessel/tender types is effectively
-- endless, so the picker needs a manual option. boat_type was pinned by a CHECK
-- constraint to nine values, which would reject anything typed by hand.
--
-- The nine familiar types stay as suggestions in the UI (and keep their slugs, so
-- existing rows and their labels are untouched) -- they are just no longer the
-- only permitted values.
--
-- Idempotent: drop if exists, and nothing is added back.

alter table public.orbit_boats
  drop constraint if exists orbit_boats_boat_type_check;
