/**
 * JLS Yachts header + footer rows for client-facing HTML emails, matching the
 * corporate documents (logo on white, blue rule; company block in the footer).
 * Each returns a <tr> for a 600px-wide table card. Browser-safe.
 */
import { JLS_COMPANY, JLS_CONTACT_LINE, JLS_EMAIL_LOGO_URL, JLS_COLORS } from "@/lib/brand/jls-company";

export function jlsEmailHeaderRow(): string {
  return `<tr><td style="background:#ffffff;padding:22px 32px 18px;border-bottom:3px solid ${JLS_COLORS.blue};">`
    + `<img src="${JLS_EMAIL_LOGO_URL}" width="170" height="45" alt="jlsyachts — A Family of Excellence" `
    + `style="display:block;border:0;outline:none;text-decoration:none;width:170px;height:auto;font-family:Arial,sans-serif;font-size:20px;font-weight:700;color:${JLS_COLORS.navy};">`
    + `</td></tr>`;
}

export function jlsEmailFooterRow(): string {
  return `<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;font-family:Arial,sans-serif;font-size:11px;line-height:1.6;color:#64748b;">`
    + `<strong style="color:#334155;">${JLS_COMPANY.legalName}</strong><br>${JLS_COMPANY.address}<br>${JLS_CONTACT_LINE}`
    + `</td></tr>`;
}
