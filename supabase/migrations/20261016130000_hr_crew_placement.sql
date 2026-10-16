-- HR also manages placed crew (contracts, payroll, documents): give the HR
-- department Crew Placement at edit. The screen is added to RESTRICTED_NAV.hr.
insert into public.department_permissions (department, module, module_slug, can_view, can_create, can_edit)
values ('hr', 'crew_placement', 'crew_placement', true, true, true)
on conflict (department, module) do update
  set module_slug = excluded.module_slug, can_view = true, can_create = true, can_edit = true;
