-- ORBIT as a staff department, and read-only vessel access for every department.
--
-- The vessel registry (Yachts · Permits · Small Boats · Port Calls) lives in the
-- 'agency' module. Every department must be able to READ it; only the
-- departments that own it (Operations, Admin) may edit. The registry UI hides
-- Add Yacht, archive/restore and the inline status/agent editors unless the
-- signed-in user holds 'edit' on agency.

insert into public.staff_departments (slug, name, description, sort_order) values
  ('orbit', 'Orbit', 'ORBIT — service requests, maintenance, defects and projects', 45)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description,
      sort_order = excluded.sort_order, active = true;

delete from public.department_permissions where department = 'orbit';

insert into public.department_permissions (department, module, module_slug, can_view, can_create, can_edit)
select m.dept, m.slug, m.slug, m.lvl >= 1, m.lvl >= 2, m.lvl >= 3
from (values
  ('orbit','orbit',3),          -- owns ORBIT
  ('orbit','agency',1),         -- vessel registry: read only
  ('orbit','waypoint',1),       -- parts / chandlery lookups
  ('orbit','provisioning',1),
  ('orbit','shipsync',1),
  ('orbit','crew_movements',1),
  ('orbit','yacht_it',1),
  ('orbit','seaport',1),
  ('orbit','leo',1)
) as m(dept, slug, lvl);

-- Any department with no agency row at all gets view-only; owners keep edit.
insert into public.department_permissions (department, module, module_slug, can_view, can_create, can_edit)
select d.slug, 'agency', 'agency', true, false, false
from public.staff_departments d
where not exists (
  select 1 from public.department_permissions p
   where p.department = d.slug and p.module_slug = 'agency'
);

update public.department_permissions
   set can_view = true
 where module_slug = 'agency'
   and can_view is not true
   and department in (select slug from public.staff_departments);
