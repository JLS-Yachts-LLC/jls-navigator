-- Rework yacht_shipments into a Monday-style grouped board: new columns,
-- new status groups (new_lead / in_progress / on_hold / done / cancelled),
-- drop fields that aren't part of the board.

-- 1. Migrate existing status values onto the new group set before changing the constraint.
alter table yacht_shipments drop constraint if exists yacht_shipments_status_check;

update yacht_shipments set status = case status
  when 'booked'      then 'new_lead'
  when 'loading'     then 'in_progress'
  when 'in_transit'  then 'in_progress'
  when 'arrived'     then 'in_progress'
  when 'discharged'  then 'in_progress'
  when 'delivered'   then 'done'
  when 'cancelled'   then 'cancelled'
  else 'new_lead'
end;

alter table yacht_shipments
  alter column status set default 'new_lead',
  add constraint yacht_shipments_status_check
    check (status in ('new_lead', 'in_progress', 'on_hold', 'done', 'cancelled'));

-- 2. Rename columns that map 1:1 onto board columns.
alter table yacht_shipments rename column origin_port to pol;
alter table yacht_shipments rename column destination_port to arrival_port;
alter table yacht_shipments rename column carrier_vessel to vessel_name;
alter table yacht_shipments rename column booking_ref to quotation_ref;
alter table yacht_shipments rename column notes to remarks;

-- 3. Drop fields that aren't part of the board.
alter table yacht_shipments
  drop column if exists direction,
  drop column if exists carrier,
  drop column if exists loading_date,
  drop column if exists departure_date,
  drop column if exists arrival_date;

-- 4. Add new board columns.
-- (LOA is not stored here — it's read from yachts.length_overall_m via the yacht join.)
alter table yacht_shipments
  add column if not exists customs_option     text,
  add column if not exists quota              text,
  add column if not exists quotations         text,
  add column if not exists quotation_copy_url text,
  add column if not exists formula            text,
  add column if not exists home_marina        text,
  add column if not exists charges            numeric;
