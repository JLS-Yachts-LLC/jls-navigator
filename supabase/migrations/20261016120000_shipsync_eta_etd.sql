-- ShipSync: when a shipment is expected (ETA, Import / Transit) and when it is due to leave (ETD, Export).
-- Neither Monday board has these, so they are Polaris's own columns, typed in on the Import and Export boards and shown on the
-- ShipSync Dashboard. The Monday sync only writes the columns it maps, so it never touches or blanks them.
--
-- Additive only: two nullable date columns on shipsync_packages. Safe to run once; existing rows and policies are unchanged.

alter table public.shipsync_packages
  add column if not exists eta date,
  add column if not exists etd date;

comment on column public.shipsync_packages.eta is 'Expected arrival date of an Import / Transit shipment — entered by staff.';
comment on column public.shipsync_packages.etd is 'Expected departure date of an Export shipment — entered by staff.';
