/**
 * Permit expiry alert cron job.
 * Called from worker-entry.ts scheduled handler once per day (checked by hour).
 *
 * Emails the permit contact when expiry is within 30 days, re-sending every 7
 * days while it stays inside the window.
 *
 * ⚠️ CURRENTLY DISABLED (2026-08-03). The permit contact is usually the CLIENT
 * (captain / vessel), so this cron was mailing clients unprompted — Exit & Entry
 * notices were going out automatically. It now returns without sending anything.
 * The recipient guard in mail-guard.server.ts would also stop the mail, but this
 * is the outer stop: nothing is composed, no permit rows get stamped
 * expiry_alert_sent_at, so no reminder is silently marked as "already sent" and
 * skipped once this is switched back on.
 *
 * To re-enable, set BOTH:
 *   PERMIT_EXPIRY_ALERTS_ENABLED = "true"   (this cron)
 *   CLIENT_EMAIL_ENABLED         = "true"   (delivery to non-staff addresses)
 */
import { sendEmail } from "@/lib/ses.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function expiryAlertsEnabled(): boolean {
  const v = (process.env.PERMIT_EXPIRY_ALERTS_ENABLED ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

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

export async function runExpiryAlerts(): Promise<{ sent: number; skipped: number }> {
  if (!expiryAlertsEnabled()) {
    console.warn("[expiry-cron] disabled — permit expiry alerts go to client contacts; no email sent.");
    return { sent: 0, skipped: 0 };
  }
  const today     = new Date();
  const in30Days  = new Date(today.getTime() + 30 * 86_400_000);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86_400_000).toISOString();

  // Fetch permits expiring within 30 days that have a contact email
  const { data: permits, error } = await (supabaseAdmin as any)
    .from("permits")
    .select("id, permit_type, permit_number, holder_name, contact_email, expiry_date, issuing_authority, dma_phase, jls_quotation_number, expiry_alert_sent_at, yacht:yachts(vessel_name)")
    .gt("expiry_date", today.toISOString().slice(0, 10))   // not already expired
    .lte("expiry_date", in30Days.toISOString().slice(0, 10)) // within 30 days
    .not("contact_email", "is", null)
    .not("contact_email", "eq", "");

  if (error) {
    console.error("[expiry-cron] query error:", error.message);
    return { sent: 0, skipped: 0 };
  }

  let sent = 0;
  let skipped = 0;

  for (const permit of (permits ?? [])) {
    // Skip if an alert was sent less than 7 days ago
    if (permit.expiry_alert_sent_at && permit.expiry_alert_sent_at > sevenDaysAgo) {
      skipped++;
      continue;
    }

    const days       = daysUntil(permit.expiry_date);
    const typeName   = PERMIT_TYPE_LABEL[permit.permit_type] ?? permit.permit_type;
    const yachtName  = permit.yacht?.vessel_name ?? "";
    const subType    = permit.dma_phase ? ` (${permit.dma_phase})` : "";
    const urgency    = days <= 7 ? "⚠️ Urgent — " : days <= 14 ? "Action Required — " : "";

    const subject = `${urgency}${typeName}${subType} expiring in ${days} day${days === 1 ? "" : "s"}${yachtName ? ` · ${yachtName}` : ""}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Permit Expiry Notice</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Inter',Arial,sans-serif;color:#0f172a;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f172a;padding:20px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><div style="font-size:17px;font-weight:700;color:#fff;">JLS Yachts</div><div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin-top:2px;">A Family of Excellence</div></td>
      <td align="right"><div style="background:${days <= 7 ? "#7f1d1d" : days <= 14 ? "#78350f" : "#1e3a5f"};color:${days <= 7 ? "#fca5a5" : days <= 14 ? "#fcd34d" : "#bfdbfe"};font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;display:inline-block;">${days} DAYS LEFT</div></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px;">
    <p style="margin:0 0 6px;font-size:14px;color:#64748b;">Dear ${permit.holder_name ?? "Sir / Madam"},</p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">This is a reminder that the following permit is expiring soon and may need to be renewed.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr style="background:#f1f5f9;"><td colspan="2" style="padding:10px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;">Permit Details</td></tr>
      <tr style="border-top:1px solid #e2e8f0;"><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#374151;width:40%;">Permit Type</td><td style="padding:10px 16px;font-size:13px;color:#0f172a;">${typeName}${subType}</td></tr>
      ${yachtName ? `<tr style="border-top:1px solid #e2e8f0;background:#fafafa;"><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#374151;">Vessel</td><td style="padding:10px 16px;font-size:13px;color:#0f172a;">${yachtName}</td></tr>` : ""}
      ${permit.permit_number ? `<tr style="border-top:1px solid #e2e8f0;"><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#374151;">Permit Number</td><td style="padding:10px 16px;font-size:13px;font-family:monospace;color:#0f172a;">${permit.permit_number}</td></tr>` : ""}
      ${permit.issuing_authority ? `<tr style="border-top:1px solid #e2e8f0;background:#fafafa;"><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#374151;">Authority</td><td style="padding:10px 16px;font-size:13px;color:#0f172a;">${permit.issuing_authority}</td></tr>` : ""}
      <tr style="border-top:1px solid #e2e8f0;"><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#374151;">Expiry Date</td><td style="padding:10px 16px;font-size:13px;color:${days <= 7 ? "#dc2626" : days <= 14 ? "#d97706" : "#0f172a"};font-weight:600;">${fmtDate(permit.expiry_date)} (${days} day${days === 1 ? "" : "s"} remaining)</td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:13px;color:#64748b;">Please contact JLS Yachts Port Operations to arrange renewal at your earliest convenience.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#64748b;">Kind regards,<br><strong style="color:#0f172a;">JLS Yachts — Port Operations Team</strong></p>
  </td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:12px 28px;text-align:center;">
    <p style="margin:0;font-size:10px;color:#94a3b8;">JLS Yachts LLC · info.auh@jlsyachts.com</p>
    <p style="margin:3px 0 0;font-size:10px;color:#cbd5e1;">This is an automated reminder from the JLS Navigator platform.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

    const text = `Dear ${permit.holder_name ?? "Sir / Madam"},\n\nYour ${typeName}${subType}${yachtName ? ` for ${yachtName}` : ""} expires on ${fmtDate(permit.expiry_date)} (${days} days remaining).\n\nPlease contact JLS Yachts Port Operations to arrange renewal.\n\nKind regards,\nJLS Yachts — Port Operations Team`;

    try {
      await sendEmail({
        to: [permit.contact_email as string],
        subject,
        html,
        text,
      });

      // Mark alert sent
      await (supabaseAdmin as any)
        .from("permits")
        .update({ expiry_alert_sent_at: new Date().toISOString() })
        .eq("id", permit.id);

      sent++;
      console.log(`[expiry-cron] sent alert for permit ${permit.id} (${days}d, ${permit.contact_email})`);
    } catch (e) {
      console.error(`[expiry-cron] failed to send for permit ${permit.id}:`, e instanceof Error ? e.message : e);
    }
  }

  return { sent, skipped };
}
