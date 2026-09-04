/**
 * ShipSync — Warehouse module shared vocabulary + display helpers.
 * Real data lives in src/lib/warehouse/data.ts; this file is UI-only
 * constants and small pure functions shared across the warehouse screens.
 */
import type { Zone, WarehouseClientItem, WarehouseInternalItem } from "@/lib/warehouse/data";

export const ZONES: Zone[] = ["A", "B", "C", "D", "E"];

export type CapacityStatus = "Safe" | "Warning" | "Full/Restricted";
export const CAPACITY_STATUS_STYLE: Record<CapacityStatus, string> = {
  "Safe": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  "Warning": "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  "Full/Restricted": "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
};
export function capacityStatus(usedPct: number): CapacityStatus {
  if (usedPct >= 95) return "Full/Restricted";
  if (usedPct >= 75) return "Warning";
  return "Safe";
}

/** The four/seven display statuses per the spec — these are DERIVED at read
 *  time from a due/destruction date, never stored, so a list never shows a
 *  stale "Stored" after its due date has quietly passed. A manually-set
 *  terminal state (Completed / Checked Out / Returned / Disposed) always
 *  wins over anything date-derived. */
export type DisplayStatus = "Stored" | "Due Soon" | "Overdue" | "Checked Out" | "Returned" | "Disposed" | "Completed";
export const DISPLAY_STATUS_STYLE: Record<DisplayStatus, string> = {
  "Stored": "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20",
  "Due Soon": "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  "Overdue": "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  "Checked Out": "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20",
  "Returned": "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  "Disposed": "bg-rose-800/15 text-rose-700 dark:text-rose-400 border-rose-800/20",
  "Completed": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

/** Days-ahead window for "Due Soon" — a due/destruction date inside this
 *  window (but not yet passed) is flagged for follow-up. */
const DUE_SOON_WINDOW_DAYS = 14;

/** Derive the display status for a Client/Internal item: `manualStatus` wins
 *  once it's anything other than the default 'Stored' (i.e. once someone's
 *  explicitly marked it Completed); otherwise Stored/Due Soon/Overdue is
 *  computed from `dateField` against today. */
export function deriveStatus(dateField: string | null, manualStatus: string): DisplayStatus {
  if (manualStatus !== "Stored") return manualStatus as DisplayStatus;
  if (!dateField) return "Stored";
  const days = Math.ceil((new Date(dateField + "T00:00").getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "Overdue";
  if (days <= DUE_SOON_WINDOW_DAYS) return "Due Soon";
  return "Stored";
}

export const INTERNAL_DEPARTMENTS = ["Accounts", "Marketing", "IT", "Logistics", "Training", "Other"] as const;

/** Every storage spot is Zone → Bay → Shelf (three separate fields per the
 *  spec, not one combined code) — this just renders them compactly for
 *  table cells / search results. */
export interface StorageLocation { zone: Zone | string | null; bay: string | null; shelf: string | null }
export function locationCode(loc: StorageLocation): string {
  if (!loc.zone) return "—";
  return `${loc.zone}${loc.bay ?? ""}-${loc.shelf ?? ""}`;
}

/** CBM (cubic metres) from L×W×H in centimetres — the same conversion used
 *  everywhere this module asks for it. */
export function calcCbm(lengthCm: number, widthCm: number, heightCm: number): number {
  if (!lengthCm || !widthCm || !heightCm) return 0;
  return (lengthCm * widthCm * heightCm) / 1_000_000;
}

/** A "Completed" item has finished its storage process — it no longer
 *  occupies real shelf space for capacity purposes, everything else does. */
const occupiesSpace = (status: string) => status !== "Completed";

/** Volume + weight currently occupying a specific shelf, from real client +
 *  internal items assigned to it — there's no stored per-shelf counter (that
 *  would drift out of sync with the items themselves), so this is always
 *  computed fresh from the item rows. */
export function shelfUsage(
  zone: string, bay: string, shelf: string,
  clientItems: WarehouseClientItem[], internalItems: WarehouseInternalItem[],
): { usedCbm: number; usedWeightKg: number } {
  let usedCbm = 0, usedWeightKg = 0;
  for (const it of clientItems) {
    if (it.zone === zone && it.bay === bay && it.shelf === shelf && occupiesSpace(it.status)) {
      usedCbm += it.cbm ?? 0; usedWeightKg += it.weight_kg ?? 0;
    }
  }
  for (const it of internalItems) {
    if (it.zone === zone && it.bay === bay && it.shelf === shelf && occupiesSpace(it.status)) {
      usedCbm += it.cbm ?? 0; usedWeightKg += it.weight_kg ?? 0;
    }
  }
  return { usedCbm, usedWeightKg };
}
