/**
 * ShipSync — Warehouse module shared vocabulary + illustrative sample data.
 *
 * UI-first pass per "Polaris – Warehouse Board: Functions and Requirements" —
 * nothing here reads or writes shipsync_packages or any other real table yet.
 * The SAMPLE_* arrays exist purely so the screens don't look dead during
 * review; every one is clearly fake (obviously placeholder names/numbers)
 * and never touches Supabase. Swap them for real loaders when this module
 * gets wired up for real.
 */

export const ZONES = ["A", "B", "C", "D", "E"] as const;
export type Zone = (typeof ZONES)[number];

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

export type ClientInventoryStatus = "Stored" | "Due Soon" | "Overdue" | "Completed";
export const CLIENT_STATUS_STYLE: Record<ClientInventoryStatus, string> = {
  "Stored": "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20",
  "Due Soon": "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  "Overdue": "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  "Completed": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

export type PackageContentStatus = "Stored" | "Due Soon" | "Overdue" | "Checked Out" | "Returned" | "Disposed" | "Completed";
export const PACKAGE_CONTENT_STATUS_STYLE: Record<PackageContentStatus, string> = {
  "Stored": "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20",
  "Due Soon": "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  "Overdue": "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  "Checked Out": "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20",
  "Returned": "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  "Disposed": "bg-rose-800/15 text-rose-700 dark:text-rose-400 border-rose-800/20",
  "Completed": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

export const INTERNAL_DEPARTMENTS = ["Accounts", "Marketing", "IT", "Logistics", "Training", "Other"] as const;

/** Every storage spot is Zone → Bay → Shelf (three separate fields per the
 *  spec, not one combined code) — this just renders them compactly for
 *  table cells / search results. */
export interface StorageLocation { zone: Zone; bay: string; shelf: string }
export function locationCode(loc: StorageLocation): string { return `${loc.zone}${loc.bay}-${loc.shelf}`; }

/** CBM (cubic metres) from L×W×H in centimetres — the same conversion used
 *  everywhere this module asks for it. */
export function calcCbm(lengthCm: number, widthCm: number, heightCm: number): number {
  if (!lengthCm || !widthCm || !heightCm) return 0;
  return (lengthCm * widthCm * heightCm) / 1_000_000;
}

// ── Illustrative sample data (obviously placeholder — no real client/vessel
//    names, deliberately round numbers) ──────────────────────────────────────

export interface SampleZoneCapacity {
  zone: Zone;
  maxWeightKg: number;
  usedWeightKg: number;
  maxCbm: number;
  usedCbm: number;
  maxShelves: number;
  usedShelves: number;
}
export const SAMPLE_ZONE_CAPACITY: SampleZoneCapacity[] = [
  { zone: "A", maxWeightKg: 20000, usedWeightKg: 8400, maxCbm: 240, usedCbm: 96, maxShelves: 48, usedShelves: 19 },
  { zone: "B", maxWeightKg: 20000, usedWeightKg: 15600, maxCbm: 240, usedCbm: 182, maxShelves: 48, usedShelves: 37 },
  { zone: "C", maxWeightKg: 15000, usedWeightKg: 14550, maxCbm: 180, usedCbm: 171, maxShelves: 36, usedShelves: 35 },
  { zone: "D", maxWeightKg: 15000, usedWeightKg: 3200, maxCbm: 180, usedCbm: 40, maxShelves: 36, usedShelves: 8 },
  { zone: "E", maxWeightKg: 10000, usedWeightKg: 1100, maxCbm: 120, usedCbm: 12, maxShelves: 24, usedShelves: 3 },
];

export interface SampleShelf extends StorageLocation {
  maxLengthCm: number;
  maxWidthCm: number;
  maxHeightCm: number;
  maxCbm: number;
  usedCbm: number;
  maxWeightKg: number;
  usedWeightKg: number;
}
export const SAMPLE_SHELVES: SampleShelf[] = [
  { zone: "A", bay: "1", shelf: "01", maxLengthCm: 120, maxWidthCm: 100, maxHeightCm: 180, maxCbm: 5, usedCbm: 1.2, maxWeightKg: 400, usedWeightKg: 90 },
  { zone: "A", bay: "1", shelf: "02", maxLengthCm: 120, maxWidthCm: 100, maxHeightCm: 180, maxCbm: 5, usedCbm: 4.8, maxWeightKg: 400, usedWeightKg: 380 },
  { zone: "A", bay: "2", shelf: "01", maxLengthCm: 150, maxWidthCm: 120, maxHeightCm: 200, maxCbm: 8, usedCbm: 0, maxWeightKg: 600, usedWeightKg: 0 },
  { zone: "B", bay: "1", shelf: "01", maxLengthCm: 100, maxWidthCm: 100, maxHeightCm: 160, maxCbm: 4, usedCbm: 3.5, maxWeightKg: 350, usedWeightKg: 300 },
  { zone: "B", bay: "2", shelf: "03", maxLengthCm: 140, maxWidthCm: 110, maxHeightCm: 180, maxCbm: 6.5, usedCbm: 6.1, maxWeightKg: 500, usedWeightKg: 470 },
  { zone: "C", bay: "1", shelf: "01", maxLengthCm: 90, maxWidthCm: 90, maxHeightCm: 150, maxCbm: 3, usedCbm: 2.9, maxWeightKg: 300, usedWeightKg: 295 },
  { zone: "D", bay: "1", shelf: "01", maxLengthCm: 160, maxWidthCm: 130, maxHeightCm: 200, maxCbm: 9, usedCbm: 2, maxWeightKg: 700, usedWeightKg: 140 },
  { zone: "E", bay: "1", shelf: "01", maxLengthCm: 200, maxWidthCm: 150, maxHeightCm: 220, maxCbm: 14, usedCbm: 1, maxWeightKg: 900, usedWeightKg: 60 },
];

export interface SampleClientItem extends StorageLocation {
  refNo: string;
  clientName: string;
  description: string;
  quotationNo: string;
  lengthCm: number; widthCm: number; heightCm: number; weightKg: number;
  dateStored: string; dueDate: string;
  invoiceNo: string;
  status: ClientInventoryStatus;
  remarks: string;
}
export const SAMPLE_CLIENT_ITEMS: SampleClientItem[] = [
  { refNo: "CLI-0001", clientName: "M/Y Example One", description: "Deck chairs (4x)", quotationNo: "Q26-01001", lengthCm: 90, widthCm: 60, heightCm: 85, weightKg: 22, dateStored: "2026-06-02", dueDate: "2026-12-02", zone: "A", bay: "1", shelf: "02", invoiceNo: "INV-3301", status: "Stored", remarks: "" },
  { refNo: "CLI-0002", clientName: "M/Y Example Two", description: "Tender covers", quotationNo: "Q26-01014", lengthCm: 140, widthCm: 110, heightCm: 40, weightKg: 65, dateStored: "2026-04-18", dueDate: "2026-08-18", zone: "B", bay: "2", shelf: "03", invoiceNo: "INV-3288", status: "Due Soon", remarks: "Client to confirm pickup" },
  { refNo: "CLI-0003", clientName: "M/Y Example Three", description: "Spare parts crate", quotationNo: "Q26-00987", lengthCm: 60, widthCm: 50, heightCm: 50, weightKg: 38, dateStored: "2026-02-10", dueDate: "2026-05-10", zone: "C", bay: "1", shelf: "01", invoiceNo: "INV-3140", status: "Overdue", remarks: "Follow up on renewal" },
  { refNo: "CLI-0004", clientName: "M/Y Example Four", description: "Interior cushions", quotationNo: "Q26-01102", lengthCm: 100, widthCm: 80, heightCm: 60, weightKg: 15, dateStored: "2026-07-01", dueDate: "2026-10-01", zone: "A", bay: "1", shelf: "01", invoiceNo: "INV-3402", status: "Completed", remarks: "Collected in full" },
];

export interface SampleInternalItem extends StorageLocation {
  refNo: string;
  department: string;
  description: string;
  lengthCm: number; widthCm: number; heightCm: number; weightKg: number;
  dateStored: string;
  status: ClientInventoryStatus;
  remarks: string;
}
export const SAMPLE_INTERNAL_ITEMS: SampleInternalItem[] = [
  { refNo: "INT-0001", department: "Accounts", description: "Archived invoices 2024–2025", lengthCm: 40, widthCm: 30, heightCm: 30, weightKg: 12, dateStored: "2026-01-15", zone: "D", bay: "1", shelf: "01", status: "Stored", remarks: "" },
  { refNo: "INT-0002", department: "IT", description: "Retired network switches", lengthCm: 50, widthCm: 40, heightCm: 25, weightKg: 9, dateStored: "2026-03-22", zone: "E", bay: "1", shelf: "01", status: "Stored", remarks: "" },
];

export interface SamplePackageContent {
  refNo: string;
  itemId: string;
  clientOrDept: string;
  itemName: string;
  quantity: number;
  unit: string;
  status: PackageContentStatus;
  remarks: string;
}
export const SAMPLE_PACKAGE_CONTENTS: SamplePackageContent[] = [
  { refNo: "CLI-0001", itemId: "ITM-001", clientOrDept: "M/Y Example One", itemName: "Deck chair", quantity: 4, unit: "pcs", status: "Stored", remarks: "" },
  { refNo: "CLI-0002", itemId: "ITM-002", clientOrDept: "M/Y Example Two", itemName: "Tender cover", quantity: 2, unit: "pcs", status: "Checked Out", remarks: "Out with captain since 12 Aug" },
  { refNo: "INT-0001", itemId: "ITM-003", clientOrDept: "Accounts", itemName: "Invoice box", quantity: 6, unit: "boxes", status: "Due Soon", remarks: "" },
];
