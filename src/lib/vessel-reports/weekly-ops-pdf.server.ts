/**
 * The weekly / monthly operations report as a PDF on the JLS letterhead —
 * written to be read by the client: a summary, then each team's section with
 * what was completed, what is planned and anything needing attention.
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { embedJlsBrand, drawJlsHeader, drawJlsFooter, JLS_MARGIN, JLS_PDF_COLORS } from "@/lib/brand/jls-letterhead.server";
import { winAnsiSafe } from "@/lib/pdf-winansi";

export type OpsTone = "bad" | "warn" | "ok" | "info";
export type OpsPdfLine = { date: string; what: string; detail: string; status: string; tone: OpsTone };
export type OpsPdfModel = {
  title: string;
  subtitle: string;
  intro: string;
  control: [string, string][];
  summary: [string, string][];
  attention: { text: string; tone: OpsTone }[];
  sections: { title: string; sub: string; vessels: { name: string; blocks: { label: string; lines: OpsPdfLine[] }[] }[]; empty: string }[];
  closing: string;
};

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const TONE = { bad: hex("#b91c1c"), warn: hex("#b45309"), ok: hex("#047857"), info: hex("#07435E") };
const NAVY = hex("#07435E");
const PALE = hex("#f1f5f9");
const RULE = hex("#e2e8f0");

/** Split text into lines that fit `width` at `size`. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of winAnsiSafe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

export async function buildOpsPdf(model: OpsPdfModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(winAnsiSafe(model.title));
  pdf.setAuthor("JLS Yachts");
  const brand = await embedJlsBrand(pdf);
  const { font, bold } = brand;
  const M = JLS_MARGIN;
  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  let W = 0;

  const newPage = () => {
    page = pdf.addPage([595.28, 841.89]);
    pages.push(page);
    W = page.getSize().width;
    y = drawJlsHeader(page, brand, { control: model.control });
  };
  /** Make room for `h` points, starting a new page when it won't fit. */
  const need = (h: number) => { if (y - h < brand.contentBottom + 8) newPage(); };
  const text = (s: string, x: number, size: number, f: PDFFont, color = JLS_PDF_COLORS.ink) =>
    page.drawText(winAnsiSafe(s), { x, y, size, font: f, color });

  newPage();
  const inner = W - 2 * M; // set after the first page so W is known

  // ── title ──
  need(40);
  text(model.title, M, 17, bold, NAVY); y -= 17;
  text(model.subtitle, M, 9.5, font, JLS_PDF_COLORS.muted); y -= 16;
  for (const l of wrap(model.intro, font, 10, inner)) { need(14); text(l, M, 10, font); y -= 13; }
  y -= 8;

  // ── summary box ──
  const sumRows = model.summary.map(([k, v]) => ({ k, lines: wrap(v, font, 9.5, inner - 110) }));
  const attn = model.attention.map((a) => ({ ...a, lines: wrap(a.text, font, 9, inner - 34) }));
  const boxH = 24 + sumRows.reduce((h, r) => h + r.lines.length * 12.5 + 3, 0)
    + (attn.length ? 20 + attn.reduce((h, a) => h + a.lines.length * 11.5 + 2, 0) : 16);
  need(boxH);
  page.drawRectangle({ x: M, y: y - boxH, width: inner, height: boxH, color: PALE });
  y -= 16;
  text("Summary", M + 12, 11, bold, NAVY); y -= 16;
  for (const r of sumRows) {
    text(r.k, M + 12, 9.5, bold, NAVY);
    r.lines.forEach((l, i) => { if (i) y -= 12.5; text(l, M + 98, 9.5, font); });
    y -= 15.5;
  }
  if (attn.length) {
    y -= 4;
    text(`Needs attention (${attn.length})`, M + 12, 10, bold, TONE.bad); y -= 14;
    for (const a of attn) {
      page.drawCircle({ x: M + 17, y: y + 3, size: 2, color: TONE[a.tone] });
      a.lines.forEach((l, i) => { if (i) y -= 11.5; text(l, M + 24, 9, font); });
      y -= 13.5;
    }
  } else {
    text("Nothing needs attention.", M + 12, 9.5, font, TONE.ok); y -= 14;
  }
  y -= 14;

  // ── sections ──
  const dateW = 46, statusW = 92;
  const textX = M + dateW, textW = inner - dateW - statusW - 8;
  for (const s of model.sections) {
    need(60);
    text(s.title, M, 14, bold, NAVY);
    const tw = bold.widthOfTextAtSize(winAnsiSafe(s.title), 14);
    page.drawText(winAnsiSafe(`  ·  ${s.sub}`), { x: M + tw, y, size: 9, font, color: JLS_PDF_COLORS.muted });
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: NAVY });
    y -= 16;
    if (!s.vessels.length) { text(s.empty, M, 9.5, font, JLS_PDF_COLORS.muted); y -= 22; continue; }
    for (const v of s.vessels) {
      need(40);
      if (v.name) { text(v.name, M, 11.5, bold, NAVY); y -= 15; } // one-vessel reports don't repeat the name
      for (const b of v.blocks) {
        if (!b.lines.length) continue;
        need(30);
        text(b.label.toUpperCase(), M, 7.5, bold, JLS_PDF_COLORS.muted); y -= 11;
        for (const l of b.lines) {
          const whatLines = wrap(l.what, bold, 9, textW);
          const detailLines = l.detail ? wrap(l.detail, font, 8.5, textW) : [];
          const h = whatLines.length * 11 + detailLines.length * 10.5 + 6;
          need(h);
          page.drawLine({ start: { x: M, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 0.5, color: RULE });
          text(l.date, M, 8.5, font, JLS_PDF_COLORS.muted);
          const st = winAnsiSafe(l.status);
          page.drawText(st, { x: W - M - bold.widthOfTextAtSize(st, 8.5), y, size: 8.5, font: bold, color: TONE[l.tone] });
          whatLines.forEach((t, i) => { if (i) y -= 11; text(t, textX, 9, bold); });
          for (const t of detailLines) { y -= 10.5; text(t, textX, 8.5, font, JLS_PDF_COLORS.muted); }
          y -= 15;
        }
        y -= 4;
      }
      y -= 8;
    }
    y -= 8;
  }

  // ── closing note ──
  const closing = wrap(model.closing, font, 8.5, inner);
  need(closing.length * 11 + 8);
  for (const l of closing) { text(l, M, 8.5, font, JLS_PDF_COLORS.muted); y -= 11; }

  pages.forEach((p, i) => drawJlsFooter(p, brand, { pageLabel: `Page ${i + 1} of ${pages.length}` }));
  return pdf.save();
}
