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
  "Working On It",
  "Complete",
] as const;

export type Orbit2Status = (typeof ORBIT2_STATUSES)[number];

/**
 * The two statuses the mobile app owns.
 *
 * "Working On It" is set when the field crew taps Attend and "Complete" when
 * they tap Done. Setting either by hand in the web UI overrides what the crew
 * actually reported, so it is restricted to the admins below.
 */
export const MOBILE_OWNED_STATUSES: readonly string[] = ["Working On It", "Complete"];

export const STATUS_COLOR: Record<string, string> = {
  "Not Yet Initiated": "#4A7090",
  "Quote in Process/Approval": "#E8C020",
  "Quotation Approved": "#4CAF80",
  "On Hold": "#E87020",
  Cancelled: "#E87050",
  "Scheduled/Assigned": "#7C8FE8",
  "Working On It": "#00C4CC",
  Complete: "#4C7DF0",
};

export const statusColor = (s: string) => STATUS_COLOR[s] ?? "#4A7090";

/** Statuses that mean the job is off the books — excluded from "active" counts. */
export const CLOSED_STATUSES: readonly string[] = ["Complete", "Cancelled"];

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
] as const;

/** Who may override a status the mobile app normally sets. */
export const ORBIT2_ADMINS: readonly string[] = ["Lovin", "Rusty", "Keith"];

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
export const BOAT_JOB_CATEGORIES = ["Maintenance", "Repair"] as const;
export type BoatJobCategory = (typeof BOAT_JOB_CATEGORIES)[number];
export const boatJobCategoryToKind = (c: BoatJobCategory): "maintenance" | "defect" =>
  c === "Repair" ? "defect" : "maintenance";
export const kindToBoatJobCategory = (k: "maintenance" | "defect"): BoatJobCategory =>
  k === "defect" ? "Repair" : "Maintenance";

/** Inventory List condition — the three values the client's own sheet uses. */
export const BOAT_INVENTORY_CONDITIONS = ["Good / Serviceable", "Damaged / Defective", "Missing / Lost"] as const;
export const boatInventoryConditionColor = (c: string | null) =>
  c === "Damaged / Defective" ? "#E87050" : c === "Missing / Lost" ? "#E24B4A" : "#4CAF80";

// ── Complete / Pending, as drawn on the dashboard ───────────────────────────
export const COMPLETE_COLOR = "#4C7DF0";
export const PENDING_COLOR = "#B07CF0";
