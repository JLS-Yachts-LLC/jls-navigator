/**
 * Port Operations wall — builds the one summary a paired TV screen shows.
 *
 * Runs with the service role (the screen has no login), so it is the fence:
 * it only ever selects operational, non-confidential columns — vessel names,
 * berths, ETAs/ETDs, AIS positions — and crew movements as COUNTS per vessel
 * (no names, passports or contact numbers). Owners, client contacts, documents
 * and money never leave this file.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllRows } from "@/lib/fetch-all";
import type {
  PositionState, WallArrival, WallBoard, WallBunker, WallDeparture, WallMapPoint,
  WallMovement, WallPermit, WallPosition, WallVessel, WallWeather,
} from "@/lib/wall-types";

const UAE_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" });
const uaeDate = (d: Date) => UAE_DAY.format(d);
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000);

/** AIS destinations are free text typed by the crew ("DUBAI", "AE DXB", "PORT RASHID"…). */
const UAE_DESTINATION = /\b(UAE|AE ?(DXB|AUH|JEA|RSH|FJR|SHJ|KLF|MRP|RKT|AJM|PRA|MKH|ZYU)|DUBAI|DXB|ABU ?DHABI|AUH|RASHID|JEBEL ?ALI|MINA|SHARJAH|FUJAIRAH|RAS ?AL ?KHAIMAH|RAK|AJMAN|KHOR ?FAKKAN|YAS|SAADIYAT|DUBAI HARBOU?R)\b/i;

const IN_COUNTRY = new Set(["in country", "arrived"]);
const ARRIVING = new Set(["arriving", "pending", "expected"]);
const STALE_MS = 48 * 3_600_000;

/** Same "is it moving" rule the AIS sync jobs and the live map use. */
function isMoving(navstat: number | null, speed: number | null): boolean {
  if (navstat === 0 || navstat === 8) return true;
  if (navstat === 1 || navstat === 5) return false;
  return (speed ?? 0) > 0.5;
}

function positionOf(y: any, now: number): WallPosition | null {
  if (y.ais_lat == null || y.ais_lon == null) return null;
  const at: string | null = y.ais_position_at ?? null;
  const moving = isMoving(y.ais_navstat ?? null, y.ais_speed ?? null);
  const state: PositionState = moving ? "underway" : y.ais_navstat === 1 ? "anchored" : y.ais_navstat === 5 || (y.ais_speed ?? 1) <= 0.5 ? "moored" : "unknown";
  return {
    lat: Number(y.ais_lat), lon: Number(y.ais_lon), at, state,
    speed: y.ais_speed ?? null, heading: y.ais_heading ?? y.ais_course ?? null,
    stale: !at || now - new Date(at).getTime() > STALE_MS,
  };
}

// ── Weather: Dubai coast, cached per isolate so many screens cost one call ──
let weatherCache: { at: number; value: WallWeather | null } | null = null;
async function dubaiWeather(): Promise<WallWeather | null> {
  if (weatherCache && Date.now() - weatherCache.at < 10 * 60_000) return weatherCache.value;
  let value: WallWeather | null = null;
  try {
    const [wx, sea] = await Promise.all([
      fetch("https://api.open-meteo.com/v1/forecast?latitude=25.27&longitude=55.29&current=temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=kn&timezone=Asia%2FDubai", { signal: AbortSignal.timeout(4000) })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("https://marine-api.open-meteo.com/v1/marine?latitude=25.30&longitude=55.20&current=wave_height&timezone=Asia%2FDubai", { signal: AbortSignal.timeout(4000) })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const c = (wx as any)?.current;
    if (c) {
      value = {
        temperature: c.temperature_2m ?? null,
        windSpeed: c.wind_speed_10m ?? null,
        windGust: c.wind_gusts_10m ?? null,
        windDirection: c.wind_direction_10m ?? null,
        waveHeight: (sea as any)?.current?.wave_height ?? null,
        observedAt: c.time ?? null,
      };
    }
  } catch { /* weather is a nice-to-have — the board still renders */ }
  weatherCache = { at: Date.now(), value };
  return value;
}

export async function buildWallBoard(): Promise<WallBoard> {
  const db = supabaseAdmin as any;
  const now = Date.now();
  const today = uaeDate(new Date());

  const [yachtsRes, movesRes, bunkerRes, weather] = await Promise.all([
    fetchAllRows<any>(() => db.from("yachts").select(`
      id, vessel_name, status, archive, berth, location, eta, etd, departed_date, cruising_permit_expiry,
      ais_lat, ais_lon, ais_speed, ais_course, ais_heading, ais_navstat, ais_destination, ais_eta, ais_position_at,
      underway_since, last_departed_at, last_arrived_at
    `).order("vessel_name")),
    db.from("crew_signon_events")
      .select("yacht_id, event_type, event_date, port, flight_number, status, pickup_required")
      .gte("event_date", today).lte("event_date", addDays(today, 2))
      .limit(1000),
    db.from("bunker_enquiries")
      .select("yacht_name, preferred_date, preferred_time, port, berth, fuel_type, fuel_other, quantity, quantity_unit, status")
      .gte("preferred_date", today).lte("preferred_date", addDays(today, 3))
      .order("preferred_date").limit(100),
    dubaiWeather(),
  ]);

  const all: any[] = yachtsRes.data ?? [];
  const nameById = new Map<string, string>(all.map((y) => [y.id, y.vessel_name]));
  const live = all.filter((y) => !y.archive && y.vessel_name);
  const statusOf = (y: any) => String(y.status ?? "").trim().toLowerCase();

  // ── In country ──
  const inCountryRows = live.filter((y) => IN_COUNTRY.has(statusOf(y)));
  const inCountry: WallVessel[] = inCountryRows.map((y) => ({
    id: y.id, name: y.vessel_name, berth: y.berth ?? null, location: y.location ?? null,
    since: y.last_arrived_at ?? null, etd: y.etd ?? null, position: positionOf(y, now),
  })).sort((a, b) => (a.location ?? "~").localeCompare(b.location ?? "~") || a.name.localeCompare(b.name));
  const inCountryIds = new Set(inCountryRows.map((y) => y.id));

  // ── Arriving: marked Arriving/Pending, a future agency ETA, or AIS says it's heading here ──
  const arriving: WallArrival[] = [];
  for (const y of live) {
    if (inCountryIds.has(y.id)) continue;
    const st = statusOf(y);
    if (st === "change agency") continue;
    const pos = positionOf(y, now);
    const aisInbound = !!y.ais_destination && UAE_DESTINATION.test(y.ais_destination) && pos?.state === "underway" && !pos.stale;
    const futureEta = !!y.eta && y.eta >= today && st !== "departed";
    if (!ARRIVING.has(st) && !futureEta && !aisInbound) continue;
    const aisEta = y.ais_eta && !isNaN(new Date(y.ais_eta).getTime()) ? new Date(y.ais_eta).toISOString() : null;
    const eta = y.eta && y.eta >= today ? y.eta : aisInbound && aisEta ? aisEta : y.eta ?? aisEta;
    arriving.push({
      id: y.id, name: y.vessel_name, eta,
      etaSource: eta == null ? null : eta === y.eta ? "agency" : "ais",
      destination: y.ais_destination ?? null, status: y.status ?? null, position: pos,
    });
  }
  arriving.sort((a, b) => (a.eta ?? "9999").localeCompare(b.eta ?? "9999"));

  // ── Departures: leaving within 14 days, and those that left in the last 7 ──
  const departures: WallDeparture[] = [];
  for (const y of inCountryRows) {
    if (y.etd && y.etd >= today && y.etd <= addDays(today, 14)) {
      departures.push({ id: y.id, name: y.vessel_name, kind: "upcoming", date: y.etd, berth: y.berth ?? null, location: y.location ?? null, destination: null });
    }
  }
  const weekAgo = addDays(today, -7);
  for (const y of live) {
    if (statusOf(y) !== "departed") continue;
    const left: string | null = y.last_departed_at ?? y.departed_date ?? null;
    if (!left || left.slice(0, 10) < weekAgo) continue;
    departures.push({ id: y.id, name: y.vessel_name, kind: "departed", date: left, berth: null, location: null, destination: y.ais_destination ?? null });
  }
  departures.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "upcoming" ? -1 : 1) || (a.kind === "upcoming" ? (a.date ?? "").localeCompare(b.date ?? "") : (b.date ?? "").localeCompare(a.date ?? "")));

  // ── Map: everything with a position — in country, inbound, or recently moving ──
  const arrivingIds = new Set(arriving.map((a) => a.id));
  const map: WallMapPoint[] = [];
  let underway = 0;
  for (const y of live) {
    const pos = positionOf(y, now);
    if (!pos) continue;
    const moving = pos.state === "underway" && !pos.stale;
    if (moving) underway++;
    if (!inCountryIds.has(y.id) && !arrivingIds.has(y.id) && !moving) continue;
    map.push({ id: y.id, name: y.vessel_name, lat: pos.lat, lon: pos.lon, heading: pos.heading, moving, inCountry: inCountryIds.has(y.id), stale: pos.stale });
  }

  // ── Crew movements: counts per vessel per day, never names ──
  const moveKey = new Map<string, WallMovement>();
  for (const e of (movesRes.data ?? []) as any[]) {
    if (String(e.status ?? "").toLowerCase() === "cancelled") continue;
    const vessel = nameById.get(e.yacht_id) ?? "Unassigned";
    const key = `${e.event_date}|${vessel}`;
    const m: WallMovement = moveKey.get(key) ?? { date: e.event_date, vessel, signOn: 0, signOff: 0, ports: [], flights: [], pickups: 0 };
    if (e.event_type === "sign_on") m.signOn++; else if (e.event_type === "sign_off") m.signOff++;
    if (e.port && !m.ports.includes(e.port)) m.ports.push(e.port);
    const flight = e.flight_number ? String(e.flight_number).replace(/\s+/g, "").toUpperCase() : null;
    if (flight && !m.flights.includes(flight)) m.flights.push(flight);
    if (e.pickup_required) m.pickups++;
    moveKey.set(key, m);
  }
  const movements = [...moveKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.vessel.localeCompare(b.vessel));

  // ── Bunker deliveries in the next few days ──
  const bunkering: WallBunker[] = ((bunkerRes.data ?? []) as any[])
    .filter((b) => !["cancelled", "declined", "rejected", "draft"].includes(String(b.status ?? "").toLowerCase()))
    .map((b) => ({
      vessel: b.yacht_name ?? "—", date: b.preferred_date, time: b.preferred_time ?? null,
      port: b.port ?? null, berth: b.berth ?? null,
      fuel: b.fuel_type === "other" ? b.fuel_other ?? "Other" : b.fuel_type ?? null,
      quantity: b.quantity != null ? `${Number(b.quantity).toLocaleString("en-GB")} ${b.quantity_unit ?? ""}`.trim() : null,
      status: b.status ?? "new",
    }));

  // ── Cruising permits running out for boats that are here ──
  const permits: WallPermit[] = inCountryRows
    .filter((y) => y.cruising_permit_expiry && y.cruising_permit_expiry >= addDays(today, -3) && y.cruising_permit_expiry <= addDays(today, 14))
    .map((y) => ({ vessel: y.vessel_name, expires: y.cruising_permit_expiry, days: daysBetween(today, y.cruising_permit_expiry) }))
    .sort((a, b) => a.days - b.days);

  const departing = departures.filter((d) => d.kind === "upcoming" && d.date && d.date <= addDays(today, 7)).length;
  const movementsToday = movements.filter((m) => m.date === today).reduce((n, m) => n + m.signOn + m.signOff, 0);

  return {
    generatedAt: new Date().toISOString(),
    today,
    kpis: { inCountry: inCountry.length, arriving: arriving.length, underway, departing, movementsToday },
    inCountry, arriving, departures, map, movements, bunkering, permits, weather,
  };
}
