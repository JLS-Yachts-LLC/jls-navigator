-- Migration 080: Bunkering-specific request detail tables
-- Retargeted from the vendor package's fictional `rfqs` table onto the
-- real public.orbit_service_requests. Supplier identity reuses
-- public.organisations (type='supplier', already a valid enum value from
-- migration 065/056) rather than a new bunker_suppliers lookup, consistent
-- with how Agency/Crew Placement already reuse organisations for external
-- entities. The existing free-text orbit_quotations.supplier /
-- orbit_service_requests.assigned_supplier columns are untouched.

create table if not exists public.bunker_rfq_details (
  request_id uuid primary key references public.orbit_service_requests(id) on delete cascade,

  location text not null,
  delivery_date date,
  billing_entity text,

  fuel_grade text not null check (fuel_grade in ('HFO', 'MDO', 'MGO', 'LSMGO', 'ULSMGO')),
  min_quantity numeric(10,2),
  max_quantity numeric(10,2),
  quantity_uom text not null default 'MT' check (quantity_uom in ('MT', 'L', 'm3')),

  created_at timestamptz not null default now()
);

comment on table public.bunker_rfq_details is
  'Bunkering RFQ Builder Section 1 (Information Required for Quotation).
   One row per FUEL_BUNKERING orbit_service_requests row.';

create table if not exists public.bunker_execution_details (
  request_id uuid primary key references public.orbit_service_requests(id) on delete cascade,

  supplier_org_id uuid references public.organisations(org_id),
  delivery_restrictions text,
  hose_connection text,
  bunkering_side text check (bunkering_side in ('port', 'starboard', 'either')),
  site_contact_name text,
  site_contact_phone text,
  emergency_stop_location text,

  created_at timestamptz not null default now()
);

comment on table public.bunker_execution_details is
  'Bunkering RFQ Builder Section 2 (Information Required to Execute the
   Work) — completed by Operations after assignment, not at intake.';

alter table public.bunker_rfq_details enable row level security;
alter table public.bunker_execution_details enable row level security;

create policy bunker_rfq_details_select on public.bunker_rfq_details
  for select using (public.has_module_permission(auth.uid(), 'orbit', 'view'));
create policy bunker_execution_details_select on public.bunker_execution_details
  for select using (public.has_module_permission(auth.uid(), 'orbit', 'view'));

-- No direct write policy — mutation via create_bunker_request /
-- upsert_bunker_execution_details in migration 084.
