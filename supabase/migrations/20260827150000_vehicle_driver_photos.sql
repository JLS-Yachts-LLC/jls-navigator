-- Photos for vehicles and driver avatars. Files live in the existing
-- permit-documents bucket under vehicles/photos/** and drivers/photos/**.
alter table public.crew_vehicles add column if not exists photo_url text;
alter table public.crew_drivers  add column if not exists photo_url text;
