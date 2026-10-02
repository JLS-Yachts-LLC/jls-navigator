/**
 * Fill the RYA Training Checklist PDF for a boat from its Polaris checklist.
 *
 * The RYA forms (Personal Water Craft, Powerboat, Cruising) are flat PDFs with
 * a fixed layout, shipped untouched under /forms/rya. Every checklist item in
 * orbit2_checklist_templates carries the page and PDF-point position of its
 * Check cell (pdf_page / pdf_x / pdf_y, mapped from the PDF text layer), so a
 * ticked item becomes a ✓ drawn in that cell, and the header block is filled
 * with the boat and inspection details. Runs in the browser with pdf-lib — the
 * same library the Anchor and Crew Placement forms use server-side.
 *
 * After the RYA's own pages, Polaris appends its inspection notes: every line
 * the crew remarked on or photographed, with the remark and the photo, so the
 * form carries the evidence as well as the ticks.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { resolveSignedUrl } from "@/lib/signed-url";

export type RyaFormKey = "pwc" | "powerboat" | "cruising";

export type RyaHeader = {
  rtcName: string;
  boatName: string;
  boatType: string;
  persons: string;
  inspectionDate: string;   // shown as typed, e.g. 30/09/2026
  inspectionPlace: string;
  inspectorName: string;
};

export type RyaTickItem = {
  pdf_page: number | null;
  pdf_x: number | null;
  pdf_y: number | null;
  checked: boolean;
};

/** One line of the appended notes page: what was found, said and photographed. */
export type RyaAppendixRow = {
  section: string | null;
  item: string;
  checked: boolean;
  checkedBy: string | null;
  remarks: string | null;
  /** Storage reference of the photo taken against this line (or its inventory item). */
  imageRef: string | null;
};

/**
 * Where the header values go, in PDF points, per form. Each entry is the
 * start of the value text (just right of the printed label) and the baseline y.
 * The Personal Water Craft form has no boat fields, so the boat name is added
 * to the free space on the RTC line.
 */
const HEADER: Record<RyaFormKey, Partial<Record<keyof RyaHeader, [x: number, y: number]>> & { page: number }> = {
  powerboat: { page: 1, rtcName: [118, 651], boatName: [118, 635], inspectionDate: [458, 635], boatType: [118, 619], persons: [458, 619], inspectionPlace: [126, 606], inspectorName: [462, 606] },
  pwc:       { page: 1, rtcName: [100, 670], boatName: [330, 670], inspectionDate: [122, 654], inspectorName: [130, 642] },
  cruising:  { page: 1, rtcName: [112, 674], boatName: [112, 661], inspectionDate: [392, 661], boatType: [112, 648], persons: [392, 648], inspectionPlace: [118, 636], inspectorName: [398, 636] },
};

const INK = rgb(0.05, 0.2, 0.55);
const GREY = rgb(0.4, 0.45, 0.5);
const BLACK = rgb(0.1, 0.1, 0.12);

export async function fillRyaForm(
  form: RyaFormKey, header: RyaHeader, items: RyaTickItem[],
  opts: { crossUnchecked?: boolean; appendix?: RyaAppendixRow[] } = {},
): Promise<Uint8Array> {
  const res = await fetch(`/forms/rya/${form}.pdf`);
  if (!res.ok) throw new Error(`The RYA ${form} form is not available (${res.status}).`);
  const pdf = await PDFDocument.load(await res.arrayBuffer());
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const tick = await pdf.embedFont(StandardFonts.ZapfDingbats);
  const pages = pdf.getPages();

  // Header block.
  const h = HEADER[form];
  const page = pages[h.page - 1];
  const put = (key: keyof RyaHeader, maxWidth: number) => {
    const pos = h[key];
    const value = header[key]?.trim();
    if (!pos || !value) return;
    drawFitted(page, font, key === "boatName" && form === "pwc" ? `Boat: ${value}` : value, pos[0], pos[1], maxWidth);
  };
  put("rtcName", form === "pwc" ? 220 : 230);
  put("boatName", form === "pwc" ? 240 : 230);
  put("boatType", 230);
  put("inspectionDate", 120);
  put("persons", 120);
  put("inspectionPlace", 230);
  put("inspectorName", 120);

  // Ticks — ZapfDingbats carries ✓ and ✗ (pdf-lib maps the Unicode characters). Drawn in the Check cell.
  let drawn = 0;
  for (const it of items) {
    if (it.pdf_page == null || it.pdf_x == null || it.pdf_y == null) continue;
    const p = pages[it.pdf_page - 1];
    if (!p) continue;
    if (it.checked) {
      p.drawText("✓", { x: Number(it.pdf_x), y: Number(it.pdf_y) - 1, size: 11, font: tick, color: INK });
      drawn += 1;
    } else if (opts.crossUnchecked) {
      p.drawText("✗", { x: Number(it.pdf_x) + 1, y: Number(it.pdf_y) - 1, size: 9, font: tick, color: rgb(0.7, 0.15, 0.1) });
    }
  }

  // Provenance line in the footer of the first page.
  pages[0].drawText(`Completed in Polaris — ${drawn} of ${items.length} items checked — generated ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`,
    { x: 36, y: 8, size: 7, font, color: GREY });

  if (opts.appendix?.length) await appendNotes(pdf, { font, bold, tick }, header, opts.appendix, pages[0].getSize());

  pdf.setTitle(`RYA Training Checklist — ${header.boatName}`);
  pdf.setProducer("Polaris");
  return pdf.save();
}

// ── Inspection notes & photos ────────────────────────────────────────────────

const M = 40;            // page margin
const COL_TICK = 14, COL_ITEM = 190, COL_PHOTO = 110, GAP = 10;
const PHOTO_H = 72;

async function appendNotes(
  pdf: PDFDocument, f: { font: PDFFont; bold: PDFFont; tick: PDFFont }, header: RyaHeader, rows: RyaAppendixRow[], size: { width: number; height: number },
) {
  const { width, height } = size;
  const colRemarks = width - M * 2 - COL_TICK - COL_ITEM - COL_PHOTO - GAP * 3;
  let page = newNotesPage(pdf, f, header, size, 1);
  let y = height - M - 58;
  let pageNo = 1;
  let section: string | null | undefined;

  const ensure = (needed: number) => {
    if (y - needed < M + 20) { pageNo += 1; page = newNotesPage(pdf, f, header, size, pageNo); y = height - M - 58; section = undefined; }
  };

  for (const r of rows) {
    const image = r.imageRef ? await loadImage(pdf, r.imageRef) : null;
    const itemLines = wrap(f.font, r.item, 9, COL_ITEM);
    const remarkLines = wrap(f.font, r.remarks ?? "—", 9, colRemarks);
    const textH = Math.max(itemLines.length, remarkLines.length) * 11 + 6;
    const rowH = Math.max(textH, image ? PHOTO_H + 8 : 0, 20);
    const sectionH = r.section !== section && r.section ? 18 : 0;
    ensure(rowH + sectionH);

    if (r.section !== section) {
      section = r.section;
      if (section) {
        page.drawText(section.toUpperCase(), { x: M, y: y - 10, size: 7.5, font: f.bold, color: GREY });
        y -= 18;
      }
    }

    // Row rule
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: width - M, y: y + 2 }, thickness: 0.4, color: rgb(0.85, 0.87, 0.9) });
    const top = y - 11;
    // Tick / cross
    page.drawText(r.checked ? "✓" : "✗", { x: M + 1, y: top, size: 10, font: f.tick, color: r.checked ? INK : rgb(0.7, 0.15, 0.1) });
    // Item
    itemLines.forEach((ln, i) => page.drawText(ln, { x: M + COL_TICK + GAP, y: top - i * 11, size: 9, font: f.font, color: BLACK }));
    if (r.checkedBy) {
      const yy = top - itemLines.length * 11;
      page.drawText(`Checked by ${r.checkedBy}`, { x: M + COL_TICK + GAP, y: yy, size: 7, font: f.font, color: GREY });
    }
    // Remarks
    remarkLines.forEach((ln, i) => page.drawText(ln, { x: M + COL_TICK + COL_ITEM + GAP * 2, y: top - i * 11, size: 9, font: f.font, color: r.remarks ? BLACK : GREY }));
    // Photo
    if (image) {
      const scale = Math.min(COL_PHOTO / image.width, PHOTO_H / image.height);
      const w = image.width * scale, hgt = image.height * scale;
      page.drawImage(image, { x: width - M - COL_PHOTO + (COL_PHOTO - w) / 2, y: y - 4 - hgt, width: w, height: hgt });
    }
    y -= rowH + 2;
  }
}

function newNotesPage(pdf: PDFDocument, f: { font: PDFFont; bold: PDFFont }, header: RyaHeader, size: { width: number; height: number }, n: number): PDFPage {
  const page = pdf.addPage([size.width, size.height]);
  const { width, height } = size;
  page.drawText("Inspection notes & photos", { x: M, y: height - M - 6, size: 14, font: f.bold, color: BLACK });
  page.drawText(`${header.boatName}${header.inspectionDate ? ` · ${header.inspectionDate}` : ""}${header.inspectorName ? ` · ${header.inspectorName}` : ""} · page ${n}`,
    { x: M, y: height - M - 20, size: 8.5, font: f.font, color: GREY });
  page.drawText("Lines the inspection team remarked on or photographed in Polaris. The ticks on the RYA pages are the record; this is the evidence behind them.",
    { x: M, y: height - M - 32, size: 7.5, font: f.font, color: GREY });
  // Column heads
  const yh = height - M - 48;
  page.drawText("Item", { x: M + COL_TICK + GAP, y: yh, size: 7.5, font: f.bold, color: GREY });
  page.drawText("Remarks", { x: M + COL_TICK + COL_ITEM + GAP * 2, y: yh, size: 7.5, font: f.bold, color: GREY });
  page.drawText("Photo", { x: width - M - COL_PHOTO, y: yh, size: 7.5, font: f.bold, color: GREY });
  page.drawLine({ start: { x: M, y: yh - 4 }, end: { x: width - M, y: yh - 4 }, thickness: 0.8, color: GREY });
  page.drawText("Generated by Polaris", { x: M, y: 8, size: 7, font: f.font, color: GREY });
  return page;
}

/** Fetch a stored photo and embed it; JPEG and PNG only (phones upload JPEG). Anything else is skipped quietly. */
async function loadImage(pdf: PDFDocument, stored: string): Promise<PDFImage | null> {
  try {
    const url = await resolveSignedUrl(stored);
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    return null;
  } catch {
    return null;
  }
}

/** Greedy word wrap for Helvetica at a given size. */
function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) cur = next;
    else {
      if (cur) lines.push(cur);
      // A single word wider than the column is cut rather than overflowing.
      let piece = w;
      while (font.widthOfTextAtSize(piece, size) > maxWidth && piece.length > 1) piece = piece.slice(0, -1);
      cur = piece;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/** Draw text, shrinking the size until it fits the space beside the label. */
function drawFitted(page: PDFPage, font: PDFFont, text: string, x: number, y: number, maxWidth: number) {
  let size = 10;
  while (size > 6 && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  page.drawText(text, { x, y, size, font, color: INK });
}

export const RYA_FORM_FILE: Record<RyaFormKey, string> = {
  pwc: "RYA Training Checklist — Personal Water Craft",
  powerboat: "RYA Training Checklist — Powerboat",
  cruising: "RYA Training Checklist — Cruising",
};
