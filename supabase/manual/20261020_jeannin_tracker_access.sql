-- Jeannin (accounts.ycmc@jlsyachts.com, Finance) was sent the tracker locations but
-- can't see Immigration, Crew Care or Orbit 2: the Finance department's default
-- grants are only agency, finance, leo, provisioning, shipsync and waypoint, and the
-- sidebar hides any module a person has no grant for.
--
-- Gives VIEW-only access to the four missing areas. NOT RUN: it needs Matt's OK,
-- and Immigration (crew_immigration) shows crew passport and visa details.
--   crew_immigration -> Services > Immigration (Visa) + Reports > Visa Reports
--   crew_movements   -> Sign On/Off + its report
--   transport        -> Services > Crew Care
--   orbit            -> Services > Orbit / Orbit 2 (Project, Bunkering, EHS NOC tabs)
--
-- Undo: update user_module_access set active = false
--       where user_id = '92dd493e-9717-4107-b558-b2b6b58c42f9'
--         and module_id in (select module_id from modules where name in ('crew_immigration','crew_movements','transport','orbit'));

insert into user_module_access (user_id, module_id, permission_level, granted_by, active)
select '92dd493e-9717-4107-b558-b2b6b58c42f9', module_id, 'view', '2b0476e5-ba30-488a-b943-2edf2b6bfe87', true
from modules
where name in ('crew_immigration', 'crew_movements', 'transport', 'orbit')
on conflict (user_id, module_id) do update set permission_level = 'view', active = true;
