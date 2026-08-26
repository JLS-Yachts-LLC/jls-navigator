-- The Yacht Name cell shouldn't require picking an existing yacht profile —
-- a shipment often gets logged before the boat has one (you only know the
-- model, e.g. "Boston Whaler 320"). Replace the yacht_id foreign key with a
-- plain text column, carrying over any name already linked.
alter table yacht_shipments add column if not exists yacht_name text;

update yacht_shipments s
set yacht_name = y.vessel_name
from yachts y
where s.yacht_id = y.id and s.yacht_name is null;

alter table yacht_shipments drop column if exists yacht_id;
