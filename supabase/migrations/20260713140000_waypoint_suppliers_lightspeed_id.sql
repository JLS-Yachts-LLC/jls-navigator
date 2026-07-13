-- Waypoint suppliers ← Lightspeed sync key. Lets the Lightspeed supplier sync
-- upsert on the external id without creating duplicates. Applied live via MCP.
alter table public.waypoint_suppliers
  add column if not exists lightspeed_id text;

create unique index if not exists waypoint_suppliers_lightspeed_id_key
  on public.waypoint_suppliers (lightspeed_id) where lightspeed_id is not null;
