-- Yacht IT Network ───────────────────────────────────────────────────────────
-- Ported from the New Horizon-IT service desk and kept in two-way sync with it.
-- Tables match New Horizon's names/columns/checks exactly; only the side-local
-- anchor columns differ (it_yacht_id here; client_id/site_id/vendor_id there).

create table if not exists public.yacht_it_maps (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled vessel',
  it_yacht_id uuid references public.it_yachts(id) on delete set null,
  imo text, builder text, flag text, length_m numeric, notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_yacht_it_maps_it_yacht on public.yacht_it_maps (it_yacht_id);

create table if not exists public.yacht_it_zones (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.yacht_it_maps(id) on delete cascade,
  name text not null default 'Zone',
  deck text,
  position_x double precision not null default 0,
  position_y double precision not null default 0,
  width double precision not null default 520,
  height double precision not null default 320,
  colour text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_yacht_it_zones_map on public.yacht_it_zones (map_id);

create table if not exists public.yacht_it_systems (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.yacht_it_maps(id) on delete cascade,
  zone_id uuid references public.yacht_it_zones(id) on delete set null,
  discipline text not null default 'other' check (discipline in (
    'wan_comms', 'core_network', 'wireless', 'servers_storage',
    'av_entertainment', 'lighting_knx', 'bridge_nav', 'security_cctv',
    'telephony', 'bespoke_platform', 'power_ups', 'crew_it', 'other')),
  name text not null default 'New system',
  manufacturer text, model text, role_description text,
  hostname text, ip_address text, subnet text, vlan text, mac text,
  uplink_system_id uuid references public.yacht_it_systems(id) on delete set null,
  switch_port text,
  supplier_name text, support_contract_end date, support_phone text, support_email text, escalation_notes text,
  firmware_version text, install_date date, warranty_end date, eol_date date, last_serviced date,
  criticality text not null default 'medium' check (criticality in ('critical', 'high', 'medium', 'low')),
  deck text, compartment text, rack_location text, access_notes text, credential_ref text,
  status text not null default 'operational' check (status in (
    'operational', 'degraded', 'fault', 'planned', 'decommissioned')),
  notes text,
  position_x double precision not null default 0,
  position_y double precision not null default 0,
  on_canvas boolean not null default true,
  sort_order integer not null default 0,
  datto_uid text,
  datto_linked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.yacht_it_systems.credential_ref is
  'A POINTER to where the credentials live (password-manager entry, vault path) — never the credentials themselves.';
comment on column public.yacht_it_systems.datto_uid is
  'Datto RMM device uid. Not an FK — Datto lives on New Horizon, so a stale uid degrades to no live data.';
create index if not exists idx_yacht_it_systems_map on public.yacht_it_systems (map_id);
create index if not exists idx_yacht_it_systems_zone on public.yacht_it_systems (zone_id);
create index if not exists idx_yacht_it_systems_uplink on public.yacht_it_systems (uplink_system_id);
create index if not exists idx_yacht_it_systems_support_end on public.yacht_it_systems (support_contract_end);
create index if not exists idx_yacht_it_systems_datto_uid on public.yacht_it_systems (datto_uid) where datto_uid is not null;

create table if not exists public.yacht_it_links (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.yacht_it_maps(id) on delete cascade,
  from_system_id uuid not null references public.yacht_it_systems(id) on delete cascade,
  to_system_id uuid not null references public.yacht_it_systems(id) on delete cascade,
  link_type text not null default 'ethernet' check (link_type in (
    'ethernet', 'fibre', 'wireless', 'serial', 'hdmi', 'dante', 'knx_bus', 'power')),
  label text, notes text,
  from_uplink boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_yacht_it_links_map on public.yacht_it_links (map_id);
create index if not exists idx_yacht_it_links_from on public.yacht_it_links (from_system_id);
create index if not exists idx_yacht_it_links_to on public.yacht_it_links (to_system_id);
