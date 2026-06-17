-- Store the vessel a visa is allocated to as free text (the typed/selected name),
-- independent of whether it matches a linked yacht row. Backfill from yacht join.
alter table public.visa_applications add column if not exists vessel_name text;

update public.visa_applications va
set vessel_name = y.vessel_name
from public.yachts y
where va.yacht_id = y.id and (va.vessel_name is null or va.vessel_name = '');
