// Printable / fillable PDFs for the cyber courses. Each page is drawn as SVG in PDF
// points (A4 = 595 × 842), rasterised at 3× with sharp and laid full-page, then real
// form fields (pdf-lib AcroForm) go on top where a vessel writes its own details —
// so a vessel types its contacts once in any PDF reader and prints.
import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { C, txt, para, rect, circle, line, g, icon } from "./art.mjs";

const A4 = [595, 842], A4L = [842, 595];
const SCALE = 3;
const pageSvg = ([w, h], body, bg = "#ffffff") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w * SCALE}" height="${h * SCALE}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${body}</svg>`;
const INK = C.ink, MUTED = "#5b6476", NAVY = "#0d1f45", GOLD = "#b8891a", RULE = "#c9d1de";

/** Build a PDF: pages = [{ size, svg, fields: [{ name, x, top, w, h, multiline?, size?, check? }] }]. */
async function build(title, pages) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title); pdf.setAuthor("JLS Yachts — Crew Academy"); pdf.setCreator("Crew Academy");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const form = pdf.getForm();
  const made = new Map();
  for (const p of pages) {
    const [w, h] = p.size;
    const png = await sharp(Buffer.from(pageSvg(p.size, p.svg, p.bg))).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
    const img = await pdf.embedPng(png);
    const page = pdf.addPage([w, h]);
    page.drawImage(img, { x: 0, y: 0, width: w, height: h });
    for (const f of p.fields ?? []) {
      const box = { x: f.x, y: h - f.top - f.h, width: f.w, height: f.h, borderWidth: 0, backgroundColor: rgb(0.96, 0.97, 1) };
      if (f.check) {
        const cb = made.get(f.name) ?? form.createCheckBox(f.name);
        made.set(f.name, cb);
        cb.addToPage(page, { ...box, borderWidth: 1, borderColor: rgb(0.5, 0.55, 0.65), backgroundColor: rgb(1, 1, 1) });
        continue;
      }
      let tf = made.get(f.name);
      if (!tf) {
        tf = form.createTextField(f.name);
        if (f.multiline) tf.enableMultiline();
        made.set(f.name, tf);
      }
      tf.addToPage(page, { ...box, font });
      tf.setFontSize(f.size ?? 0); // 0 = auto-size
    }
  }
  form.updateFieldAppearances(font);
  return Buffer.from(await pdf.save());
}

const header = (w, kicker, title, sub) =>
  rect(0, 0, w, 92, 0, NAVY) + txt(36, 36, kicker.toUpperCase(), { size: 9, weight: 700, fill: "#d4a62a", spacing: 2 }) +
  txt(36, 68, title, { size: 24, family: "Georgia, serif", fill: "#ffffff" }) + (sub ? txt(w - 36, 68, sub, { size: 9, fill: "#c7d0e4", anchor: "end" }) : "");
const footer = ([w, h], s = "Crew Academy · JLS Yachts · Cyber security at sea") => txt(w / 2, h - 18, s, { size: 7.5, fill: MUTED, anchor: "middle" });
const labelBox = (x, y, w, h, label) => txt(x, y - 4, label, { size: 7.5, weight: 700, fill: MUTED, spacing: 0.5 }) + rect(x, y, w, h, 3, "none", RULE, 0.8);

// ── 1. Crew mess poster ─────────────────────────────────────────────────────
async function poster() {
  const [w, h] = A4;
  let s = rect(0, 0, w, h, 0, NAVY);
  s += g(w / 2 - 34, 34, 0.68, icon.shield());
  s += txt(w / 2, 128, "CYBER SAFETY ON BOARD", { size: 11, weight: 700, fill: "#d4a62a", anchor: "middle", spacing: 3 });
  s += txt(w / 2, 162, "Six habits that keep the ship safe", { size: 24, family: "Georgia, serif", fill: "#ffffff", anchor: "middle" });
  const habits = [
    [icon.envelope(), "Pause before you click", "Unexpected, urgent or secret? Check it another way."],
    [icon.key(), "Strong, private passwords", "Three random words. One per account. MFA on. Never share."],
    [icon.usb(), "No unknown USBs", "Nothing plugged into bridge or engine equipment — not even to charge."],
    [icon.shield(C.green, "#fff"), "Update when asked", "Don't keep pressing \"later\"."],
    [icon.phone(), "Share less online", "No positions, guests, itineraries, passes or screens."],
    [icon.warn(), "Report it fast", "Mistakes happen. Silence is what does the damage."],
  ];
  habits.forEach(([ic, t, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 30 + col * 272, y = 190 + row * 104;
    s += rect(x, y, 262, 92, 10, "#13295a", "#2c4a86", 1);
    s += circle(x + 40, y + 46, 28, "#081632") + g(x + 20, y + 26, 0.4, ic);
    s += txt(x + 78, y + 34, t, { size: 12.5, weight: 700, fill: "#ffffff" });
    s += para(x + 78, y + 54, d, { size: 9.5, width: 34, fill: "#c7d0e4", lh: 1.35 });
  });
  // report block (white, with fillable boxes)
  const ry = 516;
  s += rect(30, ry, w - 60, 280, 12, "#ffffff");
  s += txt(50, ry + 34, "Something wrong? Report it now — no blame.", { size: 16, weight: 700, fill: INK });
  s += txt(50, ry + 54, "Stop · don't switch it off · tell someone straight away · say what you clicked, when and on which device.", { size: 9, fill: MUTED });
  const rows = ["Officer of the Watch / your HoD", "ETO / IT on board", "Captain", "IT support (24/7)"];
  rows.forEach((r, i) => {
    const y = ry + 82 + i * 48;
    s += txt(50, y + 18, r, { size: 10.5, weight: 600, fill: INK });
    s += labelBox(225, y, 170, 26, "NAME") + labelBox(405, y, 140, 26, "PHONE / EXT");
  });
  s += footer(A4).replace(`fill="${MUTED}"`, 'fill="#9fb0d4"');
  const fields = rows.flatMap((_, i) => {
    const top = ry + 82 + i * 48;
    return [{ name: `contact${i + 1}_name`, x: 226, top: top + 1, w: 168, h: 24, size: 11 }, { name: `contact${i + 1}_phone`, x: 406, top: top + 1, w: 138, h: 24, size: 11 }];
  });
  return build("Cyber safety on board — crew mess poster", [{ size: A4, svg: s, fields }]);
}

// ── 2. Pocket cards: 10 credit-card-size cards on one A4 sheet ──────────────
async function pocketCards() {
  const [w, h] = A4;
  const cw = 241, ch = 156, x0 = (w - cw * 2) / 2, y0 = (h - ch * 5) / 2;
  let s = "", fields = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 2; c++) {
    const x = x0 + c * cw, y = y0 + r * ch;
    s += rect(x, y, cw, ch, 0, "#ffffff", "#9aa5b8", 0.6, 'stroke-dasharray="3 3"');
    s += rect(x + 6, y + 6, cw - 12, 30, 5, NAVY) + g(x + 12, y + 9, 0.24, icon.shield()) +
      txt(x + 40, y + 26, "SOMETHING WRONG? REPORT IT FAST", { size: 8.2, weight: 700, fill: "#ffffff", spacing: 0.4 });
    ["1  Stop — don't click anything else", "2  Don't switch it off", "3  Tell someone now", "4  Say what, when, which device"].forEach((t, i) => {
      s += txt(x + 12, y + 52 + i * 12.5, t, { size: 8, fill: INK });
    });
    s += txt(x + 12, y + 118, "CALL", { size: 6.5, weight: 700, fill: MUTED }) + rect(x + 40, y + 107, cw - 52, 15, 2, "none", RULE, 0.6);
    s += txt(x + 12, y + 140, "IT", { size: 6.5, weight: 700, fill: MUTED }) + rect(x + 40, y + 129, cw - 52, 15, 2, "none", RULE, 0.6);
    fields.push({ name: "card_call", x: x + 41, top: y + 108, w: cw - 54, h: 13, size: 8 }, { name: "card_it", x: x + 41, top: y + 130, w: cw - 54, h: 13, size: 8 });
  }
  s += txt(w / 2, y0 - 10, "Type the contacts once — every card fills in. Print, cut along the dashed lines, keep one in your wallet.", { size: 7.5, fill: MUTED, anchor: "middle" });
  return build("Report it fast — pocket cards", [{ size: A4, svg: s, fields }]);
}

// ── 3. Removable media log (printable, landscape) ───────────────────────────
async function mediaLog() {
  const [w, h] = A4L;
  let s = header(w, "Removable media", "Removable media log", "Vessel: ____________________   Month: ____________");
  s += txt(36, 116, "Every USB stick, memory card, external drive or visitor's laptop is scanned at the scanning PC BEFORE it is used on any ship's computer.", { size: 9, fill: INK });
  s += txt(36, 130, "Never on bridge or engine-room equipment unless it is an approved update, scanned first and done by the responsible officer.", { size: 9, fill: INK });
  const cols = [["Date", 36, 60], ["Device (type / size)", 96, 120], ["From / purpose", 216, 150], ["Scanned by / result", 366, 120], ["Used on (computer)", 486, 140], ["Returned / wiped", 626, 100], ["Sign", 726, 80]];
  const ty = 146;
  s += rect(36, ty, w - 72, 22, 0, NAVY);
  for (const [t, x] of cols) s += txt(x + 5, ty + 15, t, { size: 8.5, weight: 700, fill: "#ffffff" });
  for (let i = 0; i < 15; i++) {
    const y = ty + 22 + i * 24;
    s += rect(36, y, w - 72, 24, 0, i % 2 ? "#f5f7fb" : "#ffffff", RULE, 0.5);
    for (const [, x] of cols.slice(1)) s += line(x, y, x, y + 24, RULE, 0.5);
  }
  s += txt(36, h - 34, "Reviewed by (ETO / Chief Officer): ______________________   Date: ____________", { size: 9, fill: INK });
  s += footer(A4L);
  return build("Removable media log", [{ size: A4L, svg: s }]);
}

// ── 4. Contractor and remote access checklist (fillable) ────────────────────
async function contractorChecklist() {
  const [w, h] = A4;
  let s = header(w, "Officers and Heads of Department", "Contractors & remote access", "Checklist");
  const fields = [];
  const info = [["Contractor / company", 36, 120, 330], ["Date", 380, 120, 179], ["Systems they will work on", 36, 166, 330], ["Supervised by", 380, 166, 179]];
  for (const [l, x, y, bw] of info) { s += labelBox(x, y, bw, 24, l.toUpperCase()); fields.push({ name: l, x: x + 1, top: y + 1, w: bw - 2, h: 22, size: 10 }); }
  const groups = [
    ["Before they come on board", ["Visit agreed with the Captain / HoD — scope, systems and time", "Remote access (if any) booked for a set time, with MFA", "They know: guest network only for their own devices"]],
    ["On board", ["Escorted or supervised the whole time on ship's systems", "Their laptop / USB scanned at the scanning PC before use", "No new accounts, apps or remote tools left behind without IT's OK", "Nothing plugged into bridge or engine equipment unless agreed and supervised"]],
    ["Remote access", ["Connection opened by us, not left permanently on", "Watched while connected; disconnected and disabled afterwards", "Logged: who, when, what was changed"]],
    ["Afterwards", ["Passwords they used changed (if any were shared)", "Changes written up and passed to IT support", "Removable media log and this checklist signed and filed"]],
  ];
  let y = 214, n = 0;
  for (const [t, items] of groups) {
    s += txt(36, y + 14, t, { size: 12.5, weight: 700, fill: NAVY }); y += 24;
    for (const it of items) {
      s += txt(62, y + 12, it, { size: 9.5, fill: INK });
      fields.push({ name: `check_${++n}`, x: 38, top: y, w: 14, h: 14, check: true });
      y += 22;
    }
    y += 10;
  }
  s += labelBox(36, y + 14, 523, 70, "NOTES"); fields.push({ name: "notes", x: 37, top: y + 15, w: 521, h: 68, multiline: true, size: 9 });
  s += labelBox(36, y + 108, 250, 24, "SIGNED (OFFICER)"); fields.push({ name: "signed", x: 37, top: y + 109, w: 248, h: 22, size: 10 });
  s += footer(A4);
  return build("Contractors and remote access checklist", [{ size: A4, svg: s, fields }]);
}

// ── 5. Cyber incident report (fillable) ─────────────────────────────────────
async function incidentReport() {
  const [w, h] = A4;
  let s = header(w, "First response", "Cyber incident report", "Fill in as soon as you can");
  const fields = [];
  const small = [["Vessel", 36, 118, 250], ["Date & time noticed", 300, 118, 259], ["Reported by", 36, 162, 250], ["Reported to (name, time)", 300, 162, 259], ["Device / account / system", 36, 206, 523]];
  for (const [l, x, y, bw] of small) { s += labelBox(x, y, bw, 24, l.toUpperCase()); fields.push({ name: l, x: x + 1, top: y + 1, w: bw - 2, h: 22, size: 10 }); }
  const big = [["What happened (what was clicked / opened / seen)", 250, 90], ["What we did to contain it (and when)", 360, 80], ["Who was told — Captain, company, IT support (times)", 460, 70]];
  for (const [l, y, bh] of big) { s += labelBox(36, y, 523, bh, l.toUpperCase()); fields.push({ name: l, x: 37, top: y + 1, w: 521, h: bh - 2, multiline: true, size: 9 }); }
  const qs = ["Personal data involved (guest / crew)?", "Navigation or engine systems affected?", "Money / payments involved?", "Device isolated from the network?"];
  qs.forEach((q, i) => {
    const y = 552 + i * 22;
    s += txt(62, y + 11, q, { size: 9.5, fill: INK });
    fields.push({ name: `q${i + 1}`, x: 38, top: y, w: 14, h: 14, check: true });
  });
  s += txt(330, 563, "Tick = yes. Personal data? Tell the company's data", { size: 8.5, fill: MUTED }) + txt(330, 576, "protection lead straight away — legal deadlines apply", { size: 8.5, fill: MUTED }) + txt(330, 589, "(72 hours under UK / EU GDPR).", { size: 8.5, fill: MUTED });
    s += labelBox(36, 660, 523, 70, "FOLLOW-UP AND LESSONS LEARNED"); fields.push({ name: "follow_up", x: 37, top: 661, w: 521, h: 68, multiline: true, size: 9 });
  s += labelBox(36, 752, 250, 24, "SIGNED (OFFICER)") + labelBox(300, 752, 259, 24, "CAPTAIN");
  fields.push({ name: "signed_officer", x: 37, top: 753, w: 248, h: 22, size: 10 }, { name: "signed_captain", x: 301, top: 753, w: 257, h: 22, size: 10 });
  s += footer(A4);
  return build("Cyber incident report", [{ size: A4, svg: s, fields }]);
}

// ── 6. Contingency plan template (fillable, 3 pages) ────────────────────────
async function contingencyPlan() {
  const scenarios = [
    ["Loss of GPS / position", "Position jumps, freezes or shows on land; GPS alarms; AIS targets in odd places."],
    ["Loss of communications", "Starlink, VSAT and 4G all down — no email, phone or internet."],
    ["Ransomware / IT outage", "Ransom note, files won't open, office systems down."],
    ["Payment fraud", "Changed bank details, urgent payment requests, a hacked supplier mailbox."],
    ["Data breach", "Guest or crew personal data sent, lost or exposed."],
  ];
  const pages = [];
  const [w] = A4;
  // cover page with vessel details
  let s0 = header(w, "Captains", "Cyber contingency plans", "Template");
  const f0 = [];
  s0 += para(36, 122, "One page per scenario. Fill it in with the officers, keep a printed copy on the bridge and in the office, review it every year and after every drill or real incident.", { size: 10, width: 95, fill: INK, lh: 1.45 });
  const info = [["Vessel", 170], ["Captain", 214], ["Company contact (24/7)", 258], ["IT support (24/7)", 302], ["Data protection lead", 346], ["Flag / class contact", 390], ["Last reviewed", 434]];
  for (const [l, y] of info) { s0 += labelBox(36, y, 523, 26, l.toUpperCase()); f0.push({ name: l, x: 37, top: y + 1, w: 521, h: 24, size: 11 }); }
  s0 += txt(36, 500, "Scenarios in this plan", { size: 13, weight: 700, fill: NAVY });
  scenarios.forEach(([t], i) => { s0 += txt(36, 524 + i * 18, `${i + 1}.  ${t}`, { size: 10.5, fill: INK }); });
  s0 += footer(A4);
  pages.push({ size: A4, svg: s0, fields: f0 });
  scenarios.forEach(([t, signs], i) => {
    let s = header(w, `Scenario ${i + 1}`, t, "Contingency plan");
    s += txt(36, 116, "Signs:", { size: 9.5, weight: 700, fill: INK }) + txt(70, 116, signs, { size: 9.5, fill: INK });
    const f = [];
    const boxes = [["First actions (first 15 minutes)", 142, 112], ["Who leads, who does what", 280, 80], ["Who to call — names and numbers", 386, 80], ["Fallback: how we keep working (paper, backup systems)", 492, 110], ["When to return to normal / who decides", 628, 50]];
    for (const [l, y, bh] of boxes) { s += labelBox(36, y, 523, bh, l.toUpperCase()); f.push({ name: `s${i + 1}_${l}`, x: 37, top: y + 1, w: 521, h: bh - 2, multiline: true, size: 9 }); }
    s += labelBox(36, 706, 250, 24, "LAST DRILLED (DATE)") + labelBox(300, 706, 259, 24, "REVIEWED BY");
    f.push({ name: `s${i + 1}_drilled`, x: 37, top: 707, w: 248, h: 22, size: 10 }, { name: `s${i + 1}_reviewed`, x: 301, top: 707, w: 257, h: 22, size: 10 });
    s += footer(A4);
    pages.push({ size: A4, svg: s, fields: f });
  });
  return build("Cyber contingency plans — template", pages);
}

export const PDFS = {
  "p1-crew-mess-poster.pdf": poster,
  "p2-pocket-cards.pdf": pocketCards,
  "p3-removable-media-log.pdf": mediaLog,
  "p4-contractor-checklist.pdf": contractorChecklist,
  "p5-incident-report.pdf": incidentReport,
  "p6-contingency-plan.pdf": contingencyPlan,
};
