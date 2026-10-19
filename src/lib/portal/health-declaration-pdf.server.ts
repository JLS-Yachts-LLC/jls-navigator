/**
 * Maritime Declaration of Health — the PDF JLS receives (and passes on to Abu
 * Dhabi Ports), laid out like the authority's own form: the Abu Dhabi Ports
 * logo, the ship and voyage particulars, ports of call, persons who joined, the
 * health questions answered YES / NO, the symptoms note, and the master's
 * declaration with signature and (if the ship has one) its stamp. Anything that
 * doesn't fit on the form — more than three joiners, the particulars for a
 * "yes" — goes on the attached schedule, as the form itself instructs.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { winAnsiSafe } from "@/lib/pdf-winansi";
import { ABU_DHABI_PORTS_LOGO_JPG } from "@/lib/portal/assets/abu-dhabi-ports-logo";
import {
  DECLARATION_TEXT, HEALTH_QUESTIONS, SYMPTOMS_NOTE,
  type HealthAnswers, type JoinedPerson, type PortOfCall,
} from "@/lib/portal/health-declaration";

export type HealthDeclarationPdfInput = {
  port_of_arrival: string | null; arrival_date: string | null;
  ship_name: string | null; imo_no: string | null; flag: string | null; master_name: string | null;
  gross_tonnage: string | null; surgeon_name: string | null;
  arriving_from: string | null; sailing_to: string | null;
  sanitation_cert_carried: string | null; sanitation_cert_issued_at: string | null; sanitation_cert_date: string | null;
  reinspection_required: string | null; visited_affected_area: string | null;
  affected_area_port: string | null; affected_area_date: string | null;
  ports_of_call: PortOfCall[]; joined_persons: JoinedPerson[];
  crew_count: number | null; passenger_count: number | null;
  answers: HealthAnswers; particulars: string | null;
  signedOn: string; reference?: string | null;
  signaturePng: Uint8Array; stamp?: Uint8Array | null;
};

const W = 595.28, H = 841.89, M = 48, BOTTOM = 60;
const INK = rgb(0.08, 0.09, 0.11), MUTED = rgb(0.4, 0.42, 0.46), RULE = rgb(0.55, 0.57, 0.6), FILL = rgb(0.05, 0.25, 0.55);

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50;
export const fmtDay = (d: string | null | undefined) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
const yn = (v: string | null | undefined) => (v === "yes" ? "YES" : v === "no" ? "NO" : "");

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of winAnsiSafe(text).split(/\r?\n/)) {
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

export async function buildHealthDeclarationPdf(d: HealthDeclarationPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Maritime Declaration of Health — ${winAnsiSafe(d.ship_name ?? "")}`);
  pdf.setAuthor("JLS Yachts Client Portal");
  const [font, bold, italic, logo] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold),
    pdf.embedFont(StandardFonts.HelveticaOblique), pdf.embedJpg(b64(ABU_DHABI_PORTS_LOGO_JPG)),
  ]);
  const signature = await pdf.embedPng(d.signaturePng);
  const stamp: PDFImage | null = d.stamp?.length ? await (isPng(d.stamp) ? pdf.embedPng(d.stamp) : pdf.embedJpg(d.stamp)) : null;

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const pages: PDFPage[] = [page];
  const newPage = () => { page = pdf.addPage([W, H]); pages.push(page); y = H - M; };
  const ensure = (h: number) => { if (y - h < BOTTOM) newPage(); };
  const text = (s: string, x: number, yy: number, size = 9, f: PDFFont = font, color = INK) =>
    page.drawText(winAnsiSafe(s), { x, y: yy, size, font: f, color });
  const para = (s: string, size = 9, f: PDFFont = font, color = INK, x = M, width = W - 2 * M, lead = 1.35) => {
    for (const line of wrap(s, f, size, width)) { ensure(size * lead); text(line, x, y - size, size, f, color); y -= size * lead; }
  };

  /** A row of "Label: value____" fields sharing the line, each with its share of the width. */
  const fields = (items: Array<[label: string, value: string | number | null | undefined, share?: number]>) => {
    ensure(22);
    const total = items.reduce((s, [, , sh]) => s + (sh ?? 1), 0);
    let x = M;
    for (const [label, value, share] of items) {
      const w = ((W - 2 * M) * (share ?? 1)) / total;
      const lw = bold.widthOfTextAtSize(winAnsiSafe(label), 8) + 4;
      text(label, x, y - 12, 8, bold, MUTED);
      let v = winAnsiSafe(value == null ? "" : String(value));
      while (v && font.widthOfTextAtSize(v, 9.5) > w - lw - 8) v = v.slice(0, -1);
      text(v, x + lw, y - 12, 9.5, font, FILL);
      page.drawLine({ start: { x: x + lw, y: y - 14.5 }, end: { x: x + w - 8, y: y - 14.5 }, thickness: 0.5, color: RULE });
      x += w;
    }
    y -= 22;
  };
  const heading = (s: string) => { ensure(30); y -= 8; text(s, M, y - 11, 11, bold); y -= 18; };
  const table = (cols: Array<[string, number]>, rows: string[][]) => {
    const total = cols.reduce((s, [, w]) => s + w, 0);
    const xs: number[] = []; let acc = M;
    for (const [, w] of cols) { xs.push(acc); acc += ((W - 2 * M) * w) / total; }
    const line = (cells: string[], f: PDFFont, color = INK) => {
      ensure(16);
      cells.forEach((c, i) => {
        const w = i + 1 < xs.length ? xs[i + 1] - xs[i] : W - M - xs[i];
        let v = winAnsiSafe(c);
        while (v && f.widthOfTextAtSize(v, 9) > w - 6) v = v.slice(0, -1);
        text(v, xs[i] + 3, y - 11, 9, f, color);
      });
      page.drawLine({ start: { x: M, y: y - 15 }, end: { x: W - M, y: y - 15 }, thickness: 0.4, color: RULE });
      y -= 16;
    };
    line(cols.map(([h]) => h), bold, MUTED);
    for (const r of rows) line(r, font, FILL);
  };

  // ── Header ──
  const lw = 150, lh = (logo.height / logo.width) * lw;
  page.drawImage(logo, { x: (W - lw) / 2, y: y - lh, width: lw, height: lh });
  y -= lh + 6;
  const title = "MARITIME DECLARATION OF HEALTH";
  text(title, (W - bold.widthOfTextAtSize(title, 15)) / 2, y - 15, 15, bold);
  y -= 24;
  const sub = "To be completed and submitted to the competent authorities by the masters of ships arriving from foreign ports.";
  text(sub, (W - italic.widthOfTextAtSize(sub, 8.5)) / 2, y - 9, 8.5, italic, MUTED);
  y -= 20;

  // ── Particulars ──
  fields([["Submitted at the port of", d.port_of_arrival, 2], ["Date", fmtDay(d.signedOn), 1]]);
  fields([["Name of ship", d.ship_name, 2], ["Registration / IMO No.", d.imo_no, 1]]);
  fields([["Arriving from", d.arriving_from], ["Sailing to", d.sailing_to], ["Nationality (flag)", d.flag]]);
  fields([["Master's name", d.master_name, 2], ["Gross tonnage", d.gross_tonnage, 1]]);
  fields([["Expected arrival", fmtDay(d.arrival_date)], ["Valid Sanitation Control Exemption / Control Certificate on board?", yn(d.sanitation_cert_carried), 2.4]]);
  fields([["Issued at", d.sanitation_cert_issued_at, 2], ["Date", fmtDay(d.sanitation_cert_date)], ["Re-inspection required?", yn(d.reinspection_required)]]);
  fields([["Has ship visited an affected area identified by the WHO?", yn(d.visited_affected_area), 2.2], ["Port", d.affected_area_port], ["Date", fmtDay(d.affected_area_date)]]);

  heading("Ports of call");
  para("List ports of call from commencement of voyage with dates of departure, or within past thirty days, whichever is shorter:", 8.5, font, MUTED);
  y -= 2;
  const ports = d.ports_of_call.filter((p) => p.port?.trim());
  if (ports.length) table([["Port", 3], ["Date of departure", 1.4]], ports.map((p) => [p.port, fmtDay(p.departed)]));
  else para("None declared.", 9, italic, MUTED);

  heading("Persons who joined");
  para("Crew members, passengers or other persons who have joined ship/vessel since international voyage began or within past thirty days, whichever is shorter, including all ports/countries visited in this period:", 8.5, font, MUTED);
  y -= 2;
  const joined = d.joined_persons.filter((p) => p.name?.trim());
  const onForm = joined.slice(0, 3), onSchedule = joined.slice(3);
  const joinedRows = (list: JoinedPerson[], from: number) =>
    list.map((p, i) => [`${from + i + 1}) ${p.name}`, p.joined_from?.[0] ?? "", p.joined_from?.[1] ?? "", p.joined_from?.[2] ?? ""]);
  const joinedCols: Array<[string, number]> = [["Name", 2.2], ["Joined from (1)", 1], ["(2)", 1], ["(3)", 1]];
  if (onForm.length) table(joinedCols, joinedRows(onForm, 0));
  else para("Nobody has joined in this period.", 9, italic, MUTED);
  if (onSchedule.length) para(`${onSchedule.length} more listed on the attached schedule.`, 8.5, italic, MUTED);
  y -= 4;
  fields([["Number of crew members on board", d.crew_count], ["Number of passengers on board", d.passenger_count]]);

  // ── Health questions ──
  heading("Health questions");
  HEALTH_QUESTIONS.forEach((q, i) => {
    const a = d.answers[q.key];
    const lines = wrap(`${i + 1}. ${q.text}`, font, 9, W - 2 * M - 70);
    const extra: string[] = [];
    if (a === "yes" && q.count) extra.push(`${q.count.label} ${d.answers[q.count.key] ?? ""}`);
    if (a === "yes" && q.where && d.answers[q.where]) extra.push(`Joined the ship at: ${d.answers[q.where]}`);
    if (a === "yes" && q.particulars) extra.push("Particulars in attached schedule.");
    const h = lines.length * 12 + extra.length * 11 + 6;
    ensure(h);
    lines.forEach((l, j) => text(l, M, y - 10 - j * 12, 9));
    // YES / NO box
    const bx = W - M - 54;
    page.drawRectangle({ x: bx, y: y - 15, width: 54, height: 15, borderColor: RULE, borderWidth: 0.6, color: a === "yes" ? rgb(1, 0.93, 0.85) : undefined });
    const label = yn(typeof a === "string" ? a : null) || "—";
    text(label, bx + (54 - bold.widthOfTextAtSize(label, 9)) / 2, y - 11.5, 9, bold, a === "yes" ? rgb(0.7, 0.25, 0) : FILL);
    extra.forEach((e, j) => text(e, M + 14, y - 10 - lines.length * 12 - j * 11, 8.5, italic, FILL));
    y -= h;
  });

  y -= 4;
  para(`Note: ${SYMPTOMS_NOTE}`, 7.5, italic, MUTED);

  // ── Declaration & signature ──
  ensure(150);
  y -= 8;
  para(DECLARATION_TEXT, 9, bold);
  y -= 8;
  const sigTop = y;
  const sw = 170, sh = (signature.height / signature.width) * sw;
  page.drawImage(signature, { x: M, y: sigTop - sh, width: sw, height: sh });
  page.drawLine({ start: { x: M, y: sigTop - sh - 2 }, end: { x: M + 200, y: sigTop - sh - 2 }, thickness: 0.6, color: RULE });
  text("Sign", M, sigTop - sh - 13, 8, bold, MUTED);
  text(`Master: ${d.master_name ?? ""}`, M, sigTop - sh - 26, 9.5, font, FILL);
  text(`Date: ${fmtDay(d.signedOn)}`, M, sigTop - sh - 39, 9.5, font, FILL);
  const stx = M + 260;
  if (stamp) {
    const box = 92, k = Math.min(box / stamp.width, box / stamp.height);
    page.drawImage(stamp, { x: stx + (box - stamp.width * k) / 2, y: sigTop - box + (box - stamp.height * k) / 2, width: stamp.width * k, height: stamp.height * k });
  } else {
    text("No ship stamp provided", stx, sigTop - 46, 8.5, italic, MUTED);
  }
  page.drawLine({ start: { x: stx, y: sigTop - 96 }, end: { x: W - M, y: sigTop - 96 }, thickness: 0.6, color: RULE });
  text("Ship stamp", stx, sigTop - 107, 8, bold, MUTED);
  y = Math.min(sigTop - sh - 48, sigTop - 116);
  fields([["Counter sign, Ship's Surgeon (if carried)", d.surgeon_name, 2], ["Date", d.surgeon_name ? fmtDay(d.signedOn) : ""]]);

  // ── Schedule ──
  if (onSchedule.length || d.particulars?.trim()) {
    newPage();
    text("SCHEDULE TO THE DECLARATION OF HEALTH", M, y - 14, 13, bold);
    y -= 22;
    text(`${winAnsiSafe(d.ship_name ?? "")} · ${fmtDay(d.signedOn)}`, M, y - 9, 9, font, MUTED);
    y -= 18;
    if (onSchedule.length) {
      heading("Further persons who joined");
      table(joinedCols, joinedRows(onSchedule, 3));
    }
    if (d.particulars?.trim()) {
      heading("Particulars of every case of illness or death, and of treatment or advice given");
      para(d.particulars, 9.5, font, FILL);
    }
  }

  // ── Footer on every page ──
  pages.forEach((p, i) => {
    const foot = winAnsiSafe(`Completed and signed by the master in the JLS Yachts Client Portal${d.reference ? ` · ${d.reference}` : ""} · Page ${i + 1} of ${pages.length}`);
    p.drawText(foot, { x: (W - font.widthOfTextAtSize(foot, 7)) / 2, y: 30, size: 7, font, color: MUTED });
  });

  return pdf.save();
}
