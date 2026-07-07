-- ShipSync: assign a van to a delivery-note run.
alter table public.shipsync_delivery_notes
  add column if not exists vehicle_id uuid references public.crew_vehicles(id) on delete set null;
