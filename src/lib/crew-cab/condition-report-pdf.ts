/**
 * Filing-ready PDF of a completed Vehicle Condition Report, laid out like the
 * paper JLS template: vehicle particulars, the damage key, damage recorded on
 * the 3D model, the Service Needed checklist, comments and the driver's
 * signature. Generated in the browser with pdf-lib and downloaded directly.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const INK = rgb(0.12, 0.15, 0.19);
const MUTED = rgb(0.42, 0.47, 0.53);
const LINE = rgb(0.8, 0.84, 0.88);

export type ConditionReportPdfInput = {
  vehicle: { make: string; model: string; registration: string | null; color: string | null; mileage: number | null; chassis_no: string | null };
  report: {
    driver_name: string; mileage: number | null; date_in: string; date_out: string | null;
    next_service: string | null; services: string[]; comments: string | null; signature: string | null;
  };
  damage: Array<{ panelLabel: string; code: string; kindLabel: string; severity: string; note: string | null }>;
  serviceChecklist: string[];
  damageKey: Array<{ code: string; label: string }>;
};

export async function buildConditionReportPdf(input: ConditionReportPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595, M = 46;
  let y = 842 - 52;

  const text = (t: string, x: number, size = 9.5, f = font, color = INK) =>
    page.drawText(t, { x, y, size, font: f, color });
  const hr = (dy = 10) => { y -= dy; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: LINE }); y -= 14; };
  const fmtD = (d: string | null) => (d ? new Date(d.length === 10 ? d + "T00:00" : d).toLocaleDateString("en-GB") : "—");

  // Header
  text("JLS YACHTS", M, 16, bold);
  text("Vehicle Condition Report", M, 10.5, font, MUTED); // subtitle sits under via manual y shift
  page.drawText("Vehicle Condition Report", { x: W - M - bold.widthOfTextAtSize("Vehicle Condition Report", 13), y, size: 13, font: bold, color: INK });
  y -= 8; hr(6);

  // Vehicle particulars, two columns
  const v = input.vehicle, r = input.report;
  const rows: Array<[string, string, string, string]> = [
    ["Make:", v.make, "Reg No.:", v.registration ?? "—"],
    ["Model:", v.model, "Mileage:", r.mileage != null ? `${r.mileage.toLocaleString()} km` : "—"],
    ["Colour:", v.color ?? "—", "Chassis:", v.chassis_no ?? "—"],
    ["Date In:", fmtD(r.date_in), "Date Out:", fmtD(r.date_out)],
    ["Next Service Due:", r.next_service ?? "—", "Driver:", r.driver_name],
  ];
  for (const [l1, v1, l2, v2] of rows) {
    text(l1, M, 9.5, bold); text(v1, M + 92);
    text(l2, W / 2 + 10, 9.5, bold); text(v2, W / 2 + 96);
    y -= 16;
  }
  hr();

  // Damage
  text("Damage Recorded", M, 11, bold); y -= 15;
  if (input.damage.length === 0) {
    text("No damage recorded during this check.", M, 9.5, font, MUTED); y -= 14;
  } else {
    for (const d of input.damage.slice(0, 18)) {
      text(`[${d.code}]`, M, 9.5, bold);
      text(`${d.panelLabel} — ${d.kindLabel}, ${d.severity}${d.note ? `. ${d.note.slice(0, 90)}` : ""}`, M + 34);
      y -= 14;
    }
    if (input.damage.length > 18) { text(`… and ${input.damage.length - 18} more`, M, 9, font, MUTED); y -= 14; }
  }
  y -= 2;
  text("Key:  " + input.damageKey.map(k => `${k.code} ${k.label}`).join("   "), M, 7.8, font, MUTED);
  y -= 10; hr();

  // Service checklist, two columns with ballot boxes
  text("Service Needed", M, 11, bold); y -= 16;
  const startY = y;
  const colX = [M, W / 2 + 10];
  input.serviceChecklist.forEach((sv, i) => {
    const col = i < Math.ceil(input.serviceChecklist.length / 2) ? 0 : 1;
    const rowY = startY - (col === 0 ? i : i - Math.ceil(input.serviceChecklist.length / 2)) * 15;
    const ticked = r.services.includes(sv);
    page.drawRectangle({ x: colX[col], y: rowY - 1.5, width: 9, height: 9, borderColor: INK, borderWidth: 0.8 });
    if (ticked) page.drawText("X", { x: colX[col] + 1.7, y: rowY - 0.5, size: 8, font: bold, color: INK });
    page.drawText(sv, { x: colX[col] + 15, y: rowY, size: 9, font, color: ticked ? INK : MUTED });
  });
  y = startY - Math.ceil(input.serviceChecklist.length / 2) * 15 - 4;
  hr();

  // Comments
  text("Comments", M, 11, bold); y -= 15;
  const comment = (r.comments ?? "—").slice(0, 600);
  for (const line of wrap(comment, 100)) { text(line, M, 9.5); y -= 13; }
  y -= 4; hr();

  // Signature
  text("Driver's Signature", M, 11, bold); y -= 6;
  if (r.signature?.startsWith("data:image/png")) {
    try {
      const png = await doc.embedPng(r.signature);
      const dims = png.scale(120 / png.height > 1 ? 1 : 120 / png.height);
      const h = Math.min(60, dims.height), w = h * (png.width / png.height);
      y -= h + 4;
      page.drawImage(png, { x: M, y, width: w, height: h });
    } catch { y -= 24; text("(signature could not be embedded)", M, 9, font, MUTED); }
  } else { y -= 24; text("(not signed)", M, 9, font, MUTED); }
  page.drawText(`Generated by Polaris · ${new Date().toLocaleString("en-GB")}`, { x: M, y: 30, size: 7.5, font, color: MUTED });

  return doc.save();
}

function wrap(s: string, width: number): string[] {
  const out: string[] = [];
  for (const para of s.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      if ((line + " " + word).trim().length > width) { out.push(line.trim()); line = word; }
      else line = (line + " " + word).trim();
    }
    out.push(line);
  }
  return out.filter(Boolean).slice(0, 8);
}
