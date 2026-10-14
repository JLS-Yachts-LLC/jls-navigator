/**
 * Signature Campaign email — one renderer shared by the editor's live preview
 * (browser) and the Worker that actually sends (api.esign-campaigns.ts), so what
 * staff preview is exactly what each recipient receives.
 *
 * The note is plain text with light formatting:
 *   blank line   → new paragraph
 *   "- " / "• "  → bullet
 *   **text**     → bold
 *   https://…    → link
 * Merge tags fill per recipient: {{first_name}} {{name}} {{vessel}} {{document}} {{sender}}.
 */
import { emailBrandLockup } from "@/lib/email/brand-mark";

export type CampaignEmailInput = {
  subject: string;
  heading?: string | null;
  note?: string | null;
  signOff?: string | null;
  docTitle: string;
  includePdf: boolean;
  allowEsign: boolean;
  expiresDays: number;
};

export type CampaignEmailRecipient = { name: string; vessel?: string | null };

export const MERGE_TAGS: { tag: string; label: string }[] = [
  { tag: "{{first_name}}", label: "First name" },
  { tag: "{{name}}", label: "Full name" },
  { tag: "{{vessel}}", label: "Vessel" },
  { tag: "{{document}}", label: "Document" },
  { tag: "{{sender}}", label: "Your name" },
];

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function firstName(name: string): string {
  const n = (name || "").trim();
  // "Captain" / "The Captain" style placeholders stay whole.
  if (!n || /^(the\s+)?(captain|master|owner)/i.test(n)) return n || "Captain";
  return n.split(/\s+/)[0];
}

export function mergeTags(text: string, r: CampaignEmailRecipient, docTitle: string, sender: string): string {
  return (text || "")
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName(r.name))
    .replace(/\{\{\s*name\s*\}\}/gi, r.name || "")
    .replace(/\{\{\s*vessel\s*\}\}/gi, r.vessel || "your vessel")
    .replace(/\{\{\s*document\s*\}\}/gi, docTitle)
    .replace(/\{\{\s*sender\s*\}\}/gi, sender);
}

/** Light formatting → email-safe HTML (escaped first, so no raw HTML gets through). */
export function noteToHtml(text: string): string {
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" style="color:#1e40af;">$1</a>');
  const blocks = (text || "").replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((b) => {
    const lines = b.split("\n");
    if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
      return `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.6;color:#1f2937;">${
        lines.map((l) => `<li style="margin:0 0 4px;">${inline(l.replace(/^\s*[-•*]\s+/, ""))}</li>`).join("")
      }</ul>`;
    }
    return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2937;">${lines.map(inline).join("<br>")}</p>`;
  }).join("");
}

/** Plain-text twin of the note (for the text/plain part). */
function noteToText(text: string): string {
  return (text || "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/^\s*[•*]\s+/gm, "- ");
}

export function renderCampaignEmail(
  c: CampaignEmailInput,
  r: CampaignEmailRecipient,
  opts: { link: string; sender: string },
): { subject: string; html: string; text: string } {
  const m = (s: string | null | undefined) => mergeTags(s ?? "", r, c.docTitle, opts.sender);
  const subject = m(c.subject).replace(/\s+/g, " ").trim() || c.docTitle;
  const heading = m(c.heading).trim();
  const note = m(c.note);
  const signOff = m(c.signOff).trim();

  const button = c.allowEsign
    ? `<a href="${esc(opts.link)}" style="background:#1e40af;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:8px;display:inline-block;">Review &amp; sign online</a>`
    : `<a href="${esc(opts.link)}" style="background:#1e40af;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:8px;display:inline-block;">Open document &amp; upload signed copy</a>`;

  const paper = c.includePdf
    ? c.allowEsign
      ? `<strong>Prefer to sign on paper?</strong> The document is attached as a PDF — print it, sign (and stamp, if your vessel uses one), then upload the signed copy using the button above or simply reply to this email with it attached.`
      : `The document is attached as a PDF. Please print it, sign (and stamp, if your vessel uses one), then upload the signed copy using the button above or reply to this email with it attached.`
    : c.allowEsign
      ? `You can sign on screen in a minute or two — or download the PDF from the same page if you'd rather sign on paper and upload it.`
      : `Download the PDF from the page above, sign it, and upload the signed copy there — or reply to this email with it attached.`;

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f1f5f9;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08);">
    <tr><td style="background:#0b1f3a;padding:22px 32px;">${emailBrandLockup('<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.2px;">JLS Yachts</span><br><span style="color:#93c5fd;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">A Family of Excellence</span>', 30)}</td></tr>
    ${heading ? `<tr><td style="padding:28px 32px 0;"><h1 style="margin:0;font-size:21px;line-height:1.3;color:#0b1f3a;">${esc(heading)}</h1></td></tr>` : ""}
    <tr><td style="padding:${heading ? "18px" : "28px"} 32px 4px;">${noteToHtml(note)}</td></tr>
    <tr><td style="padding:4px 32px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
        <tr><td style="padding:18px 20px;">
          <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#64748b;">Document for signature</div>
          <div style="margin:4px 0 2px;font-size:16px;font-weight:700;color:#0f172a;">${esc(c.docTitle)}</div>
          ${r.vessel ? `<div style="font-size:13px;color:#475569;">Vessel: ${esc(r.vessel)}</div>` : ""}
          <div style="margin:16px 0 4px;">${button}</div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:10px 32px 4px;font-size:13px;line-height:1.6;color:#475569;">${paper}</td></tr>
    ${signOff ? `<tr><td style="padding:16px 32px 4px;">${noteToHtml(signOff)}</td></tr>` : ""}
    <tr><td style="padding:8px 32px 24px;font-size:12px;line-height:1.5;color:#94a3b8;">This link is personal to you and expires in ${c.expiresDays} days. If the button doesn't work, paste this into your browser:<br><span style="color:#64748b;word-break:break-all;">${esc(opts.link)}</span></td></tr>
    <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 32px;text-align:center;font-size:11px;color:#94a3b8;">JLS Yachts LLC · C1, Marina View, Mina Rashid, Dubai, UAE · +971 4 331 3555 · info@jlsyachts.com</td></tr>
  </table>
</td></tr></table></body></html>`;

  const text = [
    heading,
    noteToText(note).trim(),
    `Document: ${c.docTitle}${r.vessel ? ` — ${r.vessel}` : ""}`,
    `${c.allowEsign ? "Review & sign online" : "Open & upload signed copy"}: ${opts.link}`,
    c.includePdf ? "The document is also attached as a PDF if you'd rather print, sign and return it." : "",
    noteToText(signOff).trim(),
    `This link is personal to you and expires in ${c.expiresDays} days.`,
    "JLS Yachts LLC · Dubai, UAE",
  ].filter(Boolean).join("\n\n");

  return { subject, html, text };
}

/** Per-vessel Anchor forms a campaign can personalise (vessel details filled per recipient). */
export const CAMPAIGN_FORMS = ["agency-appointment-letter"] as const;

/** Starting copy for a new campaign, by document — staff edit freely. */
export function defaultCampaignCopy(doc: { kind: "template" | "form"; key: string; title: string }) {
  const signOff = "Kind regards,\n{{sender}}\nJLS Yachts LLC";
  if (doc.kind === "form" && doc.key === "agency-appointment-letter") {
    return {
      subject: "{{vessel}} — Agency Appointment Letter for signature",
      heading: "Agency Appointment Letter",
      note: "Dear {{first_name}},\n\nSo that we can act on behalf of **{{vessel}}** with the UAE authorities — Immigration, Customs, Coast Guard, the Port Authorities and the Federal Transport Authority — we need a signed Agency Appointment Letter.\n\nWe've prepared the letter with your vessel's details already filled in. Please check the vessel name and IMO number, then sign.\n\nIf anything needs correcting, just reply to this email.",
      signOff,
    };
  }
  if (/tariff/i.test(doc.title)) {
    return {
      subject: "{{vessel}} — JLS Yachts Standard Tariff Sheet for signature",
      heading: "Our Standard Tariff Sheet",
      note: "Dear {{first_name}},\n\nPlease find our current Standard Tariff Sheet for Port Agency services, together with our General Terms & Conditions.\n\nAs part of our annual renewal, we kindly ask you to review and sign it for **{{vessel}}** before services commence. Signing online takes about a minute.\n\nIf you have any questions about the rates, just reply to this email and we'll be happy to help.",
      signOff,
    };
  }
  return {
    subject: "{{document}} — signature requested",
    heading: doc.title,
    note: "Dear {{first_name}},\n\nPlease review and sign the attached {{document}}.\n\nIf you have any questions, just reply to this email.",
    signOff,
  };
}
