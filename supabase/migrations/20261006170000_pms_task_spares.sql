-- Jobs & maintenance ↔ Stock: the spares a job uses each time it's done, as
-- [{ "stock_item_id": "<uuid>", "qty": 2 }]. Marking the job done takes them off
-- the vessel's stock (onboard_stock_items), never below zero.
alter table public.pms_tasks add column if not exists spares jsonb not null default '[]'::jsonb
  check (jsonb_typeof(spares) = 'array');
