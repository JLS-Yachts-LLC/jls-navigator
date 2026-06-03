/**
 * Server-side permit email sending.
 * Runs on the Cloudflare Worker — has access to env secrets.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function buildHtml(permit: any, yachtName: string): string {
  const typeName = PERMIT_TYPE_LABEL[permit.permit_type] ?? permit.permit_type;
  const subType = permit.dma_phase ? ` (${permit.dma_phase})` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${typeName} — JLS Yachts</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Inter',Arial,sans-serif;color:#0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#0f172a;padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">JLS Yachts</div>
                  <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-top:2px;">A Family of Excellence</div>
                </td>
                <td align="right">
                  <div style="background:#1e40af;color:#bfdbfe;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;display:inline-block;text-transform:uppercase;letter-spacing:0.05em;">${typeName}${subType}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:15px;color:#64748b;">Dear ${permit.holder_name ?? "Sir / Madam"},</p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
              Please find below the details for your <strong>${typeName}</strong>${subType ? ` — <strong>${permit.dma_phase}</strong>` : ""}.
            </p>

            <!-- Permit Details -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
              <tr style="background:#f1f5f9;">
                <td colspan="2" style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#64748b;">Permit Details</td>
              </tr>
              ${yachtName ? `
              <tr style="border-top:1px solid #e2e8f0;">
                <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#374151;width:40%;">Vessel</td>
                <td style="padding:10px 16px;font-size:13px;color:#0f172a;">${yachtName}</td>
              </tr>` : ""}
              ${permit.permit_number ? `
              <tr style="border-top:1px solid #e2e8f0;background:#fafafa;">
                <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#374151;">Permit Number</td>
                <td style="padding:10px 16px;font-size:13px;font-family:monospace;color:#0f172a;">${permit.permit_number}</td>
              </tr>` : ""}
              ${permit.issuing_authority ? `
              <tr style="border-top:1px solid #e2e8f0;">
                <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#374151;">Authority</td>
                <td style="padding:10px 16px;font-size:13px;color:#0f172a;">${permit.issuing_authority}</td>
              </tr>` : ""}
              <tr style="border-top:1px solid #e2e8f0;background:#fafafa;">
                <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#374151;">Issue Date</td>
                <td style="padding:10px 16px;font-size:13px;color:#0f172a;">${fmtDate(permit.issue_date)}</td>
              </tr>
              <tr style="border-top:1px solid #e2e8f0;">
                <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#374151;">Expiry Date</td>
                <td style="padding:10px 16px;font-size:13px;color:${permit.expiry_date ? "#0f172a" : "#94a3b8"};">${fmtDate(permit.expiry_date)}</td>
              </tr>
              ${permit.jls_quotation_number ? `
              <tr style="border-top:1px solid #e2e8f0;background:#fafafa;">
                <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#374151;">JLS Reference</td>
                <td style="padding:10px 16px;font-size:13px;font-family:monospace;color:#0f172a;">${permit.jls_quotation_number}</td>
              </tr>` : ""}
              ${permit.notes ? `
              <tr style="border-top:1px solid #e2e8f0;">
                <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#374151;">Notes</td>
                <td style="padding:10px 16px;font-size:13px;color:#374151;line-height:1.5;">${permit.notes}</td>
              </tr>` : ""}
            </table>

            <p style="margin:24px 0 0;font-size:13px;color:#64748b;line-height:1.6;">
              If you have any questions regarding this permit, please don't hesitate to contact us.
            </p>
            <p style="margin:8px 0 0;font-size:13px;color:#64748b;">
              Kind regards,<br>
              <strong style="color:#0f172a;">JLS Yachts — Port Operations Team</strong>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">JLS Yachts LLC · info.auh@jlsyachts.com · lighthouse.nh-servicedesk.workers.dev</p>
            <p style="margin:4px 0 0;font-size:10px;color:#cbd5e1;">This email was sent via the JLS Navigator platform.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildText(permit: any, yachtName: string): string {
  const typeName = PERMIT_TYPE_LABEL[permit.permit_type] ?? permit.permit_type;
  return [
    `JLS Yachts — ${typeName}`,
    "─".repeat(40),
    `Dear ${permit.holder_name ?? "Sir / Madam"},`,
    "",
    `Please find below your ${typeName} details:`,
    "",
    yachtName && `Vessel:          ${yachtName}`,
    permit.permit_number && `Permit Number:   ${permit.permit_number}`,
    permit.issuing_authority && `Authority:       ${permit.issuing_authority}`,
    `Issue Date:      ${fmtDate(permit.issue_date)}`,
    `Expiry Date:     ${fmtDate(permit.expiry_date)}`,
    permit.jls_quotation_number && `JLS Reference:   ${permit.jls_quotation_number}`,
    permit.notes && `Notes:           ${permit.notes}`,
    "",
    "If you have any questions, please contact us.",
    "",
    "Kind regards,",
    "JLS Yachts — Port Operations Team",
  ].filter(Boolean).join("\n");
}

// ── Server function ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _z = z; // ensure import kept; validator() not available in this TanStack Start version

export const doSendPermitEmail = createServerFn({ method: "POST" })
  // @ts-expect-error — TanStack Start v1 serverFn type requires explicit ctx typing
  .handler(async (ctx: { data: { permitId: string; senderEmail: string } }) => {
    const { permitId, senderEmail } = ctx.data;

    // Fetch permit + yacht from DB using service role
    // Cast to any because Supabase generated types may not include new columns
    const { data: raw, error } = await supabaseAdmin
      .from("permits")
      .select("*, yacht:yachts(vessel_name)")
      .eq("id", permitId)
      .single();

    if (error || !raw) throw new Error("Permit not found");
    const permit = raw as any;

    if (!permit.contact_email) throw new Error("This permit has no contact email address.");

    const yachtName = permit.yacht?.vessel_name ?? "";
    const typeName  = PERMIT_TYPE_LABEL[permit.permit_type] ?? permit.permit_type;
    const subject   = `JLS Yachts | ${typeName}${permit.permit_number ? ` — ${permit.permit_number}` : ""}${yachtName ? ` · ${yachtName}` : ""}`;

    await sendEmail({
      to:      [permit.contact_email as string],
      cc:      senderEmail ? [senderEmail] : [],
      subject,
      html:    buildHtml(permit, yachtName),
      text:    buildText(permit, yachtName),
    });

    // Mark email as sent — cast update payload to any since generated types don't include new columns yet
    await (supabaseAdmin as any)
      .from("permits")
      .update({ email_sent_at: new Date().toISOString(), email_sent_by: senderEmail })
      .eq("id", permitId);
  });
