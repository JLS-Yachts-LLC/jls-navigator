-- ── Dev Module: feature staging (Dev Only / Beta / Live) + Dev-role users ──────
-- Lets admins control which modules are visible to end users and brand them with
-- a Beta / Dev badge, and grant a "Dev" role so non-admins can preview dev features.

-- Feature registry. stage drives visibility + badge:
--   dev  → hidden from end users (dev-access only), "Dev Only" badge
--   beta → visible to everyone with a "Beta" badge
--   live → visible to everyone, no badge
create table if not exists public.feature_flags (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  name        text not null,
  description text,
  icon        text default '🚀',
  stage       text not null default 'dev' check (stage in ('dev','beta','live')),
  released_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.feature_flags enable row level security;
drop policy if exists feature_flags_read on public.feature_flags;
create policy feature_flags_read on public.feature_flags
  for select using ((select auth.role()) = 'authenticated');
drop policy if exists feature_flags_write on public.feature_flags;
create policy feature_flags_write on public.feature_flags
  for all using (public.has_role((select auth.uid()), 'admin'::public.app_role))
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role));

drop trigger if exists feature_flags_set_updated_at on public.feature_flags;
create trigger feature_flags_set_updated_at before update on public.feature_flags
  for each row execute function public.set_updated_at();

-- Users granted the "Dev" role (can preview dev-stage features without being admins).
create table if not exists public.dev_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  granted_at timestamptz not null default now()
);

alter table public.dev_users enable row level security;
drop policy if exists dev_users_read on public.dev_users;
create policy dev_users_read on public.dev_users
  for select using ((select auth.role()) = 'authenticated');
drop policy if exists dev_users_write on public.dev_users;
create policy dev_users_write on public.dev_users
  for all using (public.has_role((select auth.uid()), 'admin'::public.app_role))
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role));

-- ── Seed: the modules currently present in Polaris ────────────────────────────
-- Mature modules → live; recently-shipped → beta; empty/in-progress shells → dev.
insert into public.feature_flags (key, name, description, icon, stage, released_at) values
  ('vessel-overview', 'Vessel Overview',        'Fleet vessel registry & details',                       '🚢', 'live', now()),
  ('my-fleet',        'My Fleet (Live)',         'Live AIS vessel tracking map',                          '🛰️', 'beta', now()),
  ('logistics',       'Logistics',               'ShipSync packages, drivers, deliveries & transport',    '📦', 'dev',  null),
  ('operations',      'Operations (Orbit)',      'Planned maintenance, defects & small-boat management',  '🛠️', 'dev',  null),
  ('waypoint',        'Waypoint',                'Supplier directory & quotations',                       '🛒', 'dev',  null),
  ('finance',         'Finance',                 'Billing, invoicing & financial reporting',              '💷', 'live', now()),
  ('reports',         'Reports',                 'Director & fleet reporting',                            '📊', 'live', now()),
  ('yacht-it',        'Yacht IT Solutions',      'Service desk, IT yachts, licensing & contracts',        '💻', 'live', now()),
  ('crew-immigration','Crew & Immigration',      'Crew list, visas, sign-on/off & documents',             '🪪', 'live', now()),
  ('crew-profile',    'Unified Crew Profile',    'Combined crew passports, visas, movements & documents', '👤', 'beta', now()),
  ('crew-placement',  'Crew Placement',          'Candidates & vacancies',                                '🧑‍💼', 'dev', null),
  ('provisioning',    'Superyacht Provisioning', 'Provisioning orders',                                   '🍽️', 'dev',  null),
  ('training',        'JLS Training Institute',  'Training records & certifications',                     '🎓', 'dev',  null),
  ('agency',          'Agency Network',          'Agency contacts network',                               '🌐', 'dev',  null),
  ('esign',           'Documents & e-Sign',      'In-house electronic signature requests',                '✍️', 'beta', now()),
  ('automations',     'Automations',             'Workflow automations registry',                         '⚡', 'dev',  null),
  ('compass',         'Compass',                 'Vendor directory',                                      '🧭', 'dev',  null)
on conflict (key) do nothing;
