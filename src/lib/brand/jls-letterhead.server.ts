/**
 * JLS Yachts corporate letterhead for generated PDFs (pdf-lib), laid out like
 * the controlled QMS template (Standard Tariff Sheet JLS-QMS-64-2025):
 *
 *   header  jlsyachts logo top-left · document-control box top-right
 *   footer  group brands strip · company name, address & contacts (small print)
 *           · certification badges bottom-right · document number
 *
 * Usage:
 *   const brand = await embedJlsBrand(pdf)
 *   let y = drawJlsHeader(page, brand, { control: [["Title", "…"], ["Date", "…"]] })
 *   … draw content down to brand.contentBottom …
 *   drawJlsFooter(page, brand, { docNo: "…", pageLabel: "Page 1 of 2" })
 */
import { StandardFonts, rgb, type PDFDocument, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { JLS_BRAND_IMAGES } from "@/lib/brand/jls-assets";
import { JLS_COMPANY, JLS_CONTACT_LINE } from "@/lib/brand/jls-company";

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

export const JLS_PDF_COLORS = {
  ink: rgb(0.08, 0.09, 0.11),
  muted: rgb(0.38, 0.41, 0.46),
  rule: rgb(0.2, 0.2, 0.2),
  blue: hex("#0070C0"),
  navy: hex("#0B2A5B"),
  white: rgb(1, 1, 1),
};

/** Side margin used by the template (0.75"). */
export const JLS_MARGIN = 54;

export type JlsBrand = {
  logo: PDFImage; strip: PDFImage; badges: PDFImage;
  font: PDFFont; bold: PDFFont;
  /** Lowest y content may reach before the footer (points from the bottom). */
  contentBottom: number;
};

export async function embedJlsBrand(pdf: PDFDocument): Promise<JlsBrand> {
  const [logo, strip, badges, font, bold] = await Promise.all([
    pdf.embedPng(b64(JLS_BRAND_IMAGES.logoPng)),
    pdf.embedPng(b64(JLS_BRAND_IMAGES.stripPng)),
    pdf.embedJpg(b64(JLS_BRAND_IMAGES.badgesJpg)),
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);
  return { logo, strip, badges, font, bold, contentBottom: 112 };
}

/**
 * Logo + optional document-control box. Returns the y just below the header
 * where content can start.
 */
export function drawJlsHeader(page: PDFPage, brand: JlsBrand, opts: { control?: [string, string][] } = {}): number {
  const { width: W, height: H } = page.getSize();
  const M = JLS_MARGIN;
  const lw = 148.6, lh = (brand.logo.height / brand.logo.width) * lw;
  const top = H - 32.8;
  page.drawImage(brand.logo, { x: M, y: top - lh, width: lw, height: lh });

  let bottom = top - lh;
  const rows = (opts.control ?? []).filter(([, v]) => v);
  if (rows.length) {
    const size = 8.4, rowH = 10.2, boxW = 242, labelW = 85;
    const x = W - M - boxW;
    let y = top - 6;
    for (const [label, value] of rows) {
      page.drawRectangle({ x, y: y - rowH, width: labelW, height: rowH, borderColor: JLS_PDF_COLORS.rule, borderWidth: 0.6 });
      page.drawRectangle({ x: x + labelW, y: y - rowH, width: boxW - labelW, height: rowH, borderColor: JLS_PDF_COLORS.rule, borderWidth: 0.6 });
      page.drawText(label, { x: x + 3, y: y - rowH + 2.4, size, font: brand.font, color: JLS_PDF_COLORS.ink });
      let v = value;
      while (brand.font.widthOfTextAtSize(v, size) > boxW - labelW - 6 && v.length > 4) v = `${v.slice(0, -2)}…`;
      page.drawText(v, { x: x + labelW + 3, y: y - rowH + 2.4, size, font: brand.font, color: JLS_PDF_COLORS.ink });
      y -= rowH;
    }
    bottom = Math.min(bottom, y);
  }
  return bottom - 22;
}

/** Brands strip, company block, badges and document number — on every page. */
export function drawJlsFooter(page: PDFPage, brand: JlsBrand, opts: { docNo?: string | null; pageLabel?: string | null } = {}) {
  const { width: W } = page.getSize();
  const M = JLS_MARGIN;
  const sw = W - 2 * M, sh = (brand.strip.height / brand.strip.width) * sw;
  page.drawImage(brand.strip, { x: M, y: 58.6, width: sw, height: sh });

  const small = { size: 5, color: JLS_PDF_COLORS.ink };
  page.drawText(JLS_COMPANY.legalName, { x: M, y: 45.6, font: brand.bold, ...small });
  page.drawText(JLS_COMPANY.address, { x: M, y: 39.8, font: brand.font, ...small });
  page.drawText(JLS_CONTACT_LINE, { x: M, y: 34.1, font: brand.font, ...small });

  const bw = 141.6, bh = (brand.badges.height / brand.badges.width) * bw;
  page.drawImage(brand.badges, { x: W - M - bw, y: 16.6, width: bw, height: bh });

  const docLine = [opts.docNo ? `Document No. ${opts.docNo}` : null, opts.pageLabel ?? null].filter(Boolean).join("   ·   ");
  if (docLine) page.drawText(docLine, { x: M, y: 16.3, size: 6, font: brand.bold, color: JLS_PDF_COLORS.ink });
}
