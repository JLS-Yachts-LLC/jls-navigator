-- Yacht Shipments: tracks whole yachts being shipped as cargo (e.g. on a
-- freighter between ports), distinct from ShipSync's package/parcel tracking.
create table if not exists yacht_shipments (
  id                uuid primary key default gen_random_uuid(),
  yacht_id          uuid references yachts(id),
  direction         text not null default 'import' check (direction in ('import', 'export')),
  carrier           text,
  carrier_vessel    text,
  origin_port       text,
  destination_port  text,
  booking_ref       text,
  loading_date      date,
  departure_date    date,
  eta               date,
  arrival_date      date,
  status            text not null default 'booked'
                     check (status in ('booked', 'loading', 'in_transit', 'arrived', 'discharged', 'delivered', 'cancelled')),
  notes             text,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists yacht_shipments_yacht_id_idx on yacht_shipments(yacht_id);
create index if not exists yacht_shipments_status_idx on yacht_shipments(status);

alter table yacht_shipments enable row level security;

drop policy if exists authenticated_all on yacht_shipments;
create policy authenticated_all on yacht_shipments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create trigger yacht_shipments_set_updated_at
  before update on yacht_shipments
  for each row execute function set_updated_at();
