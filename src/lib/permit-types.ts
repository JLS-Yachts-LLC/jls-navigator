export type PermitType =
  | "exit_entry"
  | "sanitation"
  | "cruising_mothership"
  | "cruising_tenders"
  | "gate_pass"
  | "tdra"
  | "navigation_license"
  | "dma";

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
};

export const PERMIT_STATUSES: { value: PermitStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

export const DMA_PHASES = ["Phase 1", "Phase 2", "Phase 3", "Phase 4"];

export type Permit = {
  id: string;
  yacht_id: string | null;
  permit_type: PermitType;
  permit_number: string | null;
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
};

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00").getTime();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function expiryVariant(days: number | null): "pill-success" | "pill-warning" | "pill-danger" | "pill-muted" {
  if (days === null) return "pill-muted";
  if (days < 0) return "pill-danger";
  if (days <= 30) return "pill-warning";
  return "pill-success";
}
