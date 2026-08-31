/**
 * Resolve an AIS destination string ("MALTA", "AE DXB", "PIRAEUS ANCHORAGE")
 * to coordinates, so the fleet map can draw a line from a vessel's current
 * position to where it's headed. AIS itself never gives us a destination
 * lat/lon — only free text — so this hits OpenStreetMap's Nominatim search
 * API and caches the result in `ais_destination_geocode` (port names don't
 * move, and many vessels share the same destination).
 *
 * Called only from the AIS sync jobs (myshiptracking.server.ts /
 * vesselfinder.server.ts), never from a client request — Nominatim's usage
 * policy caps unauthenticated use at ~1 request/second and requires an
 * identifying User-Agent, which is fine for an hourly/15-min background
 * sync but would be wrong to call per page load.
 *
 * Best-effort: a destination that's too cryptic for a text geocoder (bare
 * 5-letter UN/LOCODE port codes, abbreviations) just fails to resolve —
 * the map then simply doesn't draw a line for that vessel, rather than
 * guessing at coordinates.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "JLS-Polaris-YachtTracking/1.0 (ops@jlsyachts.com)";

export async function resolvePortCoords(destinationRaw: string | null): Promise<{ lat: number; lon: number } | null> {
  const destination = (destinationRaw ?? "").trim();
  if (!destination) return null;

  const { data: cached } = await (supabaseAdmin as any)
    .from("ais_destination_geocode").select("lat, lon").eq("destination", destination).maybeSingle();
  if (cached) return { lat: Number(cached.lat), lon: Number(cached.lon) };

  try {
    const params = new URLSearchParams({ format: "json", limit: "1", q: destination });
    const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const results = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!results?.length) return null;

    const lat = Number(results[0].lat);
    const lon = Number(results[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    await (supabaseAdmin as any).from("ais_destination_geocode")
      .upsert({ destination, lat, lon, resolved_at: new Date().toISOString() }, { onConflict: "destination" });
    return { lat, lon };
  } catch {
    return null; // geocoding is a nice-to-have — never let it break a position sync
  }
}
