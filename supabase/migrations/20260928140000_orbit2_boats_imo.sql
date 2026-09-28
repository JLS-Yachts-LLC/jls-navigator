-- Orbit 2 — Managed Boats: IMO number on the vessel profile.
--
-- The Manage Boat design lists IMO alongside MMSI in the vessel spec; the table
-- had MMSI but no IMO. Free text, like Vessel Overview's yachts.imo_no (which the
-- Add New Boat wizard inherits it from) — many small craft have none, and the
-- ones that do are not always in the 7-digit IMO form.
alter table public.orbit2_boats add column if not exists imo_no text;
