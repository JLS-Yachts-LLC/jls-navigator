-- Planned-route line on the "My Fleet (Live)" tracking map: AIS only ever
-- gives us a destination as free text ("MALTA", "AE DXB"), never
-- coordinates, so we geocode it once (via OpenStreetMap Nominatim, called
-- server-side from the sync jobs — never from the client) and cache the
-- result, since many vessels share the same destination and port names
-- never move.
CREATE TABLE IF NOT EXISTS ais_destination_geocode (
  destination TEXT PRIMARY KEY,
  lat         NUMERIC NOT NULL,
  lon         NUMERIC NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ais_destination_geocode ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ais_destination_geocode_select" ON ais_destination_geocode FOR SELECT USING (auth.role() = 'authenticated');

-- Resolved destination coordinates, mirrored onto the vessel so the map can
-- draw a line from its current position without a join.
ALTER TABLE yachts ADD COLUMN IF NOT EXISTS dest_lat NUMERIC;
ALTER TABLE yachts ADD COLUMN IF NOT EXISTS dest_lon NUMERIC;
