/**
 * How-to Guides → PDF (pdf-lib). Used by the in-app "Download PDF" buttons and by
 * `node scripts/build-how-to-pdfs.ts`, which writes docs/how-to-guides/*.pdf.
 *
 * A4 portrait, navy header band per guide, numbered steps with screenshots and
 * the same gold highlight boxes as the in-app view. Images come from `loadImage`
 * (fetch in the browser, fs in Node) so the builder runs in both.
 *
 * Standard Helvetica only covers WinAnsi, so text goes through `clean()` first.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { HowToGuide, GuideStep } from "./guides";

const SHOT_W = 1568;
const SHOT_H = 710;

const A4 = { w: 595.28, h: 841.89 };
const M = 44; // page margin
const CW = A4.w - M * 2; // content width

const NAVY = rgb(0x0a / 255, 0x18 / 255, 0x38 / 255);
const GOLD = rgb(0xc9 / 255, 0xa2 / 255, 0x27 / 255);
const GOLD_LIGHT = rgb(0xe9 / 255, 0xcc / 255, 0x72 / 255);
const INK = rgb(0.12, 0.14, 0.2);
const GREY = rgb(0.4, 0.44, 0.52);
const TIP_BG = rgb(0.99, 0.96, 0.88);

export type ImageLoader = (src: string) => Promise<Uint8Array>;

// Characters Helvetica (WinAnsi) can't draw → nearest equivalent.
const SWAP: Record<string, string> = { "→": "->", "←": "<-", "≤": "<=", "≥": ">=", "✓": "", "✦": "", "×": "x", "‹": "<", "›": ">" };
function clean(s: string): string {
  return s
    .replace(/[→←≤≥✓✦×‹›]/g, (c) => SWAP[c] ?? "")
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, "");
}

type Word = { w: string; bold: boolean; glue?: boolean };

/** Split "**bold** plain" into styled words. `glue` = no space before it (e.g. the
 *  comma right after a bold word). */
function words(text: string): Word[] {
  const out: Word[] = [];
  let prevEndsSpace = true;
  clean(text).split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
    if (!part) return;
    const bold = part.startsWith("**") && part.endsWith("**");
    const body = bold ? part.slice(2, -2) : part;
    // Glue only when nothing separates this part from the previous one ("**Flag**,").
    const glueFirst = out.length > 0 && !prevEndsSpace && !/^\s/.test(body);
    prevEndsSpace = /\s$/.test(body);
    body.split(/\s+/).filter(Boolean).forEach((w, i) => out.push({ w, bold, glue: i === 0 && glueFirst }));
  });
  return out;
}

interface Fonts { reg: PDFFont; bold: PDFFont }

class Writer {
  page!: PDFPage;
  y = 0;
  pageNo = 0;
  doc: PDFDocument;
  f: Fonts;
  footer: string;
  // No parameter properties — Node's type-stripping (the PDF build script) rejects them.
  constructor(doc: PDFDocument, f: Fonts, footer: string) {
    this.doc = doc;
    this.f = f;
    this.footer = footer;
  }

  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pageNo++;
    this.y = A4.h - M;
    this.page.drawText(clean(this.footer), { x: M, y: 24, size: 8, font: this.f.reg, color: GREY });
    const n = String(this.pageNo);
    this.page.drawText(n, { x: A4.w - M - this.f.reg.widthOfTextAtSize(n, 8), y: 24, size: 8, font: this.f.reg, color: GREY });
  }

  ensure(h: number) {
    if (this.y - h < M + 10) this.newPage();
  }

  /** Lay out rich text into lines (measured, not drawn). */
  lines(text: string, size: number, width: number): Word[][] {
    const out: Word[][] = [];
    let line: Word[] = [];
    let lw = 0;
    const space = this.f.reg.widthOfTextAtSize(" ", size);
    for (const t of words(text)) {
      const ww = (t.bold ? this.f.bold : this.f.reg).widthOfTextAtSize(t.w, size);
      // A glued word (punctuation after bold) never starts a new line on its own.
      if (line.length && !t.glue && lw + space + ww > width) { out.push(line); line = []; lw = 0; }
      lw += (line.length && !t.glue ? space : 0) + ww;
      line.push(line.length ? t : { ...t, glue: false });
    }
    if (line.length) out.push(line);
    return out;
  }

  para(text: string, opts: { size?: number; x?: number; width?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}) {
    const size = opts.size ?? 10.5;
    const x = opts.x ?? M;
    const lh = size * 1.45;
    const space = this.f.reg.widthOfTextAtSize(" ", size);
    for (const line of this.lines(text, size, opts.width ?? CW - (x - M))) {
      this.ensure(lh);
      let cx = x;
      line.forEach((t, i) => {
        const font = t.bold ? this.f.bold : this.f.reg;
        if (i > 0 && !t.glue) cx += space;
        this.page.drawText(t.w, { x: cx, y: this.y - size, size, font, color: opts.color ?? INK });
        cx += font.widthOfTextAtSize(t.w, size);
      });
      this.y -= lh;
    }
    this.y -= opts.gap ?? 4;
  }
}

async function drawGuide(w: Writer, doc: PDFDocument, f: Fonts, g: HowToGuide, loadImage: ImageLoader, cache: Map<string, PDFImage>) {
  w.newPage();
  // Header band
  const bandH = 96;
  w.page.drawRectangle({ x: 0, y: A4.h - bandH, width: A4.w, height: bandH, color: NAVY });
  w.page.drawRectangle({ x: 0, y: A4.h - bandH, width: A4.w, height: 3, color: GOLD });
  w.page.drawText(clean(`POLARIS  ·  HOW-TO GUIDE  ·  ${g.section.toUpperCase()}`), { x: M, y: A4.h - 32, size: 8.5, font: f.bold, color: GOLD_LIGHT });
  w.page.drawText(clean(g.title), { x: M, y: A4.h - 60, size: 20, font: f.bold, color: rgb(1, 1, 1) });
  w.page.drawText(clean(`${g.steps.length} steps  ·  about ${g.minutes} min`), { x: M, y: A4.h - 80, size: 9, font: f.reg, color: GOLD_LIGHT });
  w.y = A4.h - bandH - 22;
  w.para(g.summary, { size: 11.5, color: GREY, gap: 10 });

  for (let i = 0; i < g.steps.length; i++) {
    await drawStep(w, doc, f, g.steps[i], i + 1, loadImage, cache);
  }
}

async function drawStep(w: Writer, doc: PDFDocument, f: Fonts, s: GuideStep, n: number, loadImage: ImageLoader, cache: Map<string, PDFImage>) {
  const imgH = s.image ? (CW * (s.image.h ?? SHOT_H)) / SHOT_W : 0;
  // Keep the heading, its text, bullets and screenshot together on one page.
  const textH =
    (w.lines(s.text, 10.5, CW - 28).length + (s.bullets ?? []).reduce((n, b) => n + w.lines(b, 10.5, CW - 42).length, 0)) * 15.2;
  w.ensure(Math.min(38 + textH + imgH + 14, A4.h - M * 2 - 20));
  w.y -= 6;
  // Number badge + title
  w.page.drawCircle({ x: M + 10, y: w.y - 9, size: 10, color: GOLD });
  const num = String(n);
  w.page.drawText(num, { x: M + 10 - f.bold.widthOfTextAtSize(num, 10) / 2, y: w.y - 12.5, size: 10, font: f.bold, color: NAVY });
  w.page.drawText(clean(s.title), { x: M + 28, y: w.y - 13, size: 13, font: f.bold, color: NAVY });
  w.y -= 26;

  w.para(s.text, { x: M + 28 });
  for (const b of s.bullets ?? []) {
    w.ensure(16);
    w.page.drawCircle({ x: M + 34, y: w.y - 6.5, size: 1.8, color: GOLD });
    w.para(b, { x: M + 42, gap: 1 });
  }

  if (s.image) {
    let im = cache.get(s.image.src);
    if (!im) {
      const bytes = await loadImage(s.image.src);
      im = /\.png$/i.test(s.image.src) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      cache.set(s.image.src, im);
    }
    w.y -= 4;
    w.ensure(imgH + 8);
    const top = w.y;
    w.page.drawImage(im, { x: M, y: top - imgH, width: CW, height: imgH });
    w.page.drawRectangle({ x: M, y: top - imgH, width: CW, height: imgH, borderColor: rgb(0.8, 0.82, 0.86), borderWidth: 0.6 });
    const k = CW / SHOT_W;
    for (const h of s.image.highlights ?? []) {
      w.page.drawRectangle({
        x: M + h.x * k - 2,
        y: top - (h.y + h.h) * k - 2,
        width: h.w * k + 4,
        height: h.h * k + 4,
        borderColor: GOLD_LIGHT,
        borderWidth: 2,
      });
    }
    w.y = top - imgH - 10;
  }

  if (s.tip) {
    const size = 9.5;
    const lines = w.lines(`**Tip:** ${s.tip}`, size, CW - 48);
    const h = lines.length * size * 1.45 + 12;
    w.ensure(h + 4);
    w.page.drawRectangle({ x: M + 28, y: w.y - h, width: CW - 28, height: h, color: TIP_BG });
    w.page.drawRectangle({ x: M + 28, y: w.y - h, width: 3, height: h, color: GOLD });
    w.y -= 6;
    w.para(`**Tip:** ${s.tip}`, { x: M + 40, size, width: CW - 48, gap: 6 });
  }
  w.y -= 8;
}

/** One PDF holding every guide passed in (one guide → a single-guide PDF). */
export async function buildGuidesPdf(guides: HowToGuide[], loadImage: ImageLoader, opts: { title?: string } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(opts.title ?? (guides.length === 1 ? `${guides[0].title} — Polaris How-to Guide` : "Polaris How-to Guides"));
  doc.setAuthor("Polaris");
  doc.setSubject("Polaris How-to Guides");
  const f: Fonts = { reg: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const w = new Writer(doc, f, "Polaris · How-to Guides · Internal use");
  const cache = new Map<string, PDFImage>();

  if (guides.length > 1) {
    // Contents page
    w.newPage();
    w.page.drawRectangle({ x: 0, y: A4.h - 150, width: A4.w, height: 150, color: NAVY });
    w.page.drawRectangle({ x: 0, y: A4.h - 150, width: A4.w, height: 3, color: GOLD });
    w.page.drawText("POLARIS", { x: M, y: A4.h - 52, size: 12, font: f.bold, color: GOLD_LIGHT });
    w.page.drawText(clean(opts.title ?? "How-to Guides"), { x: M, y: A4.h - 92, size: 24, font: f.bold, color: rgb(1, 1, 1) });
    w.page.drawText(clean(`${guides.length} guides · step by step, with screenshots`), { x: M, y: A4.h - 118, size: 10, font: f.reg, color: GOLD_LIGHT });
    w.y = A4.h - 190;
    w.para("**Contents**", { size: 13, gap: 8 });
    guides.forEach((g, i) => {
      w.para(`**${i + 1}.  ${g.title}**`, { size: 11, gap: 0 });
      w.para(g.summary, { x: M + 18, size: 9.5, color: GREY, gap: 8 });
    });
  }

  for (const g of guides) await drawGuide(w, doc, f, g, loadImage, cache);
  return doc.save();
}

/** Browser: build and download. */
export async function downloadGuidesPdf(guides: HowToGuide[], filename: string, title?: string) {
  const bytes = await buildGuidesPdf(
    guides,
    async (src) => new Uint8Array(await (await fetch(src)).arrayBuffer()),
    { title },
  );
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
