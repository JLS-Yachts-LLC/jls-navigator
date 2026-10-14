/**
 * Anchor Digital Forms — server-side PDF generation (pdf-lib).
 *
 * Two layouts, chosen by the form definition's `layout`:
 *
 *  - "jls" (default) — a document JLS issues. Drawn on the JLS corporate
 *    letterhead (same artwork + layout as the controlled QMS template, e.g. the
 *    Standard Tariff Sheet): logo, document-control box, navy section bars,
 *    brands strip / address / badges footer. Field forms render as a bordered
 *    label/value table; letter-style forms (bodyTemplate) as justified prose.
 *
 *  - "client-letter" — a letter the CLIENT issues and signs (e.g. the Agency
 *    Appointment Letter, where the vessel appoints JLS). No JLS branding at all:
 *    it reproduces the client's own template (US Letter, 1" margins, justified,
 *    blank space at the top for the vessel's letterhead), because it goes to the
 *    authorities on the vessel's behalf.
 *
 * bodyTemplate conventions: {{field}} merges a value; a line wrapped in **…** is
 * bold; [[signature]] marks where the signer signs (space is left there and its
 * position returned so e-Sign stamps the signature on the spot).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { FormDef } from "./definitions";
import { winAnsiSafe } from "@/lib/pdf-winansi";
import { embedJlsBrand, drawJlsHeader, drawJlsFooter, JLS_MARGIN, JLS_PDF_COLORS } from "@/lib/brand/jls-letterhead.server";

/** Where a letter's [[signature]] spot landed — page (1-based) and the centre of
 *  the space as fractions of the page from the top-left (the e-Sign field shape). */
export type SignatureAnchor = { page: number; x: number; y: number };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-14" → "14 Oct 2026" (or the letter style "14-Oct-26"). */
function fmtDate(iso: string, letter = false): string {
  const [y, m, d] = iso.split("-").map(Number);
  return letter ? `${d}-${MONTHS[m - 1]}-${String(y).slice(2)}` : `${d} ${MONTHS[m - 1]} ${y}`;
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const s = String(v);
  return winAnsiSafe(ISO_DATE.test(s) ? fmtDate(s) : s);
}

function mergeBody(template: string, values: Record<string, unknown>, letterDates: boolean): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = values[k];
    if (v === null || v === undefined || v === "") return "";
    const s = String(v);
    return winAnsiSafe(ISO_DATE.test(s) ? fmtDate(s, letterDates) : s);
  });
}

function wrapWords(text: string, f: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const trial = line ? `${line} ${word}` : word;
    if (f.widthOfTextAtSize(trial, size) > maxW && line) { out.push(line); line = word; }
    else line = trial;
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

/** Draw one line, optionally justified to the full width (word spacing stretched). */
function drawLine(page: PDFPage, text: string, x: number, y: number, maxW: number, f: PDFFont, size: number, justify: boolean, color = JLS_PDF_COLORS.ink) {
  const words = text.split(" ");
  if (!justify || words.length < 2) { page.drawText(text, { x, y, size, font: f, color }); return; }
  const wordsW = words.reduce((s, w) => s + f.widthOfTextAtSize(w, size), 0);
  const gap = (maxW - wordsW) / (words.length - 1);
  let cx = x;
  for (const w of words) { page.drawText(w, { x: cx, y, size, font: f, color }); cx += f.widthOfTextAtSize(w, size) + gap; }
}

type Prose = {
  pdf: PDFDocument; page: PDFPage; y: number;
  x: number; maxW: number; size: number; lineH: number;
  font: PDFFont; bold: PDFFont; bottom: number;
  newPage: () => { page: PDFPage; y: number };
};

/**
 * Render merged letter text. Each source line is a paragraph (blank line = one
 * empty line, as in Word "No Spacing"); wrapped lines are justified except a
 * paragraph's last. Returns the [[signature]] anchor if the text has one.
 */
function renderProse(p: Prose, text: string, sigSpace: number): SignatureAnchor | null {
  let anchor: SignatureAnchor | null = null;
  const { width: W, height: H } = p.page.getSize();
  const ensure = (need: number) => {
    if (p.y - need < p.bottom) { const n = p.newPage(); p.page = n.page; p.y = n.y; }
  };
  const [before, ...rest] = text.split("[[signature]]");
  const parts: { text: string; sigAfter: boolean }[] = [{ text: before.replace(/\n$/, ""), sigAfter: rest.length > 0 }];
  if (rest.length) parts.push({ text: rest.join(""), sigAfter: false });

  for (const part of parts) {
    for (const para of part.text.split("\n")) {
      if (!para.trim()) { p.y -= p.lineH; continue; }
      const isBold = /^\*\*.*\*\*$/.test(para.trim());
      const f = isBold ? p.bold : p.font;
      const clean = para.trim().replace(/^\*\*|\*\*$/g, "");
      const lines = wrapWords(clean, f, p.size, p.maxW);
      lines.forEach((ln, i) => {
        ensure(p.lineH);
        drawLine(p.page, ln, p.x, p.y - p.size, p.maxW, f, p.size, i < lines.length - 1);
        p.y -= p.lineH;
      });
    }
    if (part.sigAfter) {
      ensure(sigSpace + p.lineH * 2);
      anchor = { page: p.pdf.getPages().indexOf(p.page) + 1, x: (p.x + 70) / W, y: (H - (p.y - sigSpace / 2)) / H };
      p.y -= sigSpace;
    }
  }
  return anchor;
}

export async function buildFormPdf(def: FormDef, values: Record<string, unknown>): Promise<Uint8Array> {
  return (await buildFormPdfDetailed(def, values)).bytes;
}

export async function buildFormPdfDetailed(
  def: FormDef, values: Record<string, unknown>,
): Promise<{ bytes: Uint8Array; signature: SignatureAnchor | null }> {
  return def.layout === "client-letter" ? buildClientLetter(def, values) : buildJlsDocument(def, values);
}

// ── Client letter: the client's own template, no JLS branding ─────────────────

async function buildClientLetter(def: FormDef, values: Record<string, unknown>) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(def.title);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 72;              // US Letter, 1" margins (as the template)
  const size = 11, lineH = 13.4;               // 11pt, single spacing
  const TOP_SPACE = 6 * lineH;                 // six blank lines: room for the vessel's letterhead

  const newPage = () => ({ page: pdf.addPage([W, H]), y: H - M });
  const first = newPage();
  const p: Prose = {
    pdf, page: first.page, y: first.y - TOP_SPACE, x: M, maxW: W - 2 * M, size, lineH,
    font, bold, bottom: M, newPage,
  };
  const signature = renderProse(p, mergeBody(def.bodyTemplate ?? "", values, true), 3 * lineH + 12);
  return { bytes: await pdf.save(), signature };
}

// ── JLS document: corporate letterhead ────────────────────────────────────────

async function buildJlsDocument(def: FormDef, values: Record<string, unknown>) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(def.title);
  pdf.setAuthor("JLS Yachts LLC");
  const brand = await embedJlsBrand(pdf);
  const { font, bold } = brand;
  const W = 595.28, H = 841.89, M = JLS_MARGIN;
  const maxW = W - 2 * M;
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" });
  const control: [string, string][] = [["Title", def.title], ["Category", def.category], ["Date", today]];

  const newPage = () => {
    const page = pdf.addPage([W, H]);
    return { page, y: drawJlsHeader(page, brand, { control }) };
  };
  let { page, y } = newPage();

  // Centred document title, as on the template ("STANDARD TARIFF SHEET").
  const title = winAnsiSafe(def.title).toUpperCase();
  const tSize = title.length > 40 ? 13 : 15;
  page.drawText(title, { x: (W - bold.widthOfTextAtSize(title, tSize)) / 2, y: y - tSize, size: tSize, font: bold, color: JLS_PDF_COLORS.ink });
  y -= tSize + 8;
  if (def.intro) {
    for (const ln of wrapWords(winAnsiSafe(def.intro), font, 8.5, maxW - 40)) {
      page.drawText(ln, { x: (W - font.widthOfTextAtSize(ln, 8.5)) / 2, y: y - 8.5, size: 8.5, font, color: JLS_PDF_COLORS.muted });
      y -= 11;
    }
  }
  y -= 10;

  let signature: SignatureAnchor | null = null;

  if (def.bodyTemplate) {
    const p: Prose = { pdf, page, y, x: M, maxW, size: 10.5, lineH: 13.4, font, bold, bottom: brand.contentBottom, newPage };
    signature = renderProse(p, mergeBody(def.bodyTemplate, values, false), 52);
  } else {
    // Field table: navy section bar, then bordered label | value rows.
    const size = 8.6, pad = 3.2, labelW = maxW * 0.38, valueW = maxW - labelW;
    const ensure = (need: number) => {
      if (y - need < brand.contentBottom) ({ page, y } = newPage());
    };
    for (const section of def.sections) {
      ensure(16 + 14);
      if (section.title) {
        page.drawRectangle({ x: M, y: y - 13, width: maxW, height: 13, color: JLS_PDF_COLORS.navy });
        page.drawText(winAnsiSafe(section.title), { x: M + 4, y: y - 9.8, size: 8.6, font: bold, color: JLS_PDF_COLORS.white });
        y -= 13;
      }
      for (const field of section.fields) {
        const label = wrapWords(winAnsiSafe(field.label), font, size, labelW - pad * 2);
        const value = fmtVal(values[field.key]).split("\n").flatMap((l) => wrapWords(l, font, size, valueW - pad * 2));
        const rowH = Math.max(label.length, value.length) * (size + 2.4) + pad * 1.6;
        ensure(rowH);
        page.drawRectangle({ x: M, y: y - rowH, width: labelW, height: rowH, borderColor: JLS_PDF_COLORS.rule, borderWidth: 0.5, color: rgb(0.965, 0.97, 0.98) });
        page.drawRectangle({ x: M + labelW, y: y - rowH, width: valueW, height: rowH, borderColor: JLS_PDF_COLORS.rule, borderWidth: 0.5 });
        label.forEach((ln, i) => page.drawText(ln, { x: M + pad, y: y - pad - size - i * (size + 2.4) + 1.5, size, font, color: JLS_PDF_COLORS.ink }));
        value.forEach((ln, i) => page.drawText(ln, { x: M + labelW + pad, y: y - pad - size - i * (size + 2.4) + 1.5, size, font, color: JLS_PDF_COLORS.ink }));
        y -= rowH;
      }
      y -= 8;
    }
  }

  const pages = pdf.getPages();
  pages.forEach((pg, i) => drawJlsFooter(pg, brand, { pageLabel: `Page ${i + 1} of ${pages.length}` }));
  return { bytes: await pdf.save(), signature };
}
