/**
 * Visa Reporting — status logic & display tokens.
 * SINGLE SOURCE OF TRUTH for Active / Expiring / Expired / No-visa classification.
 * Framework-agnostic (no server or React imports) so the screen, the email builder
 * and the server routes all share one implementation. Mirrors the SQL in
 * generate_vessel_visa_report() (migration 20260624000050).
 */

export type VisaStatus = "active" | "expiring_soon" | "expired" | "no_visa";

export interface VisaStatusResult {
  status: VisaStatus;
  daysRemaining: number | null;
  daysOverdue: number | null;
}

/**
 * Expiry warning window, in days. Mirrors v_warn_days in
 * generate_vessel_visa_report(). Kept as a single named constant rather than a
 * scattered literal (spec rule #1 — no hardcoded thresholds in business logic).
 */
export const EXPIRY_WARNING_DAYS = 30;

export function getVisaStatus(expiryDate: string | null): VisaStatusResult {
  if (!expiryDate)
    return { status: "no_visa", daysRemaining: null, daysOverdue: null };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0)
    return {
      status: "expired",
      daysRemaining: null,
      daysOverdue: Math.abs(diffDays),
    };
  if (diffDays <= EXPIRY_WARNING_DAYS)
    return {
      status: "expiring_soon",
      daysRemaining: diffDays,
      daysOverdue: null,
    };
  return { status: "active", daysRemaining: diffDays, daysOverdue: null };
}

/** In-app (screen) status pill colours. */
export const STATUS_COLOURS: Record<
  VisaStatus,
  { bg: string; text: string; dot: string }
> = {
  active: { bg: "#D1FAE5", text: "#065F46", dot: "#1D9E75" },
  expiring_soon: { bg: "#FEF3C7", text: "#92400E", dot: "#EF9F27" },
  expired: { bg: "#FEE2E2", text: "#991B1B", dot: "#E24B4A" },
  no_visa: { bg: "#F1EFE8", text: "#5F5E5A", dot: "#888780" },
};

export const STATUS_LABEL: Record<VisaStatus, string> = {
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  no_visa: "No visa",
};

/** A single crew row inside visa_report_log.snapshot_data. */
export interface SnapshotRow {
  crew_member_id: string;
  name: string | null;
  nationality: string | null;
  visa_type: string | null;
  expiry_date: string | null;
  status: VisaStatus;
  days_remaining: number | null;
  days_overdue: number | null;
}

/** dd/mm/yyyy — the immigration display format used across the platform. */
export function formatDateDMY(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d.length <= 10 ? d + "T00:00:00" : d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
