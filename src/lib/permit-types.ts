export type PermitType =
  | "exit_entry"
  | "sanitation"
  | "cruising_mothership"
  | "cruising_tenders"
  | "gate_pass"
  | "tdra"
  | "navigation_license"
  | "dma"
  | "abu_dhabi";

export type PermitStatus = "pending" | "active" | "expired" | "cancelled";

export const PERMIT_META: Record<
  PermitType,
  { label: string; route: string; breadcrumb: string; showDmaPhase?: boolean }
> = {
  exit_entry: { label: "Exit & Entry Permits", route: "/permits/exit-entry", breadcrumb: "Port & Operations / Permits" },
  sanitation: { label: "Sanitation", route: "/permits/sanitation", breadcrumb: "Port & Operations / Permits" },
  cruising_mothership: { label: "Cruising Permit — Mothership", route: "/permits/cruising-mothership", breadcrumb: "Port & Operations / Permits" },
  cruising_tenders: { label: "Cruising Permit — Tenders & Appurtenances", route: "/permits/cruising-tenders", breadcrumb: "Port & Operations / Permits" },
  gate_pass: { label: "Gate Pass", route: "/permits/gate-pass", breadcrumb: "Port & Operations / Permits" },
  tdra: { label: "TDRA", route: "/permits/tdra", breadcrumb: "Port & Operations / Permits" },
  navigation_license: { label: "Navigation License", route: "/permits/navigation-license", breadcrumb: "Port & Operations / Permits" },
  dma: { label: "DMA Permits", route: "/permits/dma", breadcrumb: "Port & Operations / Permits", showDmaPhase: true },
  abu_dhabi: { label: "Abu Dhabi Permits", route: "/permits/abu-dhabi", breadcrumb: "Port & Operations / Permits", showDmaPhase: true },
};

export const PERMIT_STATUSES: { value: PermitStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

export const DMA_PHASES = ["Phase 1", "Phase 2", "Phase 3", "Phase 4"];

export const ABU_DHABI_PERMIT_TYPES = [
  "Anchorage",
  "Bunkering",
  "Mooring",
  "Permits To Work",
  "Skips",
  "Other",
] as const;
export type AbuDhabiPermitType = typeof ABU_DHABI_PERMIT_TYPES[number];

export type Permit = {
  id: string;
  yacht_id: string | null;
  permit_type: PermitType;
  /** The authority's permit reference. Also the SharePoint permits sync match key —
   *  never store anything else here (see migration 20260814090000). */
  permit_number: string | null;
  /** Who applied for the permit. Previously overloaded onto permit_number. */
  applied_by?: string | null;
  status: PermitStatus;
  issue_date: string | null;
  expiry_date: string | null;
  issuing_authority: string | null;
  holder_name: string | null;
  dma_phase: string | null;
  document_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Extended fields (added via migration 20260515000002)
  contact_email?: string | null;
  preferred_inspection_date?: string | null;
  jls_quotation_number?: string | null;
  // Navigation License fields (added via migration 20260516000001)
  license_no?: string | null;
  requested_by?: string | null;
  // Email tracking fields
  email_sent_at?: string | null;
  email_sent_by?: string | null;
};

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00").getTime();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d - today.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Gate passes are issued daily, weekly or monthly. The length is not stored on
// its own: it is the gap between the entry date and the expiry date, so the
// dialog sets the expiry from the pass type and the list reads the type back.
export type GatePassValidity = "daily" | "weekly" | "monthly";
export const GATE_PASS_VALIDITY: { value: GatePassValidity; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

/** Last valid day of a gate pass of this length that starts on `issue`. */
export function gatePassExpiry(issue: string, validity: GatePassValidity): string {
  if (validity === "daily") return issue;
  if (validity === "weekly") return addDays(issue, 6);
  // Day before the same date next month (30 May → 29 Jun); a start date the
  // next month doesn't have ends on that month's last day (31 Jan → 28 Feb).
  const [y, m, d] = issue.split("-").map(Number);
  const lastNext = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  if (d > lastNext) return new Date(Date.UTC(y, m, lastNext)).toISOString().slice(0, 10);
  return addDays(new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10), -1);
}

/** The pass type implied by its dates, or null when they don't fit one. */
export function gatePassValidityOf(issue: string | null, expiry: string | null): GatePassValidity | null {
  if (!issue || !expiry) return null;
  const span = Math.round((new Date(expiry + "T00:00:00Z").getTime() - new Date(issue + "T00:00:00Z").getTime()) / 86_400_000);
  if (span === 0) return "daily";
  if (span >= 1 && span <= 7) return "weekly";
  if (span >= 27 && span <= 31) return "monthly";
  return null;
}

/** True when the expiry date falls before the issue date, so one of them is wrong. */
export function datesConflict(p: Pick<Permit, "issue_date" | "expiry_date">): boolean {
  return !!(p.issue_date && p.expiry_date && p.expiry_date < p.issue_date);
}

/**
 * The date a permit stops being valid, for working out whether it has expired.
 * Most gate passes came over from SharePoint with an entry date but no expiry;
 * none lasts longer than a month, so one with no usable expiry is treated as
 * ending a month after its entry date.
 */
export function effectiveExpiry(p: Pick<Permit, "permit_type" | "issue_date" | "expiry_date">): string | null {
  if (p.expiry_date && !datesConflict(p)) return p.expiry_date;
  if (p.permit_type === "gate_pass" && p.issue_date) return gatePassExpiry(p.issue_date, "monthly");
  return p.expiry_date;
}

/**
 * The status to show: a permit whose expiry has passed reads "expired" even if
 * nobody changed it from active or pending. Cancelled stays cancelled.
 */
export function displayStatus(p: Pick<Permit, "permit_type" | "status" | "issue_date" | "expiry_date">): PermitStatus {
  if (p.status === "cancelled" || p.status === "expired") return p.status;
  const days = daysUntil(effectiveExpiry(p));
  return days !== null && days < 0 ? "expired" : p.status;
}

export function expiryVariant(days: number | null): "pill-success" | "pill-warning" | "pill-danger" | "pill-muted" {
  if (days === null) return "pill-muted";
  if (days < 0) return "pill-danger";
  if (days <= 30) return "pill-warning";
  return "pill-success";
}
