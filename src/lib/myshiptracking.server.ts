/**
 * MyShipTracking live AIS positions sync. Runs on the Cloudflare Worker —
 * holds the API key as a secret, pulls live positions for the fleet in bulk,
 * and persists them onto `yachts` (same ais_* columns + voyage-state
 * transitions as the VesselFinder sync, so the Vessel Overview / Live
 * Tracking UI needs no changes).
 *
 * Secret: MYSHIPTRACKING_API_KEY   (set via `wrangler secret put`)
 * Docs:   GET https://api.myshiptracking.com/api/v2/vessel/bulk
 *         auth: `Authorization: Bearer <key>` (or x-api-key)
 *         params: mmsi=<csv> / imo=<csv> (max 100 ids), response=simple|extended
 *         billing: simple = 1 credit/vessel, extended = 3 credits/vessel
 *
 * We use the "extended" response so destination / ETA / current port flow into
 * the app alongside position. Batches of 100; the whole fleet syncs each run.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllRows } from "./fetch-all";

const ENDPOINT = "https://api.myshiptracking.com/api/v2/vessel/bulk";

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

/**
 * @param opts.extended use the extended response (adds destination / ETA / ports;
 *        3 credits per vessel vs 1). The cron runs `simple` every 15 min and
 *        `extended` once an hour to keep the credit spend sensible.
 */
export async function syncMyShipTracking(opts: { extended?: boolean } = {}): Promise<{ requested: number; matched: number; updated: number; note?: string }> {
  const extended = opts.extended ?? false;
  const apiKey = process.env.MYSHIPTRACKING_API_KEY as string | undefined;
  if (!apiKey) return { requested: 0, matched: 0, updated: 0, note: "MYSHIPTRACKING_API_KEY not set — skipped" };

  const { data: yachts } = await fetchAllRows(() => (supabaseAdmin as any)
    .from("yachts").select("id, mmsi, imo_no, ais_navstat").eq("archive", false).order("id"));
  const rows = (yachts ?? []) as YachtRow[];

  // Prefer a valid MMSI; fall back to the IMO when the MMSI is missing OR invalid
  // (several yachts hold junk like "MAR0070343" or 8-digit numbers). De-dupe ids.
  const mmsis = [...new Set(rows.map(r => (r.mmsi ?? "").trim()).filter(v => /^\d{9}$/.test(v)))];
  const imosAll = rows.filter(r => !/^\d{9}$/.test((r.mmsi ?? "").trim())).map(r => (r.imo_no ?? "").trim());
  const imos = [...new Set(imosAll.filter(v => /^\d{7}$/.test(v)))];
  if (!mmsis.length && !imos.length) return { requested: 0, matched: 0, updated: 0, note: "no yachts with a valid MMSI/IMO" };

  // Batch: up to 100 combined identifiers per request.
  const batches: { mmsi: string[]; imo: string[] }[] = [];
  const ids = [...mmsis.map(v => ({ kind: "mmsi" as const, v })), ...imos.map(v => ({ kind: "imo" as const, v }))];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    batches.push({
      mmsi: chunk.filter(c => c.kind === "mmsi").map(c => c.v),
      imo: chunk.filter(c => c.kind === "imo").map(c => c.v),
    });
  }

  const byMmsi = new Map<string, any>();
  const byImo = new Map<string, any>();
  for (const b of batches) {
    const params = new URLSearchParams({ response: extended ? "extended" : "simple" });
    if (b.mmsi.length) params.set("mmsi", b.mmsi.join(","));
    if (b.imo.length) params.set("imo", b.imo.join(","));
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error(`MyShipTracking returned non-JSON (${res.status}): ${text.slice(0, 140)}`); }
    if (!res.ok || json?.status === "error") throw new Error(`MyShipTracking error (${res.status}): ${json?.message ?? json?.error ?? text.slice(0, 140)}`);
    for (const rec of (json?.data ?? [])) {
      if (rec.mmsi != null) byMmsi.set(String(rec.mmsi), rec);
      if (rec.imo != null) byImo.set(String(rec.imo), rec);
    }
  }

  const now = new Date().toISOString();
  let matched = 0, updated = 0;
  const updates: Promise<unknown>[] = [];

  for (const y of rows) {
    const rec = (y.mmsi && byMmsi.get(y.mmsi.trim())) || (y.imo_no && byImo.get(y.imo_no.trim()));
    if (!rec) continue;
    matched++;

    const navstat = rec.nav_status != null ? Number(rec.nav_status) : null;
    const speed = rec.speed != null ? Number(rec.speed) : null;
    const positionAt = toIso(rec.received) ?? now;
    const movingNow = isMoving(navstat, speed);
    const movingPrev = isMoving(y.ais_navstat, null);

    const patch: Record<string, any> = {
      ais_lat: rec.lat != null ? Number(rec.lat) : null,
      ais_lon: rec.lng != null ? Number(rec.lng) : null,
      ais_speed: speed,
      ais_course: rec.course != null ? Number(rec.course) : null,
      ais_heading: rec.heading != null ? Number(rec.heading) : (rec.course != null ? Number(rec.course) : null),
      ais_navstat: navstat,
      ais_position_at: positionAt,
      ais_synced_at: now,
    };
    // Voyage fields only come in the extended response — a simple run must not
    // blank the destination/ETA the hourly extended run wrote.
    if (extended) {
      patch.ais_destination = rec.destination ? String(rec.destination) : null;
      patch.ais_eta = rec.eta ? String(rec.eta) : (rec.next_port_eta_utc ? String(rec.next_port_eta_utc) : null);
    }

    // Voyage-state transitions (same rules as the other AIS sources).
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
