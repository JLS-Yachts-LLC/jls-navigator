/**
 * Permit expiry — what counts on a vessel, how long it has left, and who looks
 * after it (SD-0047). Shared by the Vessel Overview countdown and the daily
 * expiry alerts, so the screen and the emails always agree.
 *
 * "Current" means the latest-expiring permit of each kind on each vessel: once a
 * permit has been renewed, the old one stops counting. A vessel's cruising
 * permit can also be known only from the vessel record's own "Cruising Permit
 * Expiry" field (some renewals were typed there without a permit being added),
 * so for that kind the later of the two wins.
 */

/** Kinds tracked for expiry. Gate passes and exit/entry permits are per visit, so left out. */
export const TRACKED_PERMIT_TYPES = [
  "cruising_mothership", "cruising_tenders", "dma", "navigation_license", "sanitation", "tdra", "abu_dhabi",
] as const;
const TRACKED = new Set<string>(TRACKED_PERMIT_TYPES);

/** Reminder points, in days before expiry (0 = on the day it expires). */
export const ALERT_THRESHOLDS = [60, 30, 7, 0] as const;
export type AlertThreshold = (typeof ALERT_THRESHOLDS)[number];

/** How far back an expired permit still shows on the vessel — after that it is history. */
export const SHOW_EXPIRED_FOR_DAYS = 60;

export type ExpiryPermitRow = {
  id: string;
  yacht_id: string | null;
  permit_type: string;
  permit_number: string | null;
  issuing_authority: string | null;
  dma_phase: string | null;
  expiry_date: string | null;
  status: string | null;
};

export type VesselExpiryRow = { id: string; cruising_permit_expiry?: string | null };

export type CurrentPermit = {
  /** vessel + kind (+ Abu Dhabi permit type) */
  key: string;
  yachtId: string;
  permitType: string;
  label: string;
  /** null when the date comes from the vessel record, not a permit */
  permitId: string | null;
  permitNumber: string | null;
  authority: string | null;
  expiryDate: string;
  days: number;
  fromVesselRecord: boolean;
};

/** Today's date (YYYY-MM-DD) in the UAE — the date the crew and agents live by. */
export function todayUae(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

/** Whole days from `today` to `date` (both YYYY-MM-DD). Negative once expired. */
export function daysBetween(today: string, date: string): number {
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** Long authority names as stored → the short form the agents use (others are shown as entered). */
const AUTHORITY_SHORT: Record<string, string> = {
  "dubai maritime city authority": "DMA",
};
function shortAuthority(a: string | null): string | null {
  const t = (a ?? "").trim();
  if (!t) return null;
  return AUTHORITY_SHORT[t.toLowerCase()] ?? t;
}

/** The name the agents use: "FMA cruising permit", "DMA permit · Phase 2". */
export function permitLabel(type: string, authority: string | null, phase: string | null): string {
  const auth = shortAuthority(authority);
  switch (type) {
    case "cruising_mothership": return auth ? `${auth} cruising permit` : "Cruising permit";
    case "cruising_tenders": return auth ? `${auth} tender cruising permit` : "Tender cruising permit";
    case "dma": return phase ? `DMA permit · ${phase}` : "DMA permit";
    case "navigation_license": return "Navigation licence";
    case "sanitation": return "Sanitation certificate";
    case "tdra": return "TDRA";
    case "abu_dhabi": return phase ? `Abu Dhabi · ${phase}` : "Abu Dhabi permit";
    default: return type;
  }
}

/**
 * The current permit of each kind on each vessel, soonest to expire first.
 * `vessels` supplies the vessel record's own cruising permit date.
 */
export function currentPermits(
  rows: ExpiryPermitRow[],
  vessels: VesselExpiryRow[],
  today: string,
  opts: { showExpiredForDays?: number } = {},
): CurrentPermit[] {
  const best = new Map<string, ExpiryPermitRow>();
  for (const r of rows) {
    if (!r.yacht_id || !r.expiry_date || r.status === "cancelled" || !TRACKED.has(r.permit_type)) continue;
    const key = `${r.yacht_id}|${r.permit_type}${r.permit_type === "abu_dhabi" && r.dma_phase ? `|${r.dma_phase}` : ""}`;
    const have = best.get(key);
    if (!have || (r.expiry_date ?? "") > (have.expiry_date ?? "")) best.set(key, r);
  }

  const out: CurrentPermit[] = [];
  const cruisingSeen = new Set<string>();
  for (const [key, r] of best) {
    let expiryDate = r.expiry_date!;
    let fromVesselRecord = false;
    if (r.permit_type === "cruising_mothership") {
      cruisingSeen.add(r.yacht_id!);
      const v = vessels.find((x) => x.id === r.yacht_id)?.cruising_permit_expiry ?? null;
      if (v && v > expiryDate) { expiryDate = v; fromVesselRecord = true; }
    }
    out.push({
      key, yachtId: r.yacht_id!, permitType: r.permit_type,
      label: permitLabel(r.permit_type, r.issuing_authority, r.dma_phase),
      permitId: fromVesselRecord ? null : r.id,
      permitNumber: fromVesselRecord ? null : r.permit_number,
      authority: r.issuing_authority,
      expiryDate, days: daysBetween(today, expiryDate), fromVesselRecord,
    });
  }
  // A cruising permit known only from the vessel record.
  for (const v of vessels) {
    if (!v.cruising_permit_expiry || cruisingSeen.has(v.id)) continue;
    out.push({
      key: `${v.id}|cruising_mothership`, yachtId: v.id, permitType: "cruising_mothership",
      label: "Cruising permit", permitId: null, permitNumber: null, authority: null,
      expiryDate: v.cruising_permit_expiry, days: daysBetween(today, v.cruising_permit_expiry), fromVesselRecord: true,
    });
  }
  const floor = -(opts.showExpiredForDays ?? SHOW_EXPIRED_FOR_DAYS);
  return out.filter((p) => p.days >= floor).sort((a, b) => a.days - b.days);
}

export type ExpiryTone = "expired" | "critical" | "soon" | "upcoming" | "ok";

/** Red when expired or within 7 days, amber within 30, a softer amber within 60. */
export function expiryTone(days: number): ExpiryTone {
  if (days < 0) return "expired";
  if (days <= 7) return "critical";
  if (days <= 30) return "soon";
  if (days <= 60) return "upcoming";
  return "ok";
}

export function daysText(days: number): string {
  if (days < -1) return `Expired ${-days} days ago`;
  if (days === -1) return "Expired yesterday";
  if (days === 0) return "Expires today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

export function daysShort(days: number): string {
  if (days < 0) return "Expired";
  if (days === 0) return "Today";
  return `${days}d`;
}

/** The reminder due for a permit with `days` left, if any. An expired permit gets one, for 3 days. */
export function thresholdFor(days: number): AlertThreshold | null {
  if (days <= 0) return days >= -3 ? 0 : null;
  if (days <= 7) return 7;
  if (days <= 30) return 30;
  if (days <= 60) return 60;
  return null;
}

export type VesselAgent = { yacht_id: string; user_id: string; covers: string[] | null; created_at?: string };

/** Agents responsible for a kind of permit on a vessel: those covering it, or covering everything. */
export function agentsFor(permitType: string, agents: VesselAgent[]): VesselAgent[] {
  return agents.filter((a) => !a.covers?.length || a.covers.includes(permitType));
}
