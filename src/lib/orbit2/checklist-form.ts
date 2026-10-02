/**
 * Fill a checklist form PDF for a boat from its Polaris ticks.
 *
 * A checklist form (orbit2_checklist_forms) is the issuing body's own PDF —
 * shipped with the app (the RYA forms under /forms/rya) or uploaded through
 * the checklist library — plus where things are written on it: each header
 * field (boat name, date, inspector…) and each item's Check cell, in PDF
 * points. A ticked item becomes a ✓ in its cell; the header is filled from
 * the generate dialog. Runs in the browser with pdf-lib.
 *
 * After the form's own pages Polaris can append its inspection notes: every
 * line the crew remarked on or photographed, with the remark and the photo,
 * so the form carries the evidence as well as the ticks.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { resolveSignedUrl } from "@/lib/signed-url";

/** Where one header value is written on the form. */
export type FormHeaderField = {
  /** One of HEADER_FIELD_KEYS, or "custom" for a field typed in when generating. */
  key: string;
  label: string;
  page: number;
  x: number;
  y: number;
  maxWidth?: number;
  /** Printed before the value — the PW form has no boat box, so its boat name reads "Boat: …". */
  prefix?: string;
};

export type ChecklistFormDef = {
  id: string;
  name: string;
  code: string | null;
  regime: "dma" | "fma" | "rya" | null;
  category: string | null;
  pdf_ref: string | null;
  page_count: number | null;
  header_fields: FormHeaderField[];
  active: boolean;
};

/** The header values Polaris can fill in itself, in the order the generate dialog shows them. */
export const HEADER_FIELD_KEYS: { key: string; label: string }[] = [
  { key: "boatName", label: "Name of boat" },
  { key: "inspectionDate", label: "Inspection date" },
  { key: "inspectorName", label: "Inspector's name" },
  { key: "boatType", label: "Boat type" },
  { key: "persons", label: "No. of persons" },
  { key: "inspectionPlace", label: "Inspection place" },
  { key: "rtcName", label: "Centre / company name" },
  { key: "custom", label: "Other (typed when generating)" },
];

export type TickItem = { pdf_page: number | null; pdf_x: number | null; pdf_y: number | null; checked: boolean };

/** One line of the appended notes page: what was found, said and photographed. */
export type AppendixRow = {
  section: string | null;
  item: string;
  checked: boolean;
  checkedBy: string | null;
  remarks: string | null;
  /** Storage reference of the photo taken against this line (or its inventory item). */
  imageRef: string | null;
};

const INK = rgb(0.05, 0.2, 0.55);
const GREY = rgb(0.4, 0.45, 0.5);
const BLACK = rgb(0.1, 0.1, 0.12);

/** The form's PDF bytes — a shipped file by path, an uploaded one through a signed URL. */
export async function loadFormPdf(pdfRef: string): Promise<ArrayBuffer> {
  const url = pdfRef.startsWith("/") ? pdfRef : await resolveSignedUrl(pdfRef);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The checklist form could not be loaded (${res.status}).`);
  return res.arrayBuffer();
}

/**
 * The filled form. `values` is keyed by header field key, or by the field's
 * label for "custom" fields.
 */
export async function fillChecklistForm(
  form: Pick<ChecklistFormDef, "pdf_ref" | "header_fields" | "name">, values: Record<string, string>, items: TickItem[],
  opts: {
    crossUnchecked?: boolean; appendix?: AppendixRow[]; boatName?: string; inspectionDate?: string; inspectorName?: string;
    /** The PDF itself, for a form that is not saved yet (the import screen's Test fill). */
    pdfBytes?: ArrayBuffer;
  } = {},
): Promise<Uint8Array> {
  if (!opts.pdfBytes && !form.pdf_ref) throw new Error("This checklist has no form PDF.");
  const pdf = await PDFDocument.load(opts.pdfBytes ? opts.pdfBytes.slice(0) : await loadFormPdf(form.pdf_ref!));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const tick = await pdf.embedFont(StandardFonts.ZapfDingbats);
  const pages = pdf.getPages();

  for (const f of form.header_fields ?? []) {
    const value = (f.key === "custom" ? values[`custom:${f.label}`] : values[f.key])?.trim();
    const page = pages[f.page - 1];
    if (!value || !page) continue;
    drawFitted(page, font, `${f.prefix ?? ""}${value}`, f.x, f.y, f.maxWidth ?? 200);
  }

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

  if (opts.appendix?.length) {
    await appendNotes(pdf, { font, bold, tick }, {
      boatName: opts.boatName ?? values.boatName ?? "", inspectionDate: opts.inspectionDate ?? values.inspectionDate ?? "",
      inspectorName: opts.inspectorName ?? values.inspectorName ?? "",
    }, opts.appendix, pages[0].getSize());
  }

  pdf.setTitle(`${form.name}${values.boatName ? ` — ${values.boatName}` : ""}`);
  pdf.setProducer("Polaris");
  return pdf.save();
}

// ── Inspection notes & photos ────────────────────────────────────────────────

const M = 40;            // page margin
const COL_TICK = 14, COL_ITEM = 190, COL_PHOTO = 110, GAP = 10;
const PHOTO_H = 72;
type NotesHeader = { boatName: string; inspectionDate: string; inspectorName: string };

async function appendNotes(
  pdf: PDFDocument, f: { font: PDFFont; bold: PDFFont; tick: PDFFont }, header: NotesHeader, rows: AppendixRow[], size: { width: number; height: number },
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

    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: width - M, y: y + 2 }, thickness: 0.4, color: rgb(0.85, 0.87, 0.9) });
    const top = y - 11;
    page.drawText(r.checked ? "✓" : "✗", { x: M + 1, y: top, size: 10, font: f.tick, color: r.checked ? INK : rgb(0.7, 0.15, 0.1) });
    itemLines.forEach((ln, i) => page.drawText(ln, { x: M + COL_TICK + GAP, y: top - i * 11, size: 9, font: f.font, color: BLACK }));
    if (r.checkedBy) {
      page.drawText(`Checked by ${r.checkedBy}`, { x: M + COL_TICK + GAP, y: top - itemLines.length * 11, size: 7, font: f.font, color: GREY });
    }
    remarkLines.forEach((ln, i) => page.drawText(ln, { x: M + COL_TICK + COL_ITEM + GAP * 2, y: top - i * 11, size: 9, font: f.font, color: r.remarks ? BLACK : GREY }));
    if (image) {
      const scale = Math.min(COL_PHOTO / image.width, PHOTO_H / image.height);
      const w = image.width * scale, hgt = image.height * scale;
      page.drawImage(image, { x: width - M - COL_PHOTO + (COL_PHOTO - w) / 2, y: y - 4 - hgt, width: w, height: hgt });
    }
    y -= rowH + 2;
  }
}

function newNotesPage(pdf: PDFDocument, f: { font: PDFFont; bold: PDFFont }, header: NotesHeader, size: { width: number; height: number }, n: number): PDFPage {
  const page = pdf.addPage([size.width, size.height]);
  const { width, height } = size;
  page.drawText("Inspection notes & photos", { x: M, y: height - M - 6, size: 14, font: f.bold, color: BLACK });
  page.drawText(`${header.boatName}${header.inspectionDate ? ` · ${header.inspectionDate}` : ""}${header.inspectorName ? ` · ${header.inspectorName}` : ""} · page ${n}`,
    { x: M, y: height - M - 20, size: 8.5, font: f.font, color: GREY });
  page.drawText("Lines the inspection team remarked on or photographed in Polaris. The ticks on the form pages are the record; this is the evidence behind them.",
    { x: M, y: height - M - 32, size: 7.5, font: f.font, color: GREY });
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
