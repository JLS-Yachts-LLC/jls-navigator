-- The unique index was partial (WHERE angle IS NOT NULL), which Postgres cannot
-- use as an ON CONFLICT arbiter unless the statement repeats the predicate —
-- PostgREST doesn't, so every photo-row upsert failed and aborted the import.
drop index if exists public.crew_vehicle_photos_angle_key;
create unique index if not exists crew_vehicle_photos_angle_key
  on public.crew_vehicle_photos (vehicle_id, angle);
