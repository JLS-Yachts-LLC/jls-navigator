/**
 * Port Operations wall — the shapes the TV page receives from /api/wall/display.
 * Shared by the server builder (wall-board.server.ts) and the page, so it holds
 * types and the panel list only — nothing that touches the database.
 *
 * Everything here is deliberately non-confidential: vessel names, berths,
 * positions and counts. No crew names, owners, client contacts, documents or money.
 */

export const WALL_PANELS = [
  { key: "in_country", label: "Vessels in country" },
  { key: "arriving", label: "Arriving" },
  { key: "departures", label: "Departures" },
  { key: "map", label: "Live map" },
  { key: "movements", label: "Crew movements (counts only)" },
  { key: "bunkering", label: "Bunker deliveries" },
  { key: "permits", label: "Cruising permits expiring" },
  { key: "weather", label: "Weather & sea" },
] as const;

export type WallPanelKey = (typeof WALL_PANELS)[number]["key"];

export interface WallSettings {
  /** Panels to show; missing/empty = all of them. */
  panels?: WallPanelKey[];
  /** Heading across the top of the screen. */
  title?: string;
  /**
   * Tap a boat for its details, pan/zoom the map. Missing = on; only an explicit
   * false switches it off (the board then runs hands-off, as before).
   */
  interactive?: boolean;
}

export const isInteractive = (s: WallSettings) => s.interactive !== false;

export type PositionState = "moored" | "anchored" | "underway" | "unknown";

export interface WallPosition {
  lat: number;
  lon: number;
  at: string | null;
  state: PositionState;
  speed: number | null;
  heading: number | null;
  /** Older than 48 hours — shown greyed out. */
  stale: boolean;
}

export interface WallVessel {
  id: string;
  name: string;
  berth: string | null;
  location: string | null;
  /** When it arrived (AIS) — "in since". */
  since: string | null;
  etd: string | null;
  position: WallPosition | null;
}

export interface WallArrival {
  id: string;
  name: string;
  /** yyyy-mm-dd (agency ETA) or ISO timestamp (AIS ETA). */
  eta: string | null;
  etaSource: "agency" | "ais" | null;
  destination: string | null;
  status: string | null;
  position: WallPosition | null;
}

export interface WallDeparture {
  id: string;
  name: string;
  kind: "upcoming" | "departed";
  /** Upcoming: the ETD. Departed: when it left. */
  date: string | null;
  berth: string | null;
  location: string | null;
  destination: string | null;
}

export interface WallMapPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  heading: number | null;
  moving: boolean;
  inCountry: boolean;
  stale: boolean;
}

export interface WallMovement {
  date: string;
  vessel: string;
  /** null when the movement isn't linked to a vessel ("Unassigned"). */
  vesselId: string | null;
  signOn: number;
  signOff: number;
  ports: string[];
  flights: string[];
  pickups: number;
}

export interface WallBunker {
  vessel: string;
  date: string;
  time: string | null;
  port: string | null;
  berth: string | null;
  fuel: string | null;
  quantity: string | null;
  status: string;
}

export interface WallPermit {
  vesselId: string;
  vessel: string;
  expires: string;
  days: number;
}

export interface WallWeather {
  temperature: number | null;
  windSpeed: number | null;
  windGust: number | null;
  windDirection: number | null;
  waveHeight: number | null;
  observedAt: string | null;
}

export interface WallBoard {
  generatedAt: string;
  today: string;
  kpis: { inCountry: number; arriving: number; underway: number; departing: number; movementsToday: number };
  inCountry: WallVessel[];
  arriving: WallArrival[];
  departures: WallDeparture[];
  map: WallMapPoint[];
  movements: WallMovement[];
  bunkering: WallBunker[];
  permits: WallPermit[];
  weather: WallWeather | null;
}

/**
 * One vessel's details, opened by tapping it on the board. Same fence as the
 * board: dates, places, positions and counts — never documents, names or money.
 */
export interface WallVesselDetail {
  id: string;
  name: string;
  status: string | null;
  berth: string | null;
  location: string | null;
  /** Arrived (AIS) — "in since". */
  since: string | null;
  /** Agency ETA (yyyy-mm-dd). */
  eta: string | null;
  /** ETA the crew typed into AIS (ISO). */
  aisEta: string | null;
  aisDestination: string | null;
  etd: string | null;
  departed: string | null;
  position: WallPosition | null;
  /** Expiry dates only — no permit numbers, holders or documents. */
  permits: { label: string; expires: string; days: number }[];
  /** Crew sign on/off over the next two weeks, as counts per day. */
  movements: { date: string; signOn: number; signOff: number; pickups: number }[];
}

export type WallDisplayResponse =
  | { state: "pending"; code: string; expiresAt: string }
  | { state: "paired"; name: string; settings: WallSettings; board: WallBoard }
  | { state: "unknown" };

export function normaliseWallSettings(raw: unknown): WallSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const valid = new Set<string>(WALL_PANELS.map((p) => p.key));
  const panels = Array.isArray(s.panels)
    ? (s.panels.filter((p) => typeof p === "string" && valid.has(p)) as WallPanelKey[])
    : undefined;
  const title = typeof s.title === "string" ? s.title.trim().slice(0, 80) : undefined;
  return {
    ...(panels && panels.length ? { panels } : {}),
    ...(title ? { title } : {}),
    ...(s.interactive === false ? { interactive: false } : {}),
  };
}
