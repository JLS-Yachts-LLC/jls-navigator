-- Provisioning department, offered in Settings → Manage Users → Invite user.
--
-- Defaults (editable in Settings → Permissions; user_module_access still wins per
-- person): full edit on Superyacht Provisioning, view on the modules provisioning
-- staff lean on day to day — Waypoint Chandlery (stock), ShipSync (deliveries to
-- the boat) and Agency (vessel details) — plus Leo.

insert into public.staff_departments (slug, name, description, sort_order) values
  ('provisioning', 'Provisioning', 'Superyacht provisioning orders, suppliers and deliveries', 25)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description,
      sort_order = excluded.sort_order, active = true;

-- lvl: 1 = view, 2 = create, 3 = edit (can_edit implies create implies view).
delete from public.department_permissions where department = 'provisioning';
insert into public.department_permissions (department, module, module_slug, can_view, can_create, can_edit)
select 'provisioning', m.slug, m.slug, m.lvl >= 1, m.lvl >= 2, m.lvl >= 3
from (values
  ('provisioning', 3),
  ('waypoint', 1),
  ('shipsync', 1),
  ('agency', 1),
  ('leo', 1)
) as m(slug, lvl);
