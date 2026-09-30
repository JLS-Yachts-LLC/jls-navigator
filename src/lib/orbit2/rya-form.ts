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
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

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

export async function fillRyaForm(form: RyaFormKey, header: RyaHeader, items: RyaTickItem[], opts: { crossUnchecked?: boolean } = {}): Promise<Uint8Array> {
  const res = await fetch(`/forms/rya/${form}.pdf`);
  if (!res.ok) throw new Error(`The RYA ${form} form is not available (${res.status}).`);
  const pdf = await PDFDocument.load(await res.arrayBuffer());
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const tick = await pdf.embedFont(StandardFonts.ZapfDingbats);
  const pages = pages1(pdf);

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
  const first = pages[0];
  first.drawText(`Completed in Polaris — ${drawn} of ${items.length} items checked — generated ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`,
    { x: 36, y: 8, size: 7, font, color: rgb(0.4, 0.45, 0.5) });

  pdf.setTitle(`RYA Training Checklist — ${header.boatName}`);
  pdf.setProducer("Polaris");
  return pdf.save();
}

function pages1(pdf: PDFDocument): PDFPage[] { return pdf.getPages(); }

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
