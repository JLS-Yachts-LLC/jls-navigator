/**
 * The Bunkering Request form sent to the client (Bunkering Request spec,
 * section 1.4: "pre-filled PDF form" + "vessel manifold layout diagram").
 *
 * The PDF version of the Operations team's "Client Received" sheet (Boat.xlsm).
 * That sheet places an X with an Excel macro, which can't be emailed to a client.
 * In the PDF:
 *
 *   - everything Polaris already knows is printed, pre-filled
 *   - Max. Sulfur, Specs, Description, Remarks and the confirmation are form
 *     fields the client types into
 *   - the deck plan is covered by an invisible grid of tick boxes drawn as an
 *     X, so clicking on the plan places an X there (clicking again removes it)
 *     in Acrobat, Edge, Chrome or Preview. A printed copy can be marked by hand.
 *
 * The client saves it and replies with it attached; the team uploads it to the
 * record's "Filled form from PDF" slot. Field names are stable so a returned
 * form can be read back automatically later.
 */
import {
  PDFDocument, rgb, LineCapStyle,
  pushGraphicsState, popGraphicsState, setLineWidth, setStrokingRgbColor, setLineCap, moveTo, lineTo, stroke,
  type PDFFont, type PDFPage, type PDFForm,
} from "pdf-lib";
import { embedJlsBrand, drawJlsHeader, drawJlsFooter, JLS_MARGIN, JLS_PDF_COLORS } from "@/lib/brand/jls-letterhead.server";
import { winAnsiSafe } from "@/lib/pdf-winansi";
import { fmtDMY } from "@/lib/format-date";
import { BUNKER_DIAGRAM_PNG, BUNKER_DIAGRAM_SIZE } from "./bunker-diagram";

/** The orbit2_projects columns the form prints. */
export type BunkerRequestRecord = {
  task_id: string;
  client_name: string | null;
  requestor_name: string | null;
  imo_no: string | null;
  flag: string | null;
  official_no: string | null;
  loa_m: number | null;
  draught_m: number | null;
  berth_no: string | null;
  delivery_port: string | null;
  delivery_port_other: string | null;
  location: string | null;
  schedule_date: string | null;
  schedule_time: string | null;
  camlock_type: string | null;
  camlock_size_in: number | null;
  hose_length_m: number | null;
  manifold_position: string | null;
  product_grade: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  max_sulphur: string | null;
  specification: string | null;
  description: string | null;
};

/** Names of the fields the client fills in — kept stable for reading a returned form. */
export const BUNKER_FORM_FIELDS = {
  maxSulphur: "max_sulphur",
  specification: "specification",
  description: "description",
  remarks: "remarks",
  confirmedBy: "confirmed_by",
  confirmedDate: "confirmed_date",
  /** One tick box per grid cell over the deck plan: manifold_r{row}_c{col}. */
  manifoldPrefix: "manifold_",
} as const;

export function bunkerRequestFileName(r: Pick<BunkerRequestRecord, "task_id">): string {
  return `${r.task_id} Bunkering Request.pdf`;
}

const INK = JLS_PDF_COLORS.ink;
const MUTED = JLS_PDF_COLORS.muted;
const NAVY = JLS_PDF_COLORS.navy;
const LINE = rgb(0.72, 0.75, 0.8);
const SHADE = rgb(0.94, 0.95, 0.97);
const MARK = rgb(0.85, 0.1, 0.1);

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const t = (v: string | number | null | undefined) => winAnsiSafe(v == null || v === "" ? "" : String(v));
const unit = (u: string | null) => (u === "M3" ? "M³" : u ?? "");

function port(r: BunkerRequestRecord): string {
  if (r.delivery_port === "Others") return r.delivery_port_other || "Others";
  return r.delivery_port || r.location || "";
}

function supply(r: BunkerRequestRecord): string {
  if (!r.schedule_date) return "";
  const day = new Date(`${r.schedule_date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  return `${fmtDMY(r.schedule_date)} (${day})${r.schedule_time ? `  ${r.schedule_time.slice(0, 5)} hrs` : ""}`;
}

/** Shrinks text to fit a cell rather than letting it run over the next one. */
function fit(text: string, font: PDFFont, size: number, maxW: number): string {
  let s = text;
  while (s.length > 1 && font.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -1);
  return s === text ? s : `${s.slice(0, -1)}…`;
}

type Ctx = { page: PDFPage; font: PDFFont; bold: PDFFont; form: PDFForm; x: number; w: number };

function sectionTitle(c: Ctx, y: number, title: string): number {
  c.page.drawRectangle({ x: c.x, y: y - 16, width: c.w, height: 16, color: NAVY });
  c.page.drawText(title.toUpperCase(), { x: c.x + 6, y: y - 11.5, size: 8.5, font: c.bold, color: rgb(1, 1, 1) });
  return y - 16;
}

/** Label/value pairs, two per row, as the sheet lays them out. */
function pairs(c: Ctx, y: number, rows: [string, string][]): number {
  const rowH = 17, labelW = 92, colW = c.w / 2;
  for (let i = 0; i < rows.length; i += 2) {
    for (let k = 0; k < 2; k++) {
      const cell = rows[i + k];
      if (!cell) continue;
      const cx = c.x + k * colW;
      c.page.drawRectangle({ x: cx, y: y - rowH, width: labelW, height: rowH, color: SHADE, borderColor: LINE, borderWidth: 0.5 });
      c.page.drawRectangle({ x: cx + labelW, y: y - rowH, width: colW - labelW, height: rowH, borderColor: LINE, borderWidth: 0.5 });
      c.page.drawText(cell[0], { x: cx + 5, y: y - 11.5, size: 8, font: c.bold, color: INK });
      c.page.drawText(fit(t(cell[1]), c.font, 9, colW - labelW - 10), { x: cx + labelW + 5, y: y - 11.8, size: 9, font: c.font, color: INK });
    }
    y -= rowH;
  }
  return y;
}

/** A labelled box the client types into, pre-filled with what Polaris holds. */
function input(c: Ctx, y: number, label: string, name: string, value: string | null, h = 17, multiline = false): number {
  const labelW = 92;
  c.page.drawRectangle({ x: c.x, y: y - h, width: labelW, height: h, color: SHADE, borderColor: LINE, borderWidth: 0.5 });
  c.page.drawText(label, { x: c.x + 5, y: y - 11.5, size: 8, font: c.bold, color: INK });
  const f = c.form.createTextField(name);
  if (multiline) f.enableMultiline();
  if (value) f.setText(t(value));
  f.addToPage(c.page, {
    x: c.x + labelW, y: y - h, width: c.w - labelW, height: h,
    font: c.font, borderColor: LINE, borderWidth: 0.5, backgroundColor: rgb(0.98, 0.99, 1),
  });
  f.setFontSize(9);
  return y - h;
}

/**
 * The deck plan with its X grid. Each cell is a tick box whose "on" look is a
 * red X and whose "off" look is nothing, so the plan reads cleanly until marked.
 */
function manifoldDiagram(c: Ctx, y: number, plan: Awaited<ReturnType<PDFDocument["embedPng"]>>): number {
  const pad = 26;
  const w = c.w - pad * 2;
  const h = (BUNKER_DIAGRAM_SIZE.height / BUNKER_DIAGRAM_SIZE.width) * w;
  const top = y - 18;
  const boxH = h + 18 + 22;

  c.page.drawRectangle({ x: c.x, y: y - boxH, width: c.w, height: boxH, borderColor: LINE, borderWidth: 0.5 });
  const label = (s: string, x: number, ly: number) => c.page.drawText(s, { x, y: ly, size: 7.5, font: c.bold, color: MUTED });
  label("PORT", c.x + c.w / 2 - c.bold.widthOfTextAtSize("PORT", 7.5) / 2, top + 5);
  label("STARBOARD", c.x + c.w / 2 - c.bold.widthOfTextAtSize("STARBOARD", 7.5) / 2, top - h - 12);
  label("AFT", c.x + 5, top - h / 2 - 3);
  label("FWD", c.x + c.w - 5 - c.bold.widthOfTextAtSize("FWD", 7.5), top - h / 2 - 3);

  const px = c.x + pad;
  const py = top - h;
  c.page.drawImage(plan, { x: px, y: py, width: w, height: h });

  const cell = 13;
  const cols = Math.floor(w / cell);
  const rows = Math.floor(h / cell);
  const ox = px + (w - cols * cell) / 2;
  const oy = py + (h - rows * cell) / 2;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const box = c.form.createCheckBox(`${BUNKER_FORM_FIELDS.manifoldPrefix}r${r + 1}_c${col + 1}`);
      box.addToPage(c.page, { x: ox + col * cell, y: oy + r * cell, width: cell, height: cell, borderWidth: 0 });
      box.updateAppearances((_field, widget) => {
        const { width: bw, height: bh } = widget.getRectangle();
        const i = 2;
        return {
          normal: {
            on: [
              pushGraphicsState(), setStrokingRgbColor(MARK.red, MARK.green, MARK.blue), setLineWidth(2.2),
              setLineCap(LineCapStyle.Round),
              moveTo(i, i), lineTo(bw - i, bh - i), moveTo(i, bh - i), lineTo(bw - i, i), stroke(),
              popGraphicsState(),
            ],
            off: [],
          },
        };
      });
    }
  }
  return y - boxH;
}

export async function buildBunkerRequestPdf(r: BunkerRequestRecord): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${r.task_id} — Bunkering Request`);
  pdf.setSubject(`Bunkering request for ${r.client_name ?? "the vessel"}`);
  pdf.setCreator("Polaris");

  const brand = await embedJlsBrand(pdf);
  const plan = await pdf.embedPng(b64(BUNKER_DIAGRAM_PNG));
  const page = pdf.addPage([595.28, 841.89]);
  const form = pdf.getForm();
  const M = JLS_MARGIN;
  const c: Ctx = { page, font: brand.font, bold: brand.bold, form, x: M, w: page.getWidth() - 2 * M };

  let y = drawJlsHeader(page, brand, {
    control: [
      ["Document", "Bunkering Request"],
      ["Task ID", r.task_id],
      ["Issued", fmtDMY(new Date().toISOString())],
    ],
  });

  page.drawText("BUNKERING REQUEST", { x: M, y: y + 4, size: 15, font: brand.bold, color: NAVY });
  y -= 8;
  const intro = "Please check the details below, complete the highlighted boxes, mark an X on the diagram where your bunker manifold is, then save this form and reply to our email with it attached.";
  for (const line of wrapLines(intro, brand.font, 8.5, c.w)) {
    page.drawText(line, { x: M, y, size: 8.5, font: brand.font, color: MUTED });
    y -= 11;
  }
  y -= 6;

  y = sectionTitle(c, y, "Receiving vessel's particulars");
  y = pairs(c, y, [
    ["Vessel Name", r.client_name ?? ""], ["Flag", r.flag ?? ""],
    ["IMO No.", r.imo_no ?? ""], ["LOA (m)", r.loa_m != null ? String(r.loa_m) : ""],
    ["Official No.", r.official_no ?? ""], ["Draft (m)", r.draught_m != null ? String(r.draught_m) : ""],
    ["Delivery Port", port(r)], ["Berth No.", r.berth_no ?? ""],
    ["Supply Date / Time", supply(r)], ["Requestor", r.requestor_name ?? ""],
  ]);
  y -= 10;

  y = sectionTitle(c, y, "Connection & manifold");
  y = pairs(c, y, [
    ["Camlock Type", r.camlock_type ?? ""], ["Camlock Size (in)", r.camlock_size_in != null ? `${r.camlock_size_in}"` : ""],
    ["Hose Length (m)", r.hose_length_m != null ? String(r.hose_length_m) : ""], ["Location", r.manifold_position ?? "FWD / MID / AFT"],
  ]);
  y -= 10;

  y = sectionTitle(c, y, "Bunker fuel requirement");
  y = pairs(c, y, [
    ["Fuel Grade", r.product_grade ?? ""],
    ["Quantity", r.quantity != null ? `${r.quantity} ${unit(r.quantity_unit)}`.trim() : ""],
  ]);
  y = input(c, y, "Max. Sulfur Cont.", BUNKER_FORM_FIELDS.maxSulphur, r.max_sulphur);
  y = input(c, y, "Specs.", BUNKER_FORM_FIELDS.specification, r.specification, 28, true);
  y = input(c, y, "Description", BUNKER_FORM_FIELDS.description, r.description, 28, true);
  y -= 10;

  y = sectionTitle(c, y, "Bunker manifold location");
  page.drawText("Click on the diagram where the manifold is and an X appears (click it again to remove). Printed copies can be marked by hand.",
    { x: M, y: y - 11, size: 7.5, font: brand.font, color: MUTED });
  y = manifoldDiagram(c, y - 16, plan);
  y -= 10;

  y = sectionTitle(c, y, "Remarks & confirmation");
  y = input(c, y, "Remarks", BUNKER_FORM_FIELDS.remarks, null, 26, true);
  const half = c.w / 2;
  const left: Ctx = { ...c, w: half };
  const right: Ctx = { ...c, x: M + half, w: half };
  input(left, y, "Confirmed by", BUNKER_FORM_FIELDS.confirmedBy, null);
  y = input(right, y, "Date", BUNKER_FORM_FIELDS.confirmedDate, null);

  drawJlsFooter(page, brand, { docNo: r.task_id });
  return pdf.save();
}

function wrapLines(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of winAnsiSafe(text).split(" ")) {
    const trial = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxW) line = trial;
    else { if (line) out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}
