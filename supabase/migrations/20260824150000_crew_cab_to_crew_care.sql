-- Crew Cab is now Crew Care (Matt, 24 Aug 2026). Display labels only — routes
-- (/crew-cab), table names (crew_drivers…) and the 'transport' module slug are
-- unchanged. The stored grid labels must follow the UI constants, or the
-- permissions grid upserts (keyed on department+module) would create new
-- slug-less rows beside the old ones.
update public.department_permissions set department = 'Crew Care' where department = 'Crew Cab';
update public.department_permissions set module     = 'Crew Care' where module     = 'Crew Cab';
update public.user_profiles           set department = 'Crew Care' where department = 'Crew Cab';
