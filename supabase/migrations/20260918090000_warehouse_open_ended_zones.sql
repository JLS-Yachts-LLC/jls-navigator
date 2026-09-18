-- Warehouse zones were hardcoded to A–E (see 20260904095459_warehouse_module.sql).
-- Client asked to be able to add their own zones from the UI, so drop the
-- fixed-letter check constraint and replace it with a light format check
-- instead (non-empty, short, uppercase code) rather than removing validation
-- entirely.

ALTER TABLE warehouse_shelves DROP CONSTRAINT IF EXISTS warehouse_shelves_zone_check;

ALTER TABLE warehouse_shelves
  ADD CONSTRAINT warehouse_shelves_zone_check CHECK (zone ~ '^[A-Z0-9-]{1,12}$');
