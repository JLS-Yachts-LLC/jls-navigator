-- Staff departments for the Internal Staff invite flow.
--
-- The Internal Staff list was offering every role in the catalogue — including
-- the Client Portal ones (Captain, Owner, Family Office, Client Admin,
-- Supplier) — which do not belong to a JLS staff login. Staff are now described
-- by DEPARTMENT (which modules they work in) plus a privilege ROLE (how much
-- they can do), with per-user user_module_access rows overriding either.
--
-- Safe to reshape: department_permissions held 9 legacy departments × 5 modules,
-- and NO user_profiles row had a department set, so nothing is reassigned here.

-- 1. Departments, as a table so the app and the invite dialog share one list
--    instead of a hard-coded array drifting from the permission grid.
create table if not exists public.staff_departments (
  slug        text primary key,
  name        text not null,
  description text,
  sort_order  int  not null default 100,
  active      boolean not null default true
);

alter table public.staff_departments enable row level security;

drop policy if exists staff_departments_read on public.staff_departments;
create policy staff_departments_read on public.staff_departments
  for select using ((select auth.role()) = 'authenticated');

insert into public.staff_departments (slug, name, description, sort_order) values
  ('logistics',  'Logistics',  'Yacht logistics, transport and fleet movements',        10),
  ('shipsync',   'ShipSync',   'Parcel intake, dispatch, drivers and deliveries',       20),
  ('crew_care',  'Crew Care',  'Crew, immigration, visas, sign on/off and placement',   30),
  ('operations', 'Operations', 'Port operations, agency, permits and ORBIT',            40),
  ('finance',    'Finance',    'Invoicing, berth billing and QuickBooks',               50),
  ('admin',      'Admin',      'Full platform access and configuration',                60)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description,
      sort_order = excluded.sort_order, active = true;

-- 2. Default module access per department. These are STARTING POINTS, editable in
--    Settings → Permissions; a per-user row in user_module_access still wins.
--    can_edit implies create implies view (see departmentLevel() in claims.ts).
delete from public.department_permissions
 where department in ('logistics','shipsync','crew_care','operations','finance','admin');

insert into public.department_permissions (department, module, module_slug, can_view, can_create, can_edit)
select d.dept, m.slug, m.slug, m.lvl >= 1, m.lvl >= 2, m.lvl >= 3
from (values
  -- lvl: 0 = no access, 1 = view, 2 = create, 3 = edit
  ('logistics','shipsync',3),('logistics','transport',3),('logistics','waypoint',1),
  ('logistics','provisioning',1),('logistics','agency',1),('logistics','crew_movements',1),
  ('logistics','leo',1),

  ('shipsync','shipsync',3),('shipsync','transport',2),('shipsync','agency',1),
  ('shipsync','leo',1),

  ('crew_care','crew_immigration',3),('crew_care','crew_movements',3),
  ('crew_care','crew_placement',3),('crew_care','transport',3),
  ('crew_care','seaport',1),('crew_care','training',1),('crew_care','compass_card',1),
  ('crew_care','agency',1),('crew_care','leo',1),

  ('operations','orbit',3),('operations','agency',3),('operations','seaport',3),
  ('operations','crew_movements',1),('operations','shipsync',1),
  ('operations','provisioning',1),('operations','yacht_it',1),('operations','leo',1),

  ('finance','finance',3),('finance','waypoint',1),('finance','shipsync',1),
  ('finance','agency',1),('finance','provisioning',1),('finance','leo',1),

  ('admin','agency',3),('admin','crew_immigration',3),('admin','crew_movements',3),
  ('admin','crew_placement',3),('admin','orbit',3),('admin','shipsync',3),
  ('admin','transport',3),('admin','finance',3),('admin','provisioning',3),
  ('admin','waypoint',3),('admin','seaport',3),('admin','training',3),
  ('admin','yacht_it',3),('admin','compass_card',3),('admin','leo',3),('admin','admin',3)
) as m(dept, slug, lvl)
join (select distinct column1 as dept from (values
  ('logistics'),('shipsync'),('crew_care'),('operations'),('finance'),('admin')
) v) d on d.dept = m.dept;

comment on table public.staff_departments is
  'Departments offered when inviting JLS staff. Drives default module access via department_permissions; user_module_access overrides per person.';
