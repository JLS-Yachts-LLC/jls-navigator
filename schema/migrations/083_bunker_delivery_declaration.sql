-- Migration 083: Native Bunker Delivery Note (replaces Bunker_Delivery.xlsm)
-- + native Master's Declaration (VAT zero-rating document)
-- Both link to public.orbit_service_requests(id) directly — there is no
-- separate work_order entity; the request itself, once scheduled/in_progress,
-- functions as the work order (matches how ORBIT already models every other
-- category). vessel_id references public.yachts (not public.vessels, which
-- doesn't exist) — confirmed yachts.imo_no / yachts.flag are the real column
-- names before writing v_bdn_summary below (the vendor package assumed
-- imo_number).

create table if not exists public.bunker_delivery_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.orbit_service_requests(id) on delete cascade unique,
  bdn_number text not null unique,
  ptw_number text,

  vessel_id uuid not null references public.yachts(id),
  draft_m numeric(5,2),

  delivery_port text not null check (delivery_port in (
    'AUH Freeport', 'Emirates Palace', 'Yas Marina', 'Mina Rashid', 'Anchorage', 'Dubai Harbour', 'Other'
  )),
  berth_no text,

  camlock_type text check (camlock_type in ('Adaptor (Male)', 'Coupler (Female)')),
  camlock_size_diameter text,
  hose_size_diameter text,
  hose_length_m numeric(6,2),

  manifold_location text check (manifold_location in ('Fwd', 'Mid', 'Aft')),
  manifold_diagram_note text,

  fuel_grade text not null check (fuel_grade in ('HFO', 'MDO', 'MGO', 'LSMGO', 'ULSMGO')),
  fuel_description text,
  max_sulfur_content text,
  specs text,
  min_qty numeric(10,2),
  max_qty numeric(10,2),
  quantity_uom text not null default 'MT' check (quantity_uom in ('MT', 'L', 'm3')),

  transfer_rate_per_hour numeric(10,2),
  delivery_method text check (delivery_method in ('Ex-Wharf', 'Ex-Truck')),
  berth_alongside_side text check (berth_alongside_side in ('Port', 'Starboard')),

  supplier_org_id uuid references public.organisations(org_id),
  driver_name text,
  tanker_no text,
  tanker_capacity numeric(10,2),

  alongside_at timestamptz,
  commenced_at timestamptz,
  completed_at timestamptz,

  product_grade text,
  viscosity_cst numeric(6,2),
  sulfur_content_pct numeric(5,3),
  flash_point_c numeric(5,1),
  density_kg_m3 numeric(7,2),
  delivered_mt numeric(10,2),

  marpol_limit_basis text check (marpol_limit_basis in (
    'reg_18_3_or_14_1', 'reg_14_4_ultra_low', 'purchaser_specified'
  )),
  purchaser_specified_limit_pct numeric(5,3),

  status text not null default 'draft' check (status in ('draft', 'in_progress', 'signed')),
  signed_by_name text,
  signed_at timestamptz,

  created_by uuid references public.user_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_bunker_delivery_notes_updated_at on public.bunker_delivery_notes;
create trigger trg_bunker_delivery_notes_updated_at
  before update on public.bunker_delivery_notes
  for each row execute function public.set_updated_at();

create or replace function public.prevent_signed_bdn_edit()
returns trigger language plpgsql as $$
begin
  if old.status = 'signed' and new is distinct from old then
    raise exception 'bunker_delivery_notes is locked once signed — create a correction record instead of editing';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_signed_bdn_edit on public.bunker_delivery_notes;
create trigger trg_prevent_signed_bdn_edit
  before update on public.bunker_delivery_notes
  for each row execute function public.prevent_signed_bdn_edit();

create table if not exists public.masters_declarations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.orbit_service_requests(id) on delete cascade,

  owner_name text not null,
  vessel_id uuid not null references public.yachts(id),
  ship_arrival_date date,
  bunker_supply_date date not null,
  bunker_supply_port text not null,
  last_port_of_call text,
  load_port text,
  next_port_of_call text,
  final_quantity_received numeric(10,2) not null,
  quantity_uom text not null default 'MT',

  transport_category text not null check (transport_category in (
    'a_uae_to_outside', 'b_outside_to_uae', 'c_within_uae_waters'
  )),
  confirms_no_sanctioned_port_voyage boolean not null default true,

  master_name text not null,
  signature_file_path text,
  ship_stamp_file_path text,
  declared_at date,

  status text not null default 'draft' check (status in ('draft', 'signed')),
  created_by uuid references public.user_profiles(user_id),
  created_at timestamptz not null default now()
);

create or replace function public.prevent_signed_declaration_edit()
returns trigger language plpgsql as $$
begin
  if old.status = 'signed' and new is distinct from old then
    raise exception 'masters_declarations is locked once signed — create a correction record instead of editing';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_signed_declaration_edit on public.masters_declarations;
create trigger trg_prevent_signed_declaration_edit
  before update on public.masters_declarations
  for each row execute function public.prevent_signed_declaration_edit();

create index if not exists idx_bunker_delivery_notes_request on public.bunker_delivery_notes (request_id);
create index if not exists idx_masters_declarations_request on public.masters_declarations (request_id);

-- Resolver view: replaces the workbook's "BDN Summary" rollup sheet.
create or replace view public.v_bdn_summary as
select
  bdn.bdn_number, bdn.ptw_number, y.vessel_name, y.imo_no, y.flag,
  bdn.delivery_port, bdn.berth_no, bdn.camlock_type, bdn.camlock_size_diameter,
  bdn.hose_length_m, bdn.hose_size_diameter, bdn.manifold_location,
  bdn.fuel_grade, bdn.fuel_description, bdn.max_sulfur_content, bdn.specs,
  bdn.min_qty, bdn.max_qty, bdn.quantity_uom, bdn.transfer_rate_per_hour,
  bdn.delivery_method, bdn.berth_alongside_side,
  o.name as supplier_name, bdn.delivered_mt, bdn.status
from public.bunker_delivery_notes bdn
join public.yachts y on y.id = bdn.vessel_id
left join public.organisations o on o.org_id = bdn.supplier_org_id;

alter view public.v_bdn_summary set (security_invoker = true);

comment on view public.v_bdn_summary is
  'Replaces the Bunker_Delivery.xlsm "BDN Summary" sheet.';

alter table public.bunker_delivery_notes enable row level security;
alter table public.masters_declarations enable row level security;

create policy bunker_delivery_notes_select on public.bunker_delivery_notes
  for select using (public.has_module_permission(auth.uid(), 'orbit', 'view'));
create policy masters_declarations_select on public.masters_declarations
  for select using (public.has_module_permission(auth.uid(), 'orbit', 'view'));

-- No direct write policies — mutation via migration 084 functions.
