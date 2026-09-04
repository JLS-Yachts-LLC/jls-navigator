-- Warehouse module — real schema backing the Warehouse UI (previously a
-- UI-only pass over sample data). Per "Polaris – Warehouse Board: Functions
-- and Requirements": shelves (Zone/Bay/Shelf capacity), Client Inventory,
-- Internal Inventory (Documents/Assets), and Package Content (the packing
-- list). Status Due Soon/Overdue is derived client-side from due/destruction
-- date at read time (so it never goes stale) rather than stored — the
-- `status` column here only ever holds the manually-set states (Stored as
-- the default, or a terminal one like Completed/Checked Out/Disposed).

CREATE TABLE IF NOT EXISTS warehouse_shelves (
  id uuid primary key default gen_random_uuid(),
  zone text not null check (zone in ('A','B','C','D','E')),
  bay text not null,
  shelf text not null,
  max_length_cm numeric not null,
  max_width_cm numeric not null,
  max_height_cm numeric not null,
  max_cbm numeric not null,
  max_weight_kg numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (zone, bay, shelf)
);

CREATE TABLE IF NOT EXISTS warehouse_client_items (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  client_name text not null,
  description text not null,
  quotation_no text,
  length_cm numeric, width_cm numeric, height_cm numeric, weight_kg numeric,
  cbm numeric,
  charges numeric,
  date_stored date,
  due_date date,
  zone text, bay text, shelf text,
  invoice_no text,
  status text not null default 'Stored' check (status in ('Stored','Completed')),
  remarks text,
  documents jsonb not null default '[]'::jsonb,
  image_url text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS warehouse_internal_items (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  kind text not null check (kind in ('documents','assets')),
  department text not null,
  description text not null,
  length_cm numeric, width_cm numeric, height_cm numeric, weight_kg numeric,
  cbm numeric,
  date_stored date,
  destruction_date date,
  zone text, bay text, shelf text,
  status text not null default 'Stored' check (status in ('Stored','Completed')),
  remarks text,
  documents jsonb not null default '[]'::jsonb,
  image_url text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS warehouse_package_contents (
  id uuid primary key default gen_random_uuid(),
  item_id text not null unique,
  ref_no text not null, -- loosely references warehouse_client_items.ref_no or warehouse_internal_items.ref_no (no FK: either table)
  client_or_dept text,
  item_name text not null,
  quantity numeric not null default 1,
  unit text not null default 'pcs',
  status text not null default 'Stored' check (status in ('Stored','Checked Out','Returned','Disposed','Completed')),
  remarks text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sequences for auto-generated reference numbers — same pattern as
-- next_shipsync_delivery_number / next_shipsync_item_id.
CREATE SEQUENCE IF NOT EXISTS warehouse_client_ref_seq START 1;
CREATE SEQUENCE IF NOT EXISTS warehouse_internal_ref_seq START 1;
CREATE SEQUENCE IF NOT EXISTS warehouse_item_id_seq START 1;

CREATE OR REPLACE FUNCTION next_warehouse_client_ref() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'CLI-' || lpad(nextval('warehouse_client_ref_seq')::text, 4, '0');
$$;
CREATE OR REPLACE FUNCTION next_warehouse_internal_ref() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'INT-' || lpad(nextval('warehouse_internal_ref_seq')::text, 4, '0');
$$;
CREATE OR REPLACE FUNCTION next_warehouse_item_id() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'ITM-' || lpad(nextval('warehouse_item_id_seq')::text, 4, '0');
$$;

REVOKE EXECUTE ON FUNCTION next_warehouse_client_ref() FROM anon;
REVOKE EXECUTE ON FUNCTION next_warehouse_internal_ref() FROM anon;
REVOKE EXECUTE ON FUNCTION next_warehouse_item_id() FROM anon;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_warehouse_shelves_updated_at ON warehouse_shelves;
CREATE TRIGGER set_warehouse_shelves_updated_at BEFORE UPDATE ON warehouse_shelves FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_warehouse_client_items_updated_at ON warehouse_client_items;
CREATE TRIGGER set_warehouse_client_items_updated_at BEFORE UPDATE ON warehouse_client_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_warehouse_internal_items_updated_at ON warehouse_internal_items;
CREATE TRIGGER set_warehouse_internal_items_updated_at BEFORE UPDATE ON warehouse_internal_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS set_warehouse_package_contents_updated_at ON warehouse_package_contents;
CREATE TRIGGER set_warehouse_package_contents_updated_at BEFORE UPDATE ON warehouse_package_contents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE warehouse_shelves ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_client_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_internal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_package_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warehouse_shelves_all" ON warehouse_shelves FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "warehouse_client_items_all" ON warehouse_client_items FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "warehouse_internal_items_all" ON warehouse_internal_items FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "warehouse_package_contents_all" ON warehouse_package_contents FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_warehouse_client_items_zone_bay_shelf ON warehouse_client_items (zone, bay, shelf);
CREATE INDEX IF NOT EXISTS idx_warehouse_internal_items_zone_bay_shelf ON warehouse_internal_items (zone, bay, shelf);
CREATE INDEX IF NOT EXISTS idx_warehouse_package_contents_ref_no ON warehouse_package_contents (ref_no);
