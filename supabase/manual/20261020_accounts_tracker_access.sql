-- Jeannin asked (20 Oct 2026) for accounts@jlsyachts.com to get the same access as
-- accounts.ycmc@jlsyachts.com (see 20261020_jeannin_tracker_access.sql, run the same day).
-- accounts@ is also Finance (role finance_user) and has no per-user grants yet.
-- VIEW-only: Immigration (visa + passport details), Sign On/Off, Crew Care, Orbit / Orbit 2.
--
-- Undo: update user_module_access set active = false
--       where user_id = '385c68b3-5208-4f73-92db-19a637ce1448'
--         and module_id in (select module_id from modules where name in ('crew_immigration','crew_movements','transport','orbit'));

insert into user_module_access (user_id, module_id, permission_level, granted_by, active)
select '385c68b3-5208-4f73-92db-19a637ce1448', module_id, 'view', '2b0476e5-ba30-488a-b943-2edf2b6bfe87', true
from modules
where name in ('crew_immigration', 'crew_movements', 'transport', 'orbit')
on conflict (user_id, module_id) do update set permission_level = 'view', active = true;
