-- ============================================================
-- POLARIS — Access Control Foundation  (Ticket #128)
-- Migrations 010–014 from POLARIS_ACCESS_CONTROL.md §3, ADAPTED to the live schema.
--
-- Reconciliation notes (spec was written against an assumed schema):
--   * spec references `vessels(vessel_id)`  ->  live DB uses `yachts(id)`
--   * spec "drops and recreates user_profiles (replaces migration 001)" -> this
--     DB has NO user_profiles; it has `profiles`. We CREATE user_profiles as a
--     NEW additive access-control table keyed to auth.users(id) and DO NOT touch
--     the live `profiles` table.
--   * existing `user_roles` / `app_role` / has_role() are left untouched; the new
--     richer `roles` table is additive and used by the access-control layer.
--
-- Additive only. RLS is enabled on these NEW (empty) tables with safe own-row +
-- admin policies — this does NOT lock out any existing functionality and does
-- NOT enable MFA/RLS enforcement on existing tables. (Per build decision:
-- "apply to live, but no enforcement.")
-- ============================================================

-- updated_at helper (idempotent)
create or replace function public.polaris_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── Migration 010 — Organisations & Locations ───────────────────────────────
create table if not exists public.organisations (
  org_id        uuid primary key default gen_random_uuid(),
  name          text not null,
  type          text not null check (type in (
                   'jls_internal','vessel_management','owner','family_office',
                   'supplier','training','crew_placement','agency','client'
                 )),
  country_code  text,
  active         boolean default true,
  branding      jsonb,             -- { logoUrl, primaryColor, displayName }
  created_at    timestamptz default now()
);

create table if not exists public.locations (
  location_id   uuid primary key default gen_random_uuid(),
  org_id        uuid references public.organisations(org_id),
  name          text not null,
  country_code  text not null,
  timezone      text not null default 'Asia/Dubai',
  active        boolean default true,
  created_at    timestamptz default now()
);

-- ─── Migration 011 — Roles & Modules ─────────────────────────────────────────
create table if not exists public.roles (
  role_id       uuid primary key default gen_random_uuid(),
  name          text not null unique,   -- unique added for idempotent seeding
  display_name  text not null,
  scope         text not null check (scope in (
                   'global','regional','organisation','vessel',
                   'department','module','crew'
                 )),
  is_system     boolean default false
);

insert into public.roles (name, display_name, scope, is_system) values
  ('global_admin',   'Global Admin',        'global',       true),
  ('regional_admin', 'Regional Admin',      'regional',     true),
  ('org_admin',      'Organisation Admin',  'organisation', true),
  ('vessel_admin',   'Vessel Admin',        'vessel',       true),
  ('dept_admin',     'Department Admin',    'department',   true),
  ('module_admin',   'Module Admin',        'module',       true),
  ('client_admin',   'Client Admin',        'organisation', true),
  ('supplier_admin', 'Supplier Admin',      'organisation', true),
  ('platform_owner', 'Platform Owner',      'global',       true),
  ('developer',      'Developer',           'global',       true),
  ('captain',        'Captain',             'vessel',       true),
  ('senior_crew',    'Senior Crew',         'vessel',       true),
  ('crew_member',    'Crew Member',         'vessel',       true),
  ('crew_manager',   'Crew Manager',        'vessel',       true),
  ('technical_mgr',  'Technical Manager',   'vessel',       true),
  ('owner',          'Owner',               'vessel',       true),
  ('family_office',  'Family Office',       'organisation', true),
  ('supplier',       'Supplier',            'organisation', true),
  ('finance_user',   'Finance User',        'module',       true),
  ('training_user',  'Training User',       'module',       true),
  ('crew_placement', 'Crew Placement User', 'module',       true),
  ('agency_user',    'Agency User',         'module',       true),
  ('read_only',      'Read Only',           'module',       true)
on conflict (name) do nothing;

create table if not exists public.modules (
  module_id     uuid primary key default gen_random_uuid(),
  name          text not null unique,
  display_name  text not null,
  active        boolean default true,
  icon          text
);

insert into public.modules (name, display_name, icon) values
  ('leo',              'Leo Intelligence',        'ti-robot'),
  ('crew_immigration', 'Crew & Immigration',      'ti-passport'),
  ('seaport',          'Seaport Immigration',     'ti-ship'),
  ('orbit',            'ORBIT — Operations',      'ti-sailboat'),
  ('shipsync',         'ShipSync — Logistics',    'ti-package'),
  ('waypoint',         'Waypoint — Chandlery',    'ti-shopping-cart'),
  ('provisioning',     'Superyacht Provisioning', 'ti-basket'),
  ('training',         'JLS Yacht Training',      'ti-certificate'),
  ('crew_placement',   'Crew Placement',          'ti-users'),
  ('finance',          'Finance',                 'ti-currency-dollar'),
  ('transport',        'Transport & Fleet',       'ti-car'),
  ('compass_card',     'Compass Card',            'ti-credit-card'),
  ('yacht_it',         'Yacht IT Solutions',      'ti-device-laptop'),
  ('agency',           'Agency & Destinations',   'ti-map-pin'),
  ('admin',            'Administration',          'ti-settings')
on conflict (name) do nothing;

-- ─── Migration 012 — User Profiles + access assignments ──────────────────────
-- NEW table (additive). 1:1 with auth.users; the existing `profiles` table is
-- left intact. role_id is NOT NULL but the table is empty, so no backfill needed.
create table if not exists public.user_profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  display_name   text not null,
  email          text not null,
  role_id        uuid not null references public.roles(role_id),
  org_id         uuid references public.organisations(org_id),
  location_id    uuid references public.locations(location_id),
  avatar_url     text,
  last_login     timestamptz,
  timezone       text default 'Asia/Dubai',
  mfa_enabled    boolean default false,
  active         boolean default true,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.polaris_set_updated_at();

create table if not exists public.user_vessel_access (
  user_id    uuid references public.user_profiles(user_id) on delete cascade,
  vessel_id  uuid references public.yachts(id)             on delete cascade,
  role_id    uuid references public.roles(role_id),
  granted_by uuid references auth.users(id),
  granted_at timestamptz default now(),
  active     boolean default true,
  primary key (user_id, vessel_id)
);

create table if not exists public.user_module_access (
  user_id          uuid references public.user_profiles(user_id) on delete cascade,
  module_id        uuid references public.modules(module_id)     on delete cascade,
  permission_level text not null check (permission_level in (
                     'view','create','edit','approve','finance','admin'
                   )),
  granted_by       uuid references auth.users(id),
  granted_at       timestamptz default now(),
  active           boolean default true,
  primary key (user_id, module_id)
);

create table if not exists public.user_location_access (
  user_id     uuid references public.user_profiles(user_id) on delete cascade,
  location_id uuid references public.locations(location_id) on delete cascade,
  granted_by  uuid references auth.users(id),
  granted_at  timestamptz default now(),
  primary key (user_id, location_id)
);

-- ─── Migration 013 — Permission Rules Engine ─────────────────────────────────
create table if not exists public.permission_rules (
  rule_id       uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.user_profiles(user_id) on delete cascade,
  resource_type text not null,
  resource_id   uuid,
  can_view      boolean default false,
  can_create    boolean default false,
  can_edit      boolean default false,
  can_approve   boolean default false,
  can_finance   boolean default false,
  granted_by    uuid references auth.users(id),
  granted_at    timestamptz default now(),
  expires_at    timestamptz
);
create index if not exists permission_rules_user_idx on public.permission_rules(user_id);

-- ─── Migration 014 — Audit Log ───────────────────────────────────────────────
create table if not exists public.audit_log (
  log_id        uuid primary key default gen_random_uuid(),
  user_id       uuid references public.user_profiles(user_id),
  event_type    text not null check (event_type in (
                   'login','logout','login_failed','mfa_challenge',
                   'permission_change','data_access','data_create',
                   'data_edit','data_delete','module_access',
                   'admin_action','export','report_generated'
                 )),
  module        text,
  resource_type text,
  resource_id   uuid,
  ip_address    text,
  user_agent    text,
  metadata      jsonb,
  created_at    timestamptz default now()
);
create index if not exists audit_log_user_idx    on public.audit_log(user_id);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);
create index if not exists audit_log_type_idx    on public.audit_log(event_type);

-- ─── Row-Level Security (safe: new empty tables, own-row + admin) ─────────────
alter table public.organisations        enable row level security;
alter table public.locations            enable row level security;
alter table public.roles                 enable row level security;
alter table public.modules               enable row level security;
alter table public.user_profiles         enable row level security;
alter table public.user_vessel_access    enable row level security;
alter table public.user_module_access    enable row level security;
alter table public.user_location_access  enable row level security;
alter table public.permission_rules      enable row level security;
alter table public.audit_log             enable row level security;

-- Reference data: any authenticated user may read; only admins may write.
do $$
declare t text;
begin
  foreach t in array array['organisations','locations','roles','modules'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format($f$create policy %1$s_read on public.%1$s for select
      using ((select auth.role()) = 'authenticated')$f$, t);
    execute format('drop policy if exists %1$s_admin on public.%1$s', t);
    execute format($f$create policy %1$s_admin on public.%1$s for all
      using (public.has_role((select auth.uid()), 'admin'::public.app_role))
      with check (public.has_role((select auth.uid()), 'admin'::public.app_role))$f$, t);
  end loop;
end $$;

-- user_profiles: read own row; admins read/write all.
drop policy if exists user_profiles_own on public.user_profiles;
create policy user_profiles_own on public.user_profiles for select
  using ((select auth.uid()) = user_id);
drop policy if exists user_profiles_admin on public.user_profiles;
create policy user_profiles_admin on public.user_profiles for all
  using (public.has_role((select auth.uid()), 'admin'::public.app_role))
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role));

-- per-user access tables + permission_rules: read own rows; admins manage all.
do $$
declare t text;
begin
  foreach t in array array['user_vessel_access','user_module_access',
                           'user_location_access','permission_rules'] loop
    execute format('drop policy if exists %1$s_own on public.%1$s', t);
    execute format($f$create policy %1$s_own on public.%1$s for select
      using ((select auth.uid()) = user_id)$f$, t);
    execute format('drop policy if exists %1$s_admin on public.%1$s', t);
    execute format($f$create policy %1$s_admin on public.%1$s for all
      using (public.has_role((select auth.uid()), 'admin'::public.app_role))
      with check (public.has_role((select auth.uid()), 'admin'::public.app_role))$f$, t);
  end loop;
end $$;

-- audit_log: users read their own entries; admins read all; authenticated may insert.
drop policy if exists audit_log_own on public.audit_log;
create policy audit_log_own on public.audit_log for select
  using ((select auth.uid()) = user_id
         or public.has_role((select auth.uid()), 'admin'::public.app_role));
drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log for insert
  with check ((select auth.role()) = 'authenticated');
