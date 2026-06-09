/**
 * myGPS (GPS-Server.net) live vehicle positions proxy.
 * Runs on the Cloudflare Worker — holds the access token as a secret and calls
 * the provider's `ax` API server-side (the browser can't: CORS + secret token).
 *
 * Auth flow: GET ax/user/login.php?sid=<token> sets a PILOTID session cookie;
 * GET ax/current_data.php (with that cookie) returns all objects + last position.
 *
 * Secret: MYGPS_ACCESS_TOKEN (a myGPS "Access token" sid from Settings → Tokens).
 */
import { createServerFn } from "@tanstack/react-start";

const BASE = "https://tracking.mygps.ae/backend";

export type FleetVehicle = {
  id: number;
  name: string;
  lat: number | null;
  lon: number | null;
  course: number;          // heading 0-359
  driver: string | null;
  driverPhone: string | null;
  status: string | null;   // last event text e.g. "Stop", "Moving"
  lastUpdate: string | null; // ISO
  online: boolean;
};

function parsePilotId(setCookie: string | null, all: string[] | undefined): string | null {
  const candidates = [...(all ?? []), ...(setCookie ? [setCookie] : [])];
  for (const c of candidates) {
    const m = /PILOTID=([^;]+)/.exec(c);
    if (m) return m[1];
  }
  return null;
}

export const getFleetPositions = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ vehicles: FleetVehicle[]; fetchedAt: string }> => {
    const token = process.env.MYGPS_ACCESS_TOKEN as string | undefined;
    if (!token) throw new Error("myGPS is not configured — set the MYGPS_ACCESS_TOKEN secret.");

    // 1. Authenticate → session cookie
    const loginRes = await fetch(`${BASE}/ax/user/login.php?sid=${encodeURIComponent(token)}`, { redirect: "manual" });
    const getSetCookie = (loginRes.headers as any).getSetCookie?.bind(loginRes.headers) as undefined | (() => string[]);
    const pilot = parsePilotId(loginRes.headers.get("set-cookie"), getSetCookie?.());
    if (!pilot) throw new Error("myGPS login failed — the access token may be invalid or revoked.");

    // 2. Pull current data
    const dataRes = await fetch(`${BASE}/ax/current_data.php`, { headers: { cookie: `PILOTID=${pilot}` } });
    if (!dataRes.ok) throw new Error(`myGPS data request failed (${dataRes.status}).`);
    const json = await dataRes.json() as any;
    const objects: any[] = Array.isArray(json?.objects) ? json.objects : [];

    const vehicles: FleetVehicle[] = objects.map(o => ({
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
    }));

    return { vehicles, fetchedAt: new Date().toISOString() };
  });
