/**
 * Visa Reporting — branded vessel email builder.
 * Pure function: props -> { subject, html, text }. No provider coupling; the
 * caller dispatches via AWS SES (src/lib/ses.server.ts), matching the existing
 * permit-expiry / weekly-immigration email pattern. Inline CSS only (email-safe).
 *
 * Colour tokens and body copy are taken verbatim from the Visa Reporting spec
 * (POLARIS navy / gold brand).
 */

import { formatDateDMY } from "./statusHelpers";

export interface VisaReportEmailCrewRow {
  name: string;
  visaType: string | null;
  date: string | null; // expiry (expiring) or expired date
  days: number; // days remaining (expiring) or days overdue (expired)
}

export interface VisaReportEmailProps {
  vesselName: string;
  reportDate: string; // ISO date — formatted inside
  totalCrew: number;
  activeVisas: number;
  expiringVisas: number;
  expiredVisas: number;
  signOns: number | null; // null => SOSO not live => footnote
  signOffs: number | null;
  expiringSoonCrew: VisaReportEmailCrewRow[];
  expiredCrew: VisaReportEmailCrewRow[];
  preferencesUrl: string;
}

// ── Brand tokens (spec) ─────────────────────────────────────────────────────
const C = {
  navy: "#0D1F3C",
  gold: "#C9A84C",
  goldLight: "#F0D98A",
  mutedBlue: "#A8B8D0",
  body: "#374151",
  muted: "#6B7280",
  green: "#1D9E75",
  amber: "#BA7517",
  red: "#E24B4A",
  attnBg: "#FEF3C7",
  attnText: "#78350F",
  tblAmber: "#FEF3C7",
  tblRed: "#FEE2E2",
};

const esc = (s: unknown): string =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );

function longDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
function subjectDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statBox(label: string, value: number, colour: string): string {
  return `<td align="center" style="padding:14px 8px;border:1px solid #E5E7EB;border-radius:8px;">
    <div style="font-size:30px;font-weight:700;color:${colour};line-height:1;">${value}</div>
    <div style="font-size:14px;color:${C.muted};margin-top:6px;text-transform:uppercase;letter-spacing:0.06em;">${esc(label)}</div>
  </td>`;
}

function crewTable(
  title: string,
  headerBg: string,
  cols: string[],
  rows: VisaReportEmailCrewRow[],
  lastColLabel: string,
): string {
  if (rows.length === 0) return "";
  const shown = rows.slice(0, 10);
  const extra = rows.length - shown.length;
  const body = shown
    .map(
      (r) => `<tr>
      <td style="padding:9px 12px;font-size:14px;color:${C.body};border-top:1px solid #E5E7EB;">${esc(r.name)}</td>
      <td style="padding:9px 12px;font-size:14px;color:${C.body};border-top:1px solid #E5E7EB;">${esc(r.visaType ?? "—")}</td>
      <td style="padding:9px 12px;font-size:14px;color:${C.body};border-top:1px solid #E5E7EB;">${formatDateDMY(r.date)}</td>
      <td style="padding:9px 12px;font-size:14px;color:${C.body};border-top:1px solid #E5E7EB;text-align:right;">${r.days}</td>
    </tr>`,
    )
    .join("");
  const more =
    extra > 0
      ? `<tr><td colspan="4" style="padding:9px 12px;font-size:14px;color:${C.muted};border-top:1px solid #E5E7EB;font-style:italic;">+${extra} additional crew — see the full report in Polaris.</td></tr>`
      : "";
  return `<h3 style="font-size:16px;font-weight:600;color:${C.navy};margin:26px 0 8px;">${esc(title)}</h3>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;border-collapse:separate;border-spacing:0;overflow:hidden;">
    <tr style="background:${headerBg};">
      ${cols
        .slice(0, 3)
        .map(
          (c) =>
            `<th align="left" style="padding:9px 12px;font-size:13px;font-weight:700;color:${C.attnText};text-transform:uppercase;letter-spacing:0.05em;">${esc(c)}</th>`,
        )
        .join("")}
      <th align="right" style="padding:9px 12px;font-size:13px;font-weight:700;color:${C.attnText};text-transform:uppercase;letter-spacing:0.05em;">${esc(lastColLabel)}</th>
    </tr>
    ${body}${more}
  </table>`;
}

export function buildVisaReportEmail(props: VisaReportEmailProps): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Polaris Visa Status Report — ${props.vesselName} — ${subjectDate(props.reportDate)}`;
  const sosoLive = props.signOns !== null && props.signOffs !== null;

  const movementBoxes = `
    <table width="100%" cellpadding="0" cellspacing="6" style="margin-top:6px;">
      <tr>
        ${statBox("Sign Ons", props.signOns ?? 0, C.navy)}
        ${statBox("Sign Offs", props.signOffs ?? 0, C.navy)}
      </tr>
    </table>
    ${sosoLive ? "" : `<p style="font-size:14px;color:${C.muted};margin:8px 0 0;">&#9432; Crew movement data will be populated automatically when the Polaris Sign On / Sign Off module goes live.</p>`}`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Visa Status Report</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif;color:${C.body};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:28px 12px;"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

  <!-- Header -->
  <tr><td style="background:${C.navy};padding:22px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <div style="font-size:24px;font-weight:700;color:#FFFFFF;letter-spacing:2px;">POLARIS</div>
        <div style="font-size:13px;color:${C.goldLight};letter-spacing:1px;margin-top:2px;">Navigate &middot; Manage &middot; Excel</div>
      </td>
      <td align="right" style="vertical-align:top;">
        <div style="font-size:14px;color:${C.mutedBlue};">${esc(longDate(props.reportDate))}</div>
        <div style="font-size:16px;color:#FFFFFF;font-weight:600;margin-top:2px;">${esc(props.vesselName)}</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="height:3px;background:${C.gold};line-height:3px;font-size:3px;">&nbsp;</td></tr>

  <!-- Body -->
  <tr><td style="padding:28px 32px;">
    <p style="font-size:16px;margin:0 0 14px;">Dear ${esc(props.vesselName)},</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 14px;">Please find attached your weekly Visa Status and Crew Movement Report, generated through the JLS Polaris Operations Platform.</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 20px;">As part of our continued investment in improving yacht operations, compliance monitoring, and reporting, Polaris is now being used to consolidate visa administration, crew movements, and operational records into a single platform. During the initial rollout phase, we will provide these reports on a regular basis to ensure complete visibility of crew immigration status and onboard personnel movements.</p>

    <h3 style="font-size:16px;font-weight:600;color:${C.navy};margin:0 0 8px;">Visa Status</h3>
    <table width="100%" cellpadding="0" cellspacing="6">
      <tr>
        ${statBox("Total", props.totalCrew, C.navy)}
        ${statBox("Active", props.activeVisas, C.green)}
        ${statBox("Expiring", props.expiringVisas, C.amber)}
        ${statBox("Expired", props.expiredVisas, C.red)}
      </tr>
    </table>

    <h3 style="font-size:16px;font-weight:600;color:${C.navy};margin:26px 0 8px;">Crew Movements</h3>
    ${movementBoxes}

    ${crewTable("Visas expiring within 30 days", C.tblAmber, ["Name", "Visa type", "Expiry date"], props.expiringSoonCrew, "Days left")}
    ${crewTable("Expired visas — immediate attention", C.tblRed, ["Name", "Visa type", "Expired"], props.expiredCrew, "Days overdue")}

    <!-- Items requiring attention -->
    <div style="margin:26px 0 0;background:${C.attnBg};border-left:4px solid ${C.gold};border-radius:6px;padding:16px 18px;">
      <div style="font-size:16px;font-weight:600;color:${C.attnText};margin-bottom:8px;">Items requiring attention</div>
      <ul style="margin:0;padding-left:18px;color:${C.attnText};font-size:15px;line-height:1.6;">
        <li>Crew members with visas expiring within 30 days are highlighted within the attached report.</li>
        <li>Any expired visas or outstanding immigration requirements require immediate attention to avoid potential compliance issues.</li>
        <li>Sign On/Off records have been included for verification and vessel records.</li>
      </ul>
    </div>

    <p style="font-size:16px;line-height:1.6;margin:20px 0 0;">The attached report provides a detailed breakdown of all crew visa statuses, expiry dates, and recent crew movements recorded during the reporting period.</p>
    <p style="font-size:16px;line-height:1.6;margin:14px 0 0;">Should you have any questions regarding any crew member, visa renewal requirements, sign-on/sign-off activity, or immigration compliance matters, please do not hesitate to contact the JLS team.</p>
    <p style="font-size:16px;line-height:1.6;margin:20px 0 0;">Kind regards,<br><strong>JLS Operations Team</strong></p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:${C.navy};padding:22px 28px;text-align:center;">
    <div style="font-size:14px;color:${C.mutedBlue};">JLS Operations Team</div>
    <div style="font-size:18px;font-weight:700;color:${C.gold};margin-top:4px;">Polaris</div>
    <div style="font-size:13px;color:${C.goldLight};letter-spacing:1px;margin-top:2px;">Navigate. Manage. Excel.</div>
    <div style="height:1px;background:${C.gold};opacity:0.4;margin:14px auto;width:80%;"></div>
    <div style="font-size:13px;color:${C.mutedBlue};">JLS Yachts LLC &middot; Superyacht Middle East</div>
    <div style="font-size:13px;margin-top:6px;"><a href="${esc(props.preferencesUrl)}" style="color:${C.goldLight};">Manage report preferences</a></div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  const line = (r: VisaReportEmailCrewRow, overdue: boolean) =>
    `- ${r.name} (${r.visaType ?? "—"}, ${formatDateDMY(r.date)}, ${r.days} day${r.days === 1 ? "" : "s"} ${overdue ? "overdue" : "left"})`;
  const text =
    `Polaris Visa Status Report — ${props.vesselName} — ${subjectDate(props.reportDate)}\n\n` +
    `Dear ${props.vesselName},\n\nPlease find your weekly Visa Status and Crew Movement Report from the JLS Polaris Operations Platform.\n\n` +
    `VISA STATUS\nTotal: ${props.totalCrew}  Active: ${props.activeVisas}  Expiring: ${props.expiringVisas}  Expired: ${props.expiredVisas}\n\n` +
    `CREW MOVEMENTS\nSign-ons: ${props.signOns ?? "—"}  Sign-offs: ${props.signOffs ?? "—"}` +
    (sosoLive
      ? ""
      : "\n(Crew movement data will populate when the Polaris Sign On / Sign Off module goes live.)") +
    `\n\n` +
    (props.expiringSoonCrew.length
      ? `EXPIRING WITHIN 30 DAYS\n${props.expiringSoonCrew
          .slice(0, 10)
          .map((r) => line(r, false))
          .join("\n")}\n\n`
      : "") +
    (props.expiredCrew.length
      ? `EXPIRED — IMMEDIATE ATTENTION\n${props.expiredCrew
          .slice(0, 10)
          .map((r) => line(r, true))
          .join("\n")}\n\n`
      : "") +
    `Should you have any questions, please contact the JLS team.\n\nKind regards,\nJLS Operations Team\nJLS Yachts LLC · Superyacht Middle East`;

  return { subject, html, text };
}
