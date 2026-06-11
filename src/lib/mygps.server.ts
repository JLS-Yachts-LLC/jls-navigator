/**
 * myGPS (GPS-Server.net) live vehicle positions proxy + sync.
 * Runs on the Cloudflare Worker — holds the access token as a secret and calls
 * the provider's `ax` API server-side (the browser can't: CORS + secret token).
 *
 * Auth flow: GET ax/user/login.php?sid=<token> sets a PILOTID session cookie;
 * GET ax/current_data.php (with that cookie) returns all objects + last position.
 *
 * Secret: MYGPS_ACCESS_TOKEN (a myGPS "Access token" sid from Settings → Tokens).
 *
 * Positions are matched to crew_vehicles by registration (the leading token of
 * the myGPS object name, e.g. "D64328 Tiida" → plate D64328) and the latest
 * position is persisted onto the vehicle record so the Vehicles page shows it.
 */
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllRows } from "./fetch-all";

const BASE = "https://tracking.mygps.ae/backend";

export type FleetVehicle = {
  id: number;
  name: string;
  lat: number | null;
  lon: number | null;
  course: number;
  driver: string | null;
  driverPhone: string | null;
  status: string | null;
  lastUpdate: string | null;
  online: boolean;
  // App linkage (matched by registration plate)
  appVehicleId: string | null;
  appMake: string | null;
  appModel: string | null;
};

function parsePilotId(setCookie: string | null, all: string[] | undefined): string | null {
  for (const c of [...(all ?? []), ...(setCookie ? [setCookie] : [])]) {
    const m = /PILOTID=([^;]+)/.exec(c);
    if (m) return m[1];
  }
  return null;
}

// Leading token of the myGPS object name = registration plate.
function plateOf(name: string): string {
  return (name || "").trim().split(/\s+/)[0]?.toUpperCase() ?? "";
}

async function fetchFleetRaw(): Promise<FleetVehicle[]> {
  const token = process.env.MYGPS_ACCESS_TOKEN as string | undefined;
  if (!token) throw new Error("myGPS is not configured — set the MYGPS_ACCESS_TOKEN secret.");

  const loginRes = await fetch(`${BASE}/ax/user/login.php?sid=${encodeURIComponent(token)}`, { redirect: "manual" });
  const getSetCookie = (loginRes.headers as any).getSetCookie?.bind(loginRes.headers) as undefined | (() => string[]);
  const pilot = parsePilotId(loginRes.headers.get("set-cookie"), getSetCookie?.());
  if (!pilot) throw new Error("myGPS login failed — the access token may be invalid or revoked.");

  const dataRes = await fetch(`${BASE}/ax/current_data.php`, { headers: { cookie: `PILOTID=${pilot}` } });
  if (!dataRes.ok) throw new Error(`myGPS data request failed (${dataRes.status}).`);
  const json = await dataRes.json() as any;
  const objects: any[] = Array.isArray(json?.objects) ? json.objects : [];

  return objects.map(o => ({
    id: Number(o.id ?? o.veh_id),
    name: String(o.name ?? o.veh ?? "Unknown"),
    lat: typeof o.lat === "number" ? o.lat : (o.lat ? Number(o.lat) : null),
    lon: typeof o.lon === "number" ? o.lon : (o.lon ? Number(o.lon) : null),
    course: Number(o.dir ?? 0) || 0,
    driver: o.driver ? String(o.driver) : null,
    driverPhone: o.driver_phone ? String(o.driver_phone) : null,
    status: o.last_event?.text ? String(o.last_event.text) : null,
    lastUpdate: o.unixtimestamp ? new Date(Number(o.unixtimestamp) * 1000).toISOString() : null,
    online: o.on === 1 || o.on === true,
    appVehicleId: null, appMake: null, appModel: null,
  }));
}

type VehIdx = Map<string, { id: string; make: string | null; model: string | null }>;

async function loadVehicleIndex(): Promise<VehIdx> {
  const { data } = await fetchAllRows(() => (supabaseAdmin as any).from("crew_vehicles").select("id, registration, make, model").order("id"));
  const idx: VehIdx = new Map();
  for (const r of (data ?? []) as any[]) {
    if (r.registration) idx.set(String(r.registration).toUpperCase(), { id: r.id, make: r.make, model: r.model });
  }
  return idx;
}

function enrich(vehicles: FleetVehicle[], idx: VehIdx) {
  for (const v of vehicles) {
    const m = idx.get(plateOf(v.name));
    if (m) { v.appVehicleId = m.id; v.appMake = m.make; v.appModel = m.model; }
  }
}

async function persistLocations(vehicles: FleetVehicle[], idx: VehIdx): Promise<number> {
  const now = new Date().toISOString();
  const updates = vehicles
    .map(v => {
      const m = idx.get(plateOf(v.name));
      if (!m) return null;
      return (supabaseAdmin as any).from("crew_vehicles").update({
        gps_object_name: v.name, gps_object_id: v.id,
        last_lat: v.lat, last_lon: v.lon, last_location_at: v.lastUpdate,
        last_status: v.status, last_driver_name: v.driver, location_synced_at: now,
      }).eq("id", m.id);
    })
    .filter(Boolean) as Promise<unknown>[];
  await Promise.all(updates);
  return updates.length;
}

// Page data: enriched vehicles, and persist the latest fix (best-effort).
export const getFleetPositions = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ vehicles: FleetVehicle[]; fetchedAt: string }> => {
    const vehicles = await fetchFleetRaw();
    const idx = await loadVehicleIndex();
    enrich(vehicles, idx);
    try { await persistLocations(vehicles, idx); } catch { /* persistence is best-effort; don't fail the read */ }
    return { vehicles, fetchedAt: new Date().toISOString() };
  });

// Cron entry point (called from the Worker's scheduled handler).
export async function syncFleetPositions(): Promise<{ fetched: number; updated: number }> {
  const vehicles = await fetchFleetRaw();
  const idx = await loadVehicleIndex();
  const updated = await persistLocations(vehicles, idx);
  return { fetched: vehicles.length, updated };
}
