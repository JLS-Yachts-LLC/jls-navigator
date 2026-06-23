-- ── Team Directory module ─────────────────────────────────────────────────────
-- POLARIS_TEAM_DIRECTORY.md — centralised, searchable contact database for all JLS
-- staff, departments and service areas. Single source of truth replacing static PDFs.
--   departments      — service groups (port agency, logistics, provisioning, …)
--   staff_profiles   — individual team members + contact channels + expertise
--   service_routing  — "what do you need help with?" keyword → dept + named contacts
-- Reuses public.set_updated_at() (defined in 20260427161510_*). RLS: authenticated
-- read; admin write. Vessel-user department visibility is filtered client-side via
-- departments.visible_to_vessel_users (consistent with the current access layer).

-- ── departments ───────────────────────────────────────────────────────────────
create table if not exists public.departments (
  id                       uuid primary key default gen_random_uuid(),
  name                     varchar(120) not null,
  slug                     varchar(80) unique not null,
  category                 varchar(80),
  description              text,
  icon                     varchar(40),
  display_order            integer default 999,
  visible_to_vessel_users  boolean default true,
  is_active                boolean default true
);

-- ── staff_profiles ────────────────────────────────────────────────────────────
create table if not exists public.staff_profiles (
  id                    uuid primary key default gen_random_uuid(),
  full_name             varchar(120) not null,
  preferred_name        varchar(60),
  position              varchar(120) not null,
  department_id         uuid references public.departments(id) on delete set null,
  office_location       varchar(80),
  profile_photo_url     text,
  direct_mobile         varchar(30),
  office_number         varchar(30),
  whatsapp_number       varchar(30),
  email                 varchar(120) unique not null,
  teams_upn             varchar(120),
  languages             text[],
  areas_of_expertise    text[],
  office_hours          varchar(80),
  emergency_available   boolean default false,
  emergency_hours       varchar(80),
  is_emergency_contact  boolean default false,
  display_order         integer default 999,
  is_active             boolean default true,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create index if not exists staff_profiles_department_idx on public.staff_profiles(department_id);
create index if not exists staff_profiles_active_idx     on public.staff_profiles(is_active);

drop trigger if exists staff_profiles_set_updated_at on public.staff_profiles;
create trigger staff_profiles_set_updated_at before update on public.staff_profiles
  for each row execute function public.set_updated_at();

-- ── service_routing ───────────────────────────────────────────────────────────
create table if not exists public.service_routing (
  id                   uuid primary key default gen_random_uuid(),
  service_keyword      varchar(120) not null,
  department_id        uuid references public.departments(id) on delete cascade,
  primary_contact_id   uuid references public.staff_profiles(id) on delete set null,
  secondary_contact_id uuid references public.staff_profiles(id) on delete set null,
  emergency_contact_id uuid references public.staff_profiles(id) on delete set null,
  notes                text
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.departments     enable row level security;
alter table public.staff_profiles  enable row level security;
alter table public.service_routing enable row level security;

do $$ declare t text; begin
  foreach t in array array['departments','staff_profiles','service_routing'] loop
    -- read: any authenticated user (vessel-visibility filtered in the client)
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format($f$create policy %1$s_read on public.%1$s for select
      using ((select auth.role()) = 'authenticated')$f$, t);
    -- write: admins only
    execute format('drop policy if exists %1$s_admin on public.%1$s', t);
    execute format($f$create policy %1$s_admin on public.%1$s for all
      using (public.has_role((select auth.uid()), 'admin'::public.app_role))
      with check (public.has_role((select auth.uid()), 'admin'::public.app_role))$f$, t);
  end loop;
end $$;

-- ── Seed: departments ─────────────────────────────────────────────────────────
-- visible_to_vessel_users per POLARIS_TEAM_DIRECTORY.md §4.2.
insert into public.departments (name, slug, category, icon, display_order, visible_to_vessel_users) values
  ('Port Agency',             'port-agency',              'Port Agency & Operations',      '⚓', 10, true),
  ('Customs & Immigration',   'customs-immigration',      'Port Agency & Operations',      '🛂', 20, false),
  ('Crew Visas',              'crew-visas',               'Port Agency & Operations',      '🪪', 30, true),
  ('Berthing',                'berthing',                 'Port Agency & Operations',      '🛟', 40, false),
  ('Cash to Master',          'cash-to-master',           'Port Agency & Operations',      '💵', 50, false),
  ('Destination Services',    'destination-services',     'Port Agency & Operations',      '🗺️', 60, false),
  ('Freight Forwarding',      'freight-forwarding',       'Logistics & Marine Shipping',   '✈️', 70, true),
  ('Customs Clearance',       'customs-clearance',        'Logistics & Marine Shipping',   '📋', 80, false),
  ('Warehousing',             'warehousing',              'Logistics & Marine Shipping',   '🏭', 90, false),
  ('Yacht Shipping',          'yacht-shipping',           'Logistics & Marine Shipping',   '🚢', 100, true),
  ('Provisioning',            'provisioning',             'Provisioning & Procurement',    '🍽️', 110, false),
  ('Chandlery',               'chandlery',                'Provisioning & Procurement',    '🛒', 120, false),
  ('Procurement',             'procurement',              'Provisioning & Procurement',    '📦', 130, false),
  ('Crew Uniforms',           'crew-uniforms',            'Provisioning & Procurement',    '👕', 140, false),
  ('Marine Training',         'marine-training',          'Marine Training',               '🎓', 150, true),
  ('Crew Care & Transport',   'crew-care-transportation', 'Crew Care & Transportation',    '🚐', 160, true),
  ('Operations & Technical',  'operations-technical',     'Operations & Technical',        '🛠️', 170, true),
  ('IT Support',              'it-support',               'Operations & Technical',        '💻', 180, false),
  ('Heli & Aero',             'heli-aero',                'Operations & Technical',        '🚁', 190, false),
  ('Quick Reaction Force',    'quick-reaction-force',     'Emergency',                     '🚨', 200, true),
  ('General Enquiries',       'general-enquiries',        'General',                       '☎️', 210, false)
on conflict (slug) do nothing;

-- ── Seed: service routing ───────────────────────────────────────────────────────
-- Keyword → department (§9.2). Named contacts are assigned by HR/Admin once staff
-- profiles exist; left null here.
insert into public.service_routing (service_keyword, department_id)
select v.keyword, d.id
from (values
  ('Crew Visa',          'crew-visas'),
  ('Berth Booking',      'berthing'),
  ('Provisioning',       'provisioning'),
  ('Training Course',    'marine-training'),
  ('Yacht Shipping',     'yacht-shipping'),
  ('Bunkering',          'port-agency'),
  ('Technical Support',  'operations-technical'),
  ('Airport Transfer',   'crew-care-transportation')
) as v(keyword, slug)
join public.departments d on d.slug = v.slug
where not exists (
  select 1 from public.service_routing sr where sr.service_keyword = v.keyword
);

-- ── Seed: feature flag (sandbox / dev stage until promoted in Dev Settings) ──────
insert into public.feature_flags (key, name, description, icon, stage, released_at) values
  ('directory', 'Team Directory', 'Departments, staff profiles & smart service routing', '📇', 'dev', null)
on conflict (key) do nothing;
