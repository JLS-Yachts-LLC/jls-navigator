/**
 * Permit expiry digest — ONE internal email listing every permit due to expire.
 * Called from worker-entry.ts scheduled handler once per day (checked by hour).
 *
 * History: this used to email each permit's `contact_email` individually, which
 * is usually the CLIENT (captain / vessel). On 2026-08-03 that was found to be
 * mailing clients unprompted — Exit & Entry notices going out with no staff
 * involvement — so the client-facing send was removed entirely. What remains is
 * an internal digest to Port Operations: the same early warning, no client
 * exposure, and one email a day instead of dozens.
 *
 * Still gated by PERMIT_EXPIRY_ALERTS_ENABLED (default off) pending sign-off.
 * Use previewExpiryDigest() to see exactly what would be sent without sending.
 * Recipients: PERMIT_ALERT_TO (comma-separated), default the Port Ops mailbox.
 */
import { sendEmail } from "@/lib/ses.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PERMIT_TYPE_LABEL: Record<string, string> = {
  exit_entry: "Exit & Entry Permit",
  sanitation: "Sanitation Certificate",
  cruising_mothership: "Cruising Permit — Mothership",
  cruising_tenders: "Cruising Permit — Tenders",
  gate_pass: "Gate Pass",
  tdra: "TDRA Certificate",
  navigation_license: "Navigation License",
  dma: "DMA Permit",
  abu_dhabi: "Abu Dhabi Permit",
};

/** Internal recipients. Never a client address — the mail guard blocks those. */
const DEFAULT_ALERT_TO = "portops@jlsyachts.com";
function alertRecipients(): string[] {
  const raw = (process.env.PERMIT_ALERT_TO ?? DEFAULT_ALERT_TO).trim();
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function expiryAlertsEnabled(): boolean {
  const v = (process.env.PERMIT_EXPIRY_ALERTS_ENABLED ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function daysUntil(d: string): number {
  const expiry = new Date(d + "T00:00:00").getTime();
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((expiry - today.getTime()) / 86_400_000);
}

type ExpiringPermit = {
  id: string;
  permit_type: string;
  permit_number: string | null;
  holder_name: string | null;
  expiry_date: string;
  issuing_authority: string | null;
  dma_phase: string | null;
  yacht?: { vessel_name: string } | null;
  days: number;
};

/** Permits expiring inside the next 30 days, soonest first. */
async function fetchExpiring(): Promise<ExpiringPermit[]> {
  const today    = new Date();
  const in30Days = new Date(today.getTime() + 30 * 86_400_000);

  const { data, error } = await (supabaseAdmin as any)
    .from("permits")
    .select("id, permit_type, permit_number, holder_name, expiry_date, issuing_authority, dma_phase, jls_quotation_number, yacht:yachts(vessel_name)")
    .gt("expiry_date", today.toISOString().slice(0, 10))      // not already expired
    .lte("expiry_date", in30Days.toISOString().slice(0, 10))  // within 30 days
    .order("expiry_date", { ascending: true });

  if (error) {
    console.error("[expiry-digest] query error:", error.message);
    return [];
  }
  // Every permit in the window counts — unlike the old per-permit emails there is
  // no contact_email requirement, so permits with no client contact (previously
  // invisible) now surface to Port Ops as well.
  return (data ?? []).map((p: any) => ({ ...p, days: daysUntil(p.expiry_date) }));
}

const URGENCY = [
  { key: "critical", label: "Next 7 days",   max: 7,  colour: "#dc2626", bg: "#fef2f2" },
  { key: "soon",     label: "8 – 14 days",   max: 14, colour: "#d97706", bg: "#fffbeb" },
  { key: "upcoming", label: "15 – 30 days",  max: 30, colour: "#1e3a5f", bg: "#f8fafc" },
] as const;

function bucketOf(days: number) {
  return URGENCY.find((u) => days <= u.max) ?? URGENCY[URGENCY.length - 1];
}

export function buildDigest(permits: ExpiringPermit[]): { subject: string; html: string; text: string } {
  const critical = permits.filter((p) => p.days <= 7).length;
  const subject = critical
    ? `⚠️ Permit renewals — ${critical} due within 7 days (${permits.length} in 30 days)`
    : `Permit renewals — ${permits.length} due within 30 days`;

  const row = (p: ExpiringPermit) => {
    const b = bucketOf(p.days);
    const typeName = PERMIT_TYPE_LABEL[p.permit_type] ?? p.permit_type;
    const subType = p.dma_phase ? ` (${p.dma_phase})` : "";
    return `<tr style="border-top:1px solid #e2e8f0;">
      <td style="padding:8px 12px;font-size:12.5px;color:#0f172a;font-weight:600;">${typeName}${subType}</td>
      <td style="padding:8px 12px;font-size:12.5px;color:#0f172a;">${p.yacht?.vessel_name ?? "—"}</td>
      <td style="padding:8px 12px;font-size:12.5px;font-family:monospace;color:#475569;">${p.permit_number ?? "—"}</td>
      <td style="padding:8px 12px;font-size:12.5px;color:#475569;">${p.holder_name ?? "—"}</td>
      <td style="padding:8px 12px;font-size:12.5px;color:#0f172a;">${fmtDate(p.expiry_date)}</td>
      <td style="padding:8px 12px;font-size:12.5px;font-weight:700;color:${b.colour};white-space:nowrap;">${p.days}d</td>
    </tr>`;
  };

  const section = (u: typeof URGENCY[number]) => {
    const inBucket = permits.filter((p) => bucketOf(p.days).key === u.key);
    if (!inBucket.length) return "";
    return `<tr><td colspan="6" style="padding:14px 12px 6px;background:${u.bg};font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${u.colour};">
      ${u.label} · ${inBucket.length}
    </td></tr>${inBucket.map(row).join("")}`;
  };

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Permit Renewals</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Inter',Arial,sans-serif;color:#0f172a;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:28px 16px;"><tr><td align="center">
<table width="760" cellpadding="0" cellspacing="0" style="max-width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f172a;padding:20px 24px;">
    <div style="font-size:17px;font-weight:700;color:#fff;">Polaris — Permit Renewals</div>
    <div style="font-size:11px;color:#94a3b8;margin-top:3px;">Internal digest for Port Operations · ${permits.length} permit${permits.length === 1 ? "" : "s"} expiring within 30 days</div>
  </td></tr>
  <tr><td style="padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr style="background:#f1f5f9;">
        <td style="padding:9px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Permit</td>
        <td style="padding:9px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Vessel</td>
        <td style="padding:9px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Number</td>
        <td style="padding:9px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Holder</td>
        <td style="padding:9px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Expires</td>
        <td style="padding:9px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">Left</td>
      </tr>
      ${URGENCY.map(section).join("")}
    </table>
  </td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 24px;">
    <p style="margin:0;font-size:11px;color:#64748b;">Renew these through Polaris → Permits. Nothing has been sent to the vessels — this digest is internal only.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    `Permit renewals — ${permits.length} expiring within 30 days`,
    "",
    ...permits.map((p) => {
      const typeName = PERMIT_TYPE_LABEL[p.permit_type] ?? p.permit_type;
      return `${String(p.days).padStart(3)}d · ${typeName}${p.dma_phase ? ` (${p.dma_phase})` : ""} · ${p.yacht?.vessel_name ?? "—"} · ${p.permit_number ?? "no number"} · expires ${fmtDate(p.expiry_date)}`;
    }),
    "",
    "Renew through Polaris → Permits. Internal digest — nothing sent to the vessels.",
  ].join("\n");

  return { subject, html, text };
}

/**
 * Dry run: what the digest would contain right now, without sending anything.
 * Exposed on GET /api/permits/expiry-digest for review before enabling.
 */
export async function previewExpiryDigest(): Promise<{
  enabled: boolean; recipients: string[]; count: number;
  permits: { type: string; vessel: string; number: string; expires: string; days: number }[];
  subject: string; html: string;
}> {
  const permits = await fetchExpiring();
  const { subject, html } = buildDigest(permits);
  return {
    enabled: expiryAlertsEnabled(),
    recipients: alertRecipients(),
    count: permits.length,
    permits: permits.map((p) => ({
      type: PERMIT_TYPE_LABEL[p.permit_type] ?? p.permit_type,
      vessel: p.yacht?.vessel_name ?? "—",
      number: p.permit_number ?? "—",
      expires: p.expiry_date,
      days: p.days,
    })),
    subject, html,
  };
}

export async function runExpiryAlerts(): Promise<{ sent: number; skipped: number }> {
  if (!expiryAlertsEnabled()) {
    console.warn("[expiry-digest] disabled (PERMIT_EXPIRY_ALERTS_ENABLED is not true) — nothing sent.");
    return { sent: 0, skipped: 0 };
  }

  const permits = await fetchExpiring();
  if (!permits.length) {
    console.log("[expiry-digest] nothing expiring within 30 days — no email sent.");
    return { sent: 0, skipped: 0 };
  }

  const { subject, html, text } = buildDigest(permits);
  const to = alertRecipients();
  try {
    await sendEmail({ to, subject, html, text });
    console.log(`[expiry-digest] sent ${permits.length} permit(s) to ${to.join(", ")}`);
    return { sent: 1, skipped: 0 };
  } catch (e) {
    console.error("[expiry-digest] send failed:", e instanceof Error ? e.message : e);
    return { sent: 0, skipped: permits.length };
  }
}
