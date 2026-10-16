-- HR role + department, for the Head of HR's staff login.
--
-- Polaris has no HR module of its own; what HR does here is staff contracts,
-- offer letters and policies through Anchor, including its Confidential area.
-- So the role is a RESTRICTED one (like logistics_team): its sidebar is cut down
-- to Anchor and the staff resources in use-polaris-role.ts / shell.tsx, and the
-- HR department's defaults grant only the confidential Anchor documents plus Leo.
-- Crew, visas, vessels, finance, operations etc. get no grant, so the
-- module-gated APIs refuse them.

insert into public.roles (name, display_name, scope, is_system)
values ('hr', 'HR', 'module', false)
on conflict (name) do update
  set display_name = excluded.display_name, scope = excluded.scope;

insert into public.staff_departments (slug, name, description, sort_order) values
  ('hr', 'HR', 'Staff contracts, confidential documents and policies', 55)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description,
      sort_order = excluded.sort_order, active = true;

-- lvl: 1 = view, 2 = create, 3 = edit (can_edit implies create implies view).
delete from public.department_permissions where department = 'hr';
insert into public.department_permissions (department, module, module_slug, can_view, can_create, can_edit)
select 'hr', m.slug, m.slug, m.lvl >= 1, m.lvl >= 2, m.lvl >= 3
from (values
  ('anchor_confidential', 3),
  ('leo', 1)
) as m(slug, lvl);
