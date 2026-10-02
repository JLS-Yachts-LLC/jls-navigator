/**
 * Orbit 2 — the vocabulary the whole module shares.
 *
 * Statuses, service categories, the team roster and the colours each carries.
 * One place, so a status means the same thing and carries the same colour on the
 * dashboard, in the table and on the calendar.
 */

// ── Record type ─────────────────────────────────────────────────────────────
export type Orbit2RecordType = "project" | "bunkering";

// ── Status ──────────────────────────────────────────────────────────────────
export const ORBIT2_STATUSES = [
  "Not Yet Initiated",
  "Quote in Process/Approval",
  "Quotation Approved",
  "On Hold",
  "Cancelled",
  "Scheduled/Assigned",
  "Re-assigned",
  "Working On It",
  "Complete - Team",
  "Complete - To be Invoiced",
  "Complete - Invoiced",
] as const;

export type Orbit2Status = (typeof ORBIT2_STATUSES)[number];

/**
 * The two statuses the field crew set from the mobile app: "Working On It" when
 * they tap Attend, "Complete - Team" when they tap Done. Setting either by hand
 * in the web UI overrides what the crew reported, so it is an admin override.
 */
export const MOBILE_OWNED_STATUSES: readonly string[] = ["Working On It", "Complete - Team"];

/**
 * Admin-only steps (client request, 28 Sep 2026):
 *   Re-assigned                — send the job back to the crew for more work
 *   Complete - To be Invoiced  — done, not yet billed
 *   Complete - Invoiced        — billed; finished
 */
export const ADMIN_ONLY_STATUSES: readonly string[] = ["Re-assigned", "Complete - To be Invoiced", "Complete - Invoiced"];

/** The three completion stages. Work Completion time is kept across all of them. */
export const COMPLETE_STATUSES: readonly string[] = ["Complete - Team", "Complete - To be Invoiced", "Complete - Invoiced"];
export const isComplete = (s: string) => COMPLETE_STATUSES.includes(s);

export const STATUS_COLOR: Record<string, string> = {
  "Not Yet Initiated": "#4A7090",
  "Quote in Process/Approval": "#E8C020",
  "Quotation Approved": "#4CAF80",
  "On Hold": "#E87020",
  Cancelled: "#E87050",
  "Scheduled/Assigned": "#7C8FE8",
  "Re-assigned": "#E8A020",
  "Working On It": "#00C4CC",
  "Complete - Team": "#4C7DF0",
  "Complete - To be Invoiced": "#9A70E8",
  "Complete - Invoiced": "#3FA76A",
};

export const statusColor = (s: string) => STATUS_COLOR[s] ?? "#4A7090";

/** Statuses that mean the job is off the books — excluded from "active" counts. */
export const CLOSED_STATUSES: readonly string[] = [...COMPLETE_STATUSES, "Cancelled"];

// ── Service categories ──────────────────────────────────────────────────────
/** What the Project List tracks. Bunkering is its own tab, not an option here. */
export const ORBIT2_CATEGORIES = [
  "Vessel Services",
  "Vessel Equipment",
  "Port Compliance",
  "Technical Support",
] as const;

export type Orbit2Category = (typeof ORBIT2_CATEGORIES)[number];

export const CATEGORY_COLOR: Record<string, string> = {
  "Vessel Services": "#7C8FE8",
  "Vessel Equipment": "#9A70E8",
  "Port Compliance": "#E8C020",
  "Technical Support": "#E87050",
  Bunkering: "#E8559F",
  "EHS NOC": "#4CAF80",
};

/** Anything entered outside the known services still needs a colour. */
export const OTHER_COLOR = "#4A7090";
export const colorFor = (category: string) => CATEGORY_COLOR[category] ?? OTHER_COLOR;

// ── Team ────────────────────────────────────────────────────────────────────
/**
 * Assign Team is a closed list, per spec — these are the people who go out on
 * jobs. Free text here would put names on the calendar that no one can be
 * rostered against.
 */
export const ORBIT2_TEAM = [
  "Lovin", "Keith", "Rusty", "Alex", "Kasam", "Anish", "Gajender", "Rehman",
  // Added 28 Sep 2026 to test the field app. Matched, like everyone here, on the
  // first word of the Polaris display name — his account reads "Jonathan Lopez".
  "Jonathan",
] as const;

/** Where the field app lives — the dashboard link, the QR code and the sign-in return all use it. */
export const ORBIT_FIELD_PATH = "/orbit-app";

/**
 * What the field app lists: work the crew can actually go and do.
 *
 * Not the quote stages (Not Yet Initiated, Quote in Process/Approval, Quotation
 * Approved) — those are the office's, and an Attend tapped on one would jump a
 * job nobody has scheduled straight to "Working On It". On Hold stays visible
 * so a crew member knows the job exists and why it isn't moving.
 */
// Re-assigned is back with the crew, so it is theirs to Attend again.
export const FIELD_STATUSES: readonly string[] = ["Scheduled/Assigned", "Re-assigned", "Working On It", "On Hold"];

// Who is an Orbit 2 admin is not a list here: it is "Admin" on the Orbit module
// in the Admin panel, checked by the database function orbit2_is_admin() — see
// orbit2-identity.ts and migration 20260928110000_orbit2_admin_locks.sql.

// ── Bunkering ───────────────────────────────────────────────────────────────
export const QUANTITY_UNITS = ["LTR", "USG", "MT", "CBM"] as const;

// ── Managed Boats ───────────────────────────────────────────────────────────
export const BOAT_TASK_STATUSES = ["Pending", "Ongoing", "Complete"] as const;
/** Pending or Ongoing — what the dashboard's "Active" KPIs count. */
export const ACTIVE_BOAT_STATUSES: readonly string[] = ["Pending", "Ongoing"];

/**
 * The Jobs board's Category dropdown, per spec, is just Maintenance/Repair —
 * kept as a UI label over the existing `kind` column (maintenance/defect)
 * rather than renaming it, since the dashboard's Active Planned Maintenance /
 * Active Defects & Repairs KPIs already read `kind` directly.
 */
/**
 * Boat job categories. Inventory (client request, 29 Sep 2026) sends a crew
 * member to physically check the boat's Inventory List from their phone.
 */
/** Booked = the boat is scheduled for use (training, rental, …) rather than worked on. */
/** The three checklist categories raise a job that carries an inspection checklist to the crew's phone. */
/** "Checklist" is any other checklist from the library — the job names which one (checklist_form_id). */
export const BOAT_JOB_CATEGORIES = ["Maintenance", "Repair", "Inventory", "Booked", "RYA Checklist", "DMA Checklist", "FMA Checklist", "Checklist"] as const;
export type BoatJobCategory = (typeof BOAT_JOB_CATEGORIES)[number];
export type BoatJobKind = "maintenance" | "defect" | "inventory" | "booked" | "rya_checklist" | "dma_checklist" | "fma_checklist" | "checklist";
export const boatJobCategoryToKind = (c: BoatJobCategory): BoatJobKind =>
  c === "Repair" ? "defect" : c === "Inventory" ? "inventory" : c === "Booked" ? "booked"
  : c === "RYA Checklist" ? "rya_checklist" : c === "DMA Checklist" ? "dma_checklist" : c === "FMA Checklist" ? "fma_checklist"
  : c === "Checklist" ? "checklist" : "maintenance";
export const kindToBoatJobCategory = (k: BoatJobKind): BoatJobCategory =>
  k === "defect" ? "Repair" : k === "inventory" ? "Inventory" : k === "booked" ? "Booked"
  : k === "rya_checklist" ? "RYA Checklist" : k === "dma_checklist" ? "DMA Checklist" : k === "fma_checklist" ? "FMA Checklist"
  : k === "checklist" ? "Checklist" : "Maintenance";
/** Which inspection a checklist job is for — null for every other kind of job. */
export const checklistRegimeOf = (k: BoatJobKind): "rya" | "dma" | "fma" | null =>
  k === "rya_checklist" ? "rya" : k === "dma_checklist" ? "dma" : k === "fma_checklist" ? "fma" : null;
/** The job category that carries a given inspection's checklist. */
export const checklistCategoryFor = (regime: "rya" | "dma" | "fma"): BoatJobCategory =>
  regime === "rya" ? "RYA Checklist" : regime === "dma" ? "DMA Checklist" : "FMA Checklist";

/** Inventory List condition — the three values the client's own sheet uses. */
export const BOAT_INVENTORY_CONDITIONS = ["Good / Serviceable", "Damaged / Defective", "Missing / Lost"] as const;
export const boatInventoryConditionColor = (c: string | null) =>
  c === "Damaged / Defective" ? "#E87050" : c === "Missing / Lost" ? "#E24B4A" : "#4CAF80";

// ── Complete / Pending, as drawn on the dashboard ───────────────────────────
export const COMPLETE_COLOR = "#4C7DF0";
export const PENDING_COLOR = "#B07CF0";
