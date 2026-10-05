/**
 * On-board (Management module) records — shared by the portal screens and the
 * /api/portal/onboard route, so a job's status and next-due date are worked out
 * the same way on both sides.
 */

/** The record kinds the portal can write, and which portal section owns each. */
export const ONBOARD_KINDS = {
  pms_task:      { table: "pms_tasks",        section: "pms" },
  pms_equipment: { table: "pms_equipment",    section: "pms" },
  charter:       { table: "charter_bookings", section: "charter" },
  ism_cert:      { table: "ism_certificates", section: "ism" },
  ism_drill:     { table: "ism_drills",       section: "ism" },
  stock_item:    { table: "onboard_stock_items", section: "stock" },
  handover:      { table: "onboard_handover_notes", section: "handover" },
  rest_hours:    { table: "onboard_rest_hours", section: "hours" },
} as const;
export type OnboardKind = keyof typeof ONBOARD_KINDS;

export type PmsTaskLike = {
  interval_kind: string | null; interval_value: number | null; interval_unit: string | null;
  next_due_date: string | null; next_due_hours: number | null;
};

/** Days until an ISO date (negative = past). */
export function daysUntil(d: string | null | undefined, now = new Date()): number | null {
  if (!d) return null;
  const today = new Date(now.toDateString()).getTime();
  return Math.round((new Date(`${d.slice(0, 10)}T00:00:00`).getTime() - today) / 86400000);
}

/** How many days ahead counts as "due soon". */
export const DUE_SOON_DAYS = 14;
/** How many running hours ahead counts as "due soon". */
export const DUE_SOON_HOURS = 50;

/**
 * A job's live status from its next due point — never trusted from the stored
 * column, which only changes when someone saves the row.
 *   hours-based: against the equipment's current running hours
 *   calendar:    against today
 */
export function pmsStatus(t: PmsTaskLike, equipmentHours: number | null | undefined, now = new Date()): "overdue" | "due" | "upcoming" {
  if (t.interval_kind === "hours" && t.next_due_hours != null && equipmentHours != null) {
    const left = t.next_due_hours - equipmentHours;
    if (left <= 0) return "overdue";
    if (left <= DUE_SOON_HOURS) return "due";
    return "upcoming";
  }
  const d = daysUntil(t.next_due_date, now);
  if (d == null) return "upcoming";
  if (d < 0) return "overdue";
  if (d <= DUE_SOON_DAYS) return "due";
  return "upcoming";
}

/** The next due date after a job is done on `doneDate` (YYYY-MM-DD), for calendar intervals. */
export function nextDueDate(t: PmsTaskLike, doneDate: string): string | null {
  if (t.interval_kind === "hours" || !t.interval_value || !t.interval_unit || t.interval_unit === "hours") return null;
  const d = new Date(`${doneDate}T00:00:00Z`);
  const n = t.interval_value;
  switch (t.interval_unit) {
    case "days": d.setUTCDate(d.getUTCDate() + n); break;
    case "weeks": d.setUTCDate(d.getUTCDate() + n * 7); break;
    case "months": d.setUTCMonth(d.getUTCMonth() + n); break;
    case "years": d.setUTCFullYear(d.getUTCFullYear() + n); break;
    default: return null;
  }
  return d.toISOString().slice(0, 10);
}

/** The next due running hours after a job is done at `doneHours`, for hour intervals. */
export function nextDueHours(t: PmsTaskLike, doneHours: number | null): number | null {
  if (t.interval_kind !== "hours" || !t.interval_value || doneHours == null) return null;
  return doneHours + t.interval_value;
}

/** An ISM certificate's live status from its expiry ("pending" is kept as entered). */
export function certStatus(stored: string | null, expiry: string | null, now = new Date()): "valid" | "expiring" | "expired" | "pending" {
  if (stored === "pending") return "pending";
  const d = daysUntil(expiry, now);
  if (d != null && d < 0) return "expired";
  if (d != null && d <= 60) return "expiring";
  return "valid";
}

/** Stock departments, in the order the portal lists them. */
export const STOCK_DEPARTMENTS = [
  { value: "galley", label: "Galley" },
  { value: "interior", label: "Interior" },
  { value: "bar", label: "Bar" },
  { value: "deck", label: "Deck" },
  { value: "engine", label: "Engine room" },
  { value: "safety", label: "Safety" },
  { value: "other", label: "Other" },
] as const;

export type StockLike = { quantity: number | null; min_quantity: number | null; par_quantity: number | null };

/** At or below its minimum level (an item with no minimum is never "low"). */
export function isLowStock(i: StockLike): boolean {
  return i.min_quantity != null && Number(i.quantity ?? 0) <= Number(i.min_quantity);
}

/**
 * How many to order to bring an item back up: to its par level when it has
 * one, else to twice its minimum — never less than one.
 */
export function suggestedOrder(i: StockLike): number {
  const have = Number(i.quantity ?? 0);
  const target = i.par_quantity != null ? Number(i.par_quantity) : i.min_quantity != null ? Number(i.min_quantity) * 2 : have + 1;
  return Math.max(1, Math.ceil(target - have));
}

/** Requisition statuses, as the crew read them. */
export const REQUISITION_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Awaiting approval",
  approved: "Approved",
  sent: "With JLS",
  received: "Received",
  cancelled: "Cancelled",
};

/** Which JLS request category a requisition goes to, by department. */
export function requestCategoryFor(department: string): "provisioning" | "general" {
  return ["galley", "interior", "bar"].includes(department) ? "provisioning" : "general";
}

/** MLC 2006 / STCW minimum hours of rest. */
export const REST_MIN_24H = 10;
export const REST_MIN_7D = 77;

/**
 * Rest over the 7 days ending on `day` (YYYY-MM-DD), from a crew member's
 * recorded days. Days with no record count as unknown — the total is null
 * unless all seven are recorded, so a gap is never mistaken for a breach.
 */
export function restOver7Days(byDay: Map<string, number>, day: string): number | null {
  let total = 0;
  const d = new Date(`${day}T00:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const key = new Date(d.getTime() - i * 86400000).toISOString().slice(0, 10);
    const v = byDay.get(key);
    if (v == null) return null;
    total += v;
  }
  return total;
}
