/**
 * VesselFinder Fleet Positions (AIS) sync. Runs on the Cloudflare Worker —
 * holds the userkey as a secret and pulls live positions for the fleet, then
 * persists them onto `yachts` and derives voyage-state transitions
 * (underway / departed / arrived) for the Vessel Overview columns.
 *
 * Secret: VESSELFINDER_USERKEY  (paid VesselFinder Fleet Positions API key).
 * Docs: GET https://api.vesselfinder.com/vessels?userkey=&mmsi=&imo=&format=json&extradata=voyage
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllRows } from "./fetch-all";

const ENDPOINT = "https://api.vesselfinder.com/vessels";

// NAVSTAT 0 = under way (engine), 8 = under way (sailing). Anything else with
// negligible speed is treated as stopped.
function isMoving(navstat: number | null, speed: number | null): boolean {
  if (navstat === 0 || navstat === 8) return true;
  if (navstat === 1 || navstat === 5) return false; // at anchor / moored
  return (speed ?? 0) > 0.5;
}

function toIso(v: any): string | null {
  if (!v) return null;
  const d = new Date(typeof v === "number" ? v * 1000 : String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

type YachtRow = { id: string; mmsi: string | null; imo_no: string | null; ais_navstat: number | null };

export async function syncVesselPositions(): Promise<{ requested: number; matched: number; updated: number }> {
  const userkey = process.env.VESSELFINDER_USERKEY as string | undefined;
  if (!userkey) throw new Error("VesselFinder is not configured — set the VESSELFINDER_USERKEY secret.");

  const { data: yachts } = await fetchAllRows(() => (supabaseAdmin as any)
    .from("yachts").select("id, mmsi, imo_no, ais_navstat").order("id"));
  const rows = (yachts ?? []) as YachtRow[];

  const mmsis = rows.map(r => (r.mmsi ?? "").trim()).filter(Boolean);
  const imos = rows.map(r => (r.imo_no ?? "").trim()).filter(Boolean);
  if (!mmsis.length && !imos.length) return { requested: 0, matched: 0, updated: 0 };

  const params = new URLSearchParams({ userkey, format: "json", extradata: "voyage" });
  if (mmsis.length) params.set("mmsi", mmsis.join(","));
  if (imos.length) params.set("imo", imos.join(","));

  const res = await fetch(`${ENDPOINT}?${params.toString()}`);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`VesselFinder returned non-JSON (${res.status}): ${text.slice(0, 120)}`); }
  if (json?.error) throw new Error(`VesselFinder error: ${json.error}`);
  const records: any[] = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);

  // Index AIS records by MMSI and IMO for matching.
  const byMmsi = new Map<string, any>();
  const byImo = new Map<string, any>();
  for (const rec of records) {
    const ais = rec.AIS ?? rec;
    if (ais.MMSI != null) byMmsi.set(String(ais.MMSI), ais);
    if (ais.IMO != null) byImo.set(String(ais.IMO), ais);
  }

  const now = new Date().toISOString();
  let matched = 0, updated = 0;
  const updates: Promise<unknown>[] = [];

  for (const y of rows) {
    const ais = (y.mmsi && byMmsi.get(y.mmsi.trim())) || (y.imo_no && byImo.get(y.imo_no.trim()));
    if (!ais) continue;
    matched++;

    const navstat = ais.NAVSTAT != null ? Number(ais.NAVSTAT) : null;
    const speed = ais.SPEED != null ? Number(ais.SPEED) : null;
    const positionAt = toIso(ais.TIMESTAMP) ?? now;
    const movingNow = isMoving(navstat, speed);
    // Previous state is inferred from the last stored navstat (prior speed isn't kept).
    const movingPrev = isMoving(y.ais_navstat, null);

    const patch: Record<string, any> = {
      ais_lat: ais.LATITUDE != null ? Number(ais.LATITUDE) : null,
      ais_lon: ais.LONGITUDE != null ? Number(ais.LONGITUDE) : null,
      ais_speed: speed,
      ais_course: ais.COURSE != null ? Number(ais.COURSE) : null,
      ais_heading: ais.HEADING != null ? Number(ais.HEADING) : null,
      ais_navstat: navstat,
      ais_destination: ais.DESTINATION ? String(ais.DESTINATION) : null,
      ais_eta: ais.ETA ? String(ais.ETA) : null,
      ais_position_at: positionAt,
      ais_synced_at: now,
    };

    // Voyage-state transitions.
    if (movingNow && !movingPrev) {
      patch.last_departed_at = positionAt;
      patch.underway_since = positionAt;
    } else if (!movingNow && movingPrev) {
      patch.last_arrived_at = positionAt;
    }

    updates.push((supabaseAdmin as any).from("yachts").update(patch).eq("id", y.id));
    updated++;
  }

  await Promise.all(updates);
  return { requested: mmsis.length + imos.length, matched, updated };
}
