-- Crew Cab: persist pickup/drop-off coordinates plus flight number and the
-- computed route stats so trips can be routed with Google Maps directions.
alter table public.crew_trips
  add column if not exists pickup_lat numeric(10,7),
  add column if not exists pickup_lng numeric(10,7),
  add column if not exists dropoff_lat numeric(10,7),
  add column if not exists dropoff_lng numeric(10,7),
  add column if not exists flight_number text,
  add column if not exists distance_km numeric,
  add column if not exists duration_min integer;
