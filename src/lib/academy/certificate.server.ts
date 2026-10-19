/**
 * Crew Academy certificate of completion (pdf-lib, A4 landscape).
 *
 * JLS courses carry the JLS Yachts logo; a vessel's own courses carry the
 * vessel's logo (yachts.logo_url, PNG or JPG) and name instead. Generated on
 * demand from the academy_certificates row — nothing is stored — so a reprint
 * always matches the record. Each route checks who may download it first.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import { JLS_BRAND_IMAGES } from "@/lib/brand/jls-assets";

export type CertificateData = {
  number: string;
  learnerName: string;
  courseTitle: string;
  owner: "jls" | "vessel";
  vesselName: string;
  vesselLogoUrl: string | null;
  score: number | null;
  issuedAt: string;
  expiresAt: string | null;
};

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Text the standard fonts can draw: accents folded, anything else replaced. */
function safe(text: string, font: PDFFont): string {
  const folded = text.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  let out = "";
  for (const ch of folded) {
    try { font.encodeText(ch); out += ch; } catch { out += "?"; }
  }
  return out;
}

async function vesselLogo(pdf: PDFDocument, url: string | null): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
    return null; // WebP etc. — pdf-lib can't embed it; the vessel name stands alone
  } catch {
    return null;
  }
}

export async function buildCertificatePdf(d: CertificateData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificate ${d.number} — ${d.courseTitle}`);
  pdf.setAuthor(d.owner === "jls" ? "JLS Yachts" : d.vesselName);
  const page = pdf.addPage([841.89, 595.28]); // A4 landscape
  const { width: W, height: H } = page.getSize();
  const [serif, serifBold, sans, sansBold] = await Promise.all([
    pdf.embedFont(StandardFonts.TimesRoman), pdf.embedFont(StandardFonts.TimesRomanBold),
    pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold),
  ]);
  const navy = rgb(0.043, 0.165, 0.357);
  const gold = rgb(0.72, 0.58, 0.29);
  const ink = rgb(0.1, 0.11, 0.13);
  const muted = rgb(0.4, 0.42, 0.46);

  // Frame
  page.drawRectangle({ x: 22, y: 22, width: W - 44, height: H - 44, borderColor: navy, borderWidth: 2 });
  page.drawRectangle({ x: 30, y: 30, width: W - 60, height: H - 60, borderColor: gold, borderWidth: 0.8 });

  const centre = (text: string, y: number, font: PDFFont, size: number, color = ink) => {
    const s = safe(text, font);
    let fs = size;
    while (fs > 10 && font.widthOfTextAtSize(s, fs) > W - 140) fs -= 1;
    page.drawText(s, { x: (W - font.widthOfTextAtSize(s, fs)) / 2, y, size: fs, font, color });
  };

  // Brand — the whole block (logo, wording) is centred between the frame and the footer.
  const logo = d.owner === "jls" ? await pdf.embedPng(b64(JLS_BRAND_IMAGES.logoPng)) : await vesselLogo(pdf, d.vesselLogoUrl);
  const scale = logo ? Math.min((d.owner === "jls" ? 190 : 120) / logo.width, 64 / logo.height) : 0;
  const logoH = logo ? logo.height * scale : 0;
  const blockH = (logo ? logoH + 18 : 0) + (d.owner === "vessel" ? 24 : 0) + 236;
  let top = H - 70 - Math.max(0, (H - 70 - 80 - blockH) / 2);
  if (logo) {
    const w = logo.width * scale;
    page.drawImage(logo, { x: (W - w) / 2, y: top - logoH, width: w, height: logoH });
    top -= logoH + 18;
  }
  if (d.owner === "vessel") { centre(d.vesselName.toUpperCase(), top - 4, sansBold, 13, navy); top -= 24; }

  centre("CERTIFICATE OF COMPLETION", top - 26, serifBold, 30, navy);
  page.drawLine({ start: { x: W / 2 - 110, y: top - 40 }, end: { x: W / 2 + 110, y: top - 40 }, thickness: 1, color: gold });
  centre("This is to certify that", top - 72, serif, 14, muted);
  centre(d.learnerName, top - 112, serifBold, 34, ink);
  centre("has successfully completed", top - 146, serif, 14, muted);
  centre(d.courseTitle, top - 182, serifBold, 22, navy);
  const detail = [
    d.score != null ? `Score ${d.score}%` : null,
    `Completed ${fmt(d.issuedAt)}`,
    d.expiresAt ? `Valid until ${fmt(d.expiresAt)}` : null,
  ].filter(Boolean).join("   ·   ");
  centre(detail, top - 212, sans, 11, ink);
  if (d.owner === "jls") centre(`On board ${d.vesselName}`, top - 230, sans, 10, muted);

  // Footer
  const issuer = d.owner === "jls" ? "Issued by JLS Yachts · Crew Academy" : `Issued by ${d.vesselName} · Crew Academy`;
  page.drawText(safe(issuer, sans), { x: 54, y: 48, size: 9, font: sans, color: muted });
  const num = safe(`Certificate no. ${d.number}`, sansBold);
  page.drawText(num, { x: W - 54 - sansBold.widthOfTextAtSize(num, 9), y: 48, size: 9, font: sansBold, color: muted });

  return await pdf.save();
}

/** CA-2026-7KQ4XM — year plus six characters that can't be confused with each other. */
export function certificateNumber(date = new Date()): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `CA-${date.getFullYear()}-${[...bytes].map((b) => alphabet[b % alphabet.length]).join("")}`;
}
