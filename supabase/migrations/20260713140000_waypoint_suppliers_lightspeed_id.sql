-- Waypoint suppliers ← Lightspeed sync key. Lets the Lightspeed supplier sync
-- upsert on the external id without creating duplicates. Applied live via MCP.
alter table public.waypoint_suppliers
  add column if not exists lightspeed_id text;

create unique index if not exists waypoint_suppliers_lightspeed_id_key
  on public.waypoint_suppliers (lightspeed_id) where lightspeed_id is not null;

-- Full (non-partial) unique index so it can serve as an ON CONFLICT arbiter for
-- the supplier upsert. NULLs stay distinct, so manual suppliers are unaffected.
drop index if exists public.waypoint_suppliers_lightspeed_id_key;
create unique index if not exists waypoint_suppliers_lightspeed_id_key
  on public.waypoint_suppliers (lightspeed_id);
