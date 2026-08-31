/**
 * Free live vessel tracking via AISStream.io (https://aisstream.io).
 *
 * AISStream is a free, community terrestrial-AIS feed delivered over a
 * WebSocket. We connect, subscribe filtered to our fleet's MMSIs, collect each
 * vessel's latest PositionReport for a short window, then write the positions
 * onto the yachts table (ais_lat/lon/speed/course/heading/navstat). The
 * "My Fleet (Live)" map reads those columns and renders them on our own Leaflet
 * map — no fleet-size limit, no subscription.
 *
 * Coverage note: AISStream is terrestrial only (coastal / near-port). Vessels
 * far offshore won't report until back in range — satellite AIS is the paid part.
 *
 * Setup: create a free key at https://aisstream.io and set it as the Worker
 * secret AISSTREAM_API_KEY (`npx wrangler secret put AISSTREAM_API_KEY`).
 */
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllRows } from "./fetch-all";

const STREAM_URL = "https://stream.aisstream.io/v0/stream";

export interface AisYacht {
  id: string;
  vessel_name: string;
  mmsi: string | null;
  imo: string | null;
  vesselType: string | null;
  flag: string | null;
  portOfRegistry: string | null;
  lengthOverallM: number | null;
  callSign: string | null;
  lat: number | null;
  lon: number | null;
  speed: number | null;
  course: number | null;
  heading: number | null;
  navstat: number | null;
  destination: string | null;
  eta: string | null;
  underwaySince: string | null;
  lastDepartedAt: string | null;
  lastArrivedAt: string | null;
  positionAt: string | null;
}

/**
 * A valid MMSI is exactly nine digits. AISStream's FiltersShipMMSI silently
 * matches nothing when fed malformed values (IMO numbers, blanks, short codes),
 * so we normalise and validate before subscribing. Returns null if unusable.
 */
function normaliseMmsi(raw: string | null): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return /^\d{9}$/.test(digits) ? digits : null;
}

/**
 * Connect to AISStream, collect the latest position for each fleet MMSI over
 * `collectMs`, and bulk-upsert onto yachts. Safe no-op if no key / no MMSIs.
 */
export async function syncAisPositions(
  collectMs = 25000,
): Promise<{ tracked: number; received: number; updated: number; invalidMmsi?: number; note?: string }> {
  const apiKey = process.env.AISSTREAM_API_KEY as string | undefined;
  if (!apiKey) {
    return { tracked: 0, received: 0, updated: 0, note: "AISStream not configured — set the AISSTREAM_API_KEY secret." };
  }

  // Fleet MMSIs (+ vessel_name, required NOT NULL for the upsert insert-path).
  const { data: yachts } = await fetchAllRows<{ id: string; mmsi: string | null; vessel_name: string }>(() =>
    supabaseAdmin.from("yachts").select("id, mmsi, vessel_name").not("mmsi", "is", null).order("id"));

  // Keyed by normalised 9-digit MMSI so the filter we send matches the metadata
  // AISStream returns (it reports plain numeric MMSIs).
  const byMmsi = new Map<string, { id: string; vessel_name: string }>();
  let invalidMmsi = 0;
  for (const y of yachts ?? []) {
    const m = normaliseMmsi(y.mmsi);
    if (m) byMmsi.set(m, { id: y.id, vessel_name: y.vessel_name });
    else if (String(y.mmsi ?? "").trim()) invalidMmsi++;
  }
  if (byMmsi.size === 0) {
    const note = invalidMmsi > 0
      ? `No valid MMSIs to track — ${invalidMmsi} vessel(s) have a malformed MMSI (must be exactly 9 digits).`
      : "No yachts have an MMSI set — add MMSIs to track them.";
    return { tracked: 0, received: 0, updated: 0, invalidMmsi, note };
  }

  const resp = await fetch(STREAM_URL, { headers: { Upgrade: "websocket" } });
  const ws = (resp as any).webSocket as any;
  if (!ws) throw new Error(`AISStream did not open a WebSocket (HTTP ${resp.status}).`);
  ws.accept();

  const latest = new Map<string, any>();
  let streamError: string | null = null;

  ws.addEventListener("message", (ev: any) => {
    try {
      const text = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data);
      const msg = JSON.parse(text);
      if (msg?.error) { streamError = String(msg.error); return; }
      if (msg?.MessageType !== "PositionReport") return;
      const meta = msg.MetaData ?? {};
      const mmsi = String(meta.MMSI ?? "").trim();
      if (!byMmsi.has(mmsi)) return;
      const pr = msg.Message?.PositionReport ?? {};
      const heading = pr.TrueHeading != null && pr.TrueHeading !== 511 ? pr.TrueHeading : null;
      latest.set(mmsi, {
        lat: meta.latitude ?? pr.Latitude ?? null,
        lon: meta.longitude ?? pr.Longitude ?? null,
        speed: pr.Sog ?? null,
        course: pr.Cog ?? null,
        heading,
        navstat: pr.NavigationalStatus ?? null,
        time: meta.time_utc ?? null,
      });
    } catch { /* ignore malformed frames */ }
  });

  // AISStream requires the subscription within a few seconds of connecting.
  ws.send(JSON.stringify({
    APIKey: apiKey,
    BoundingBoxes: [[[-90, -180], [90, 180]]],
    FiltersShipMMSI: [...byMmsi.keys()],
    FilterMessageTypes: ["PositionReport"],
  }));

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, collectMs);
    ws.addEventListener("close", () => { clearTimeout(timer); resolve(); });
    ws.addEventListener("error", () => { clearTimeout(timer); resolve(); });
  });
  try { ws.close(); } catch { /* already closed */ }

  if (latest.size === 0) {
    const invalidNote = invalidMmsi > 0 ? ` (${invalidMmsi} more have a malformed MMSI and can't be tracked)` : "";
    return {
      tracked: byMmsi.size,
      received: 0,
      updated: 0,
      invalidMmsi,
      note: streamError ?? `No positions received for any of ${byMmsi.size} tracked vessel(s) this window — they may be offshore / out of terrestrial AIS range, or anchored and broadcasting infrequently${invalidNote}.`,
    };
  }

  // Bulk upsert (one call) so the per-invocation subrequest budget isn't blown.
  const nowIso = new Date().toISOString();
  const rows: Record<string, any>[] = [];
  for (const [mmsi, p] of latest) {
    if (p.lat == null || p.lon == null) continue;
    const y = byMmsi.get(mmsi)!;
    rows.push({
      id: y.id,
      vessel_name: y.vessel_name,
      ais_lat: p.lat, ais_lon: p.lon, ais_speed: p.speed, ais_course: p.course,
      ais_heading: p.heading, ais_navstat: p.navstat,
      ais_position_at: p.time ?? nowIso, ais_synced_at: nowIso,
    });
  }
  if (!rows.length) return { tracked: byMmsi.size, received: latest.size, updated: 0, invalidMmsi };
  const { error } = await (supabaseAdmin as any).from("yachts").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(error.message);
  return { tracked: byMmsi.size, received: latest.size, updated: rows.length, invalidMmsi };
}

/** Manually trigger an AIS collection now (used by the "Sync positions" button). */
export const doSyncAis = createServerFn({ method: "POST" }).handler(async () => {
  return await syncAisPositions(25000);
});

/** Read the fleet's latest known AIS positions for the live map. Combines
 *  live AIS columns with the yacht's own static registry details (IMO, flag,
 *  type, length, call sign) — those never change and cost nothing to show,
 *  unlike another AIS API call. */
export const getFleetAisPositions = createServerFn({ method: "GET" }).handler(async (): Promise<{ yachts: AisYacht[]; fetchedAt: string }> => {
  const { data } = await fetchAllRows<any>(() => supabaseAdmin
    .from("yachts")
    .select(`
      id, vessel_name, mmsi, imo_no, vessel_type, flag, port_of_registry, length_overall_m, radio_call_sign,
      ais_lat, ais_lon, ais_speed, ais_course, ais_heading, ais_navstat, ais_destination, ais_eta,
      underway_since, last_departed_at, last_arrived_at, ais_position_at
    `)
    .order("vessel_name"));
  const yachts: AisYacht[] = (data ?? []).map((y: any) => ({
    id: y.id,
    vessel_name: y.vessel_name,
    mmsi: y.mmsi ?? null,
    imo: y.imo_no ?? null,
    vesselType: y.vessel_type ?? null,
    flag: y.flag ?? null,
    portOfRegistry: y.port_of_registry ?? null,
    lengthOverallM: y.length_overall_m ?? null,
    callSign: y.radio_call_sign ?? null,
    lat: y.ais_lat ?? null,
    lon: y.ais_lon ?? null,
    speed: y.ais_speed ?? null,
    course: y.ais_course ?? null,
    heading: y.ais_heading ?? null,
    navstat: y.ais_navstat ?? null,
    destination: y.ais_destination ?? null,
    eta: y.ais_eta ?? null,
    underwaySince: y.underway_since ?? null,
    lastDepartedAt: y.last_departed_at ?? null,
    lastArrivedAt: y.last_arrived_at ?? null,
    positionAt: y.ais_position_at ?? null,
  }));
  return { yachts, fetchedAt: new Date().toISOString() };
});
