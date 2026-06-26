-- QBO invoicing from the app: customer link on yachts, a service-item catalog
-- (the picklist of billable QBO Items), and an audit log of created invoices.

alter table public.yachts add column if not exists qbo_customer_id text;

-- Catalog of billable services that map to existing QBO Items.
-- The live invoice build resolves the QBO Item by `qbo_item_name` at create-time
-- (SELECT * FROM Item WHERE Name = ...), so this table is a convenience picklist
-- + default pricing; the source of truth for the Item Id is always QBO.
create table if not exists public.qbo_item_map (
  id           uuid primary key default gen_random_uuid(),
  scope        text not null default 'visa',     -- visa | packages | it | procurement | crew
  key          text,                             -- optional local key (e.g. visa_type) for auto-mapping
  qbo_item_name text not null,                   -- must match the QBO Item Name exactly
  qbo_item_id  text,                             -- cached after first resolve (optional)
  unit_price   numeric,                          -- default unit price (AED); falls back to QBO Item.UnitPrice
  tax_code     text,                             -- QBO TaxCodeRef value; null -> env default
  sort_order   int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create unique index if not exists qbo_item_map_scope_name_uq on public.qbo_item_map (scope, qbo_item_name);

-- Audit of invoices created from the app.
create table if not exists public.qbo_invoice_log (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,                   -- visa | packages | ...
  source_ids    text[] not null default '{}',
  qbo_invoice_id text,
  doc_number    text,
  customer_ref  text,
  customer_name text,
  total_amount  numeric,
  currency      text not null default 'AED',
  status        text not null default 'created',  -- created | failed
  error         text,
  detail        jsonb,
  created_by    uuid,
  created_at    timestamptz not null default now()
);
create index if not exists qbo_invoice_log_created_idx on public.qbo_invoice_log (created_at desc);

alter table public.qbo_item_map enable row level security;
alter table public.qbo_invoice_log enable row level security;

drop policy if exists qbo_item_map_auth on public.qbo_item_map;
create policy qbo_item_map_auth on public.qbo_item_map
  for all to authenticated using (true) with check (true);

drop policy if exists qbo_invoice_log_auth on public.qbo_invoice_log;
create policy qbo_invoice_log_auth on public.qbo_invoice_log
  for all to authenticated using (true) with check (true);

-- Seed the visa service catalog from the current tariff (names must match QBO Items;
-- adjust names/prices in Supabase or QBO so the live lookup resolves).
insert into public.qbo_item_map (scope, qbo_item_name, unit_price, sort_order) values
  ('visa', 'UAE 6 Months Cabin Crew Visa per pax', 1095, 1),
  ('visa', 'UAE 6 Months Cabin Crew Visa Cancellation per pax', 255, 2),
  ('visa', 'Inside the country visa Status Change - 6 Months UAE Cabin Crew Visa', 2500, 3)
on conflict (scope, qbo_item_name) do nothing;
