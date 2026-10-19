// Pictures for the officers / HoDs and Captains cyber courses (same drawing kit as
// pictures.mjs). Hotspot spots are percentages of the picture's WIDTH.
import { C, txt, para, svg, g, rect, circle, line, backdrop, icon, titleBlock } from "./art.mjs";

const W = 1600, H = 900;
const pct = (v) => +(v / W * 100).toFixed(2);
const spot = (x, y, r) => ({ x: pct(x), y: pct(y), r: pct(r) });

// ── Officers: the five functions, with what officers do in each ────────────
function officerRole() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Officers and Heads of Department", "Your part in each step");
  const steps = [
    ["Identify", "Know what's on board: devices, accounts, who has access.", icon.server(), C.teal],
    ["Protect", "Accounts for joiners, removed for leavers. USB and contractor rules.", icon.lock(C.gold), C.gold],
    ["Detect", "Crew know what looks wrong — and feel safe telling you.", icon.user(C.muted), C.muted],
    ["Respond", "Contain it, tell the Captain and IT, keep the evidence.", icon.warn(), C.amber],
    ["Recover", "Get working again from backups. Learn from it, drill it.", icon.shield(C.green, C.white), C.green],
  ];
  const cw = 272, gap = 20, x0 = (W - (cw * 5 + gap * 4)) / 2;
  steps.forEach(([t, d, ic, col], i) => {
    const x = x0 + i * (cw + gap), y = 240;
    b += rect(x, y, cw, 520, 18, C.panel, col, 2);
    b += circle(x + cw / 2, y + 110, 72, C.deep) + g(x + cw / 2 - 50, y + 60, 1, ic);
    b += txt(x + 24, y + 244, `${i + 1}`, { size: 22, weight: 700, fill: col });
    b += txt(x + 24, y + 282, t, { size: 30, weight: 700, fill: C.white });
    b += para(x + 24, y + 326, d, { size: 23, width: 21, fill: C.text, lh: 1.4 });
    if (i < 4) b += `<path d="M${x + cw + 2} ${y + 110} l${gap - 4} 0" stroke="${C.gold}" stroke-width="4"/>`;
  });
  b += txt(W / 2, 830, "Based on the IMO guidelines on maritime cyber risk management (MSC-FAL.1/Circ.3/Rev.3).", { size: 23, fill: C.muted, anchor: "middle" });
  return svg(W, H, b);
}

// ── Officers: removable media log with one entry that breaks the rules (hotspot) ──
const LH = 1000;
function mediaLog() {
  let b = rect(0, 0, W, LH, 0, "#e9edf3") + rect(60, 40, 1480, 920, 12, C.white, "#cfd6e2", 2);
  b += txt(100, 110, "Removable media log — M/Y SERENITY", { size: 34, weight: 700, fill: C.ink });
  b += txt(100, 150, "Every USB stick, card or drive is scanned at the scanning PC before it is used on any ship's computer.", { size: 21, fill: "#4a5568" });
  const cols = [["Date", 100], ["Device", 250], ["From", 540], ["Scanned", 820], ["Used on", 1000], ["Sign", 1330]];
  b += rect(80, 180, 1440, 60, 0, "#1f3a6b");
  for (const [t, x] of cols) b += txt(x, 220, t, { size: 22, weight: 700, fill: C.white });
  const rows = [
    ["12 Oct", "USB stick (32 GB)", "Agent — port papers", "✓ Clean", "Office PC", "JM"],
    ["13 Oct", "SD card", "Deck — drone photos", "✓ Clean", "Crew laptop", "AR"],
    ["14 Oct", "USB stick (8 GB)", "ECDIS chart update", "✓ Clean", "ECDIS", "2/O"],
    ["15 Oct", "USB stick (64 GB)", "Guest — music playlist", "—", "Saloon AV / ECDIS", "?"],
    ["16 Oct", "Laptop (contractor)", "AV engineer", "✓ Checked", "Guest network only", "ETO"],
    ["17 Oct", "USB stick (16 GB)", "Surveyor report", "✓ Clean", "Office PC", "C/O"],
  ];
  rows.forEach((r, i) => {
    const y = 240 + i * 100;
    b += rect(80, y, 1440, 100, 0, i % 2 ? "#f6f8fb" : C.white, "#e3e7ef", 1);
    r.forEach((c, j) => {
      b += txt(cols[j][1], y + 60, c, { size: 22, fill: C.ink, family: j === 5 ? "Segoe Print, Segoe UI, sans-serif" : undefined });
    });
  });
  b += txt(100, 900, "Reviewed weekly by the ETO / Chief Officer.", { size: 20, fill: "#4a5568", italic: true });
  return svg(W, LH, b, null);
}
export const MEDIA_LOG_SPOTS = { bad: [spot(900, 590, 110), spot(1160, 590, 120), spot(380, 590, 110)] };

// ── Officers: first response flow ──────────────────────────────────────────
function incidentFlow() {
  let b = backdrop(W, H) + titleBlock(80, 90, "First response", "When a crew member reports something");
  const steps = [
    ["Listen", "What happened, when, which device or account. Thank them.", C.teal],
    ["Contain", "Network cable out or Wi-Fi off. Don't switch off. IT resets the password.", C.amber],
    ["Escalate", "Captain, then the company and IT support. Data or navigation? Say so.", C.red],
    ["Keep evidence", "Photos of the screen, times, the email. Delete nothing.", C.gold],
    ["Recover & learn", "Restore with IT. Write the report. Brief the crew.", C.green],
  ];
  steps.forEach(([t, d, col], i) => {
    const x = 80 + i * 296, y = 300;
    b += rect(x, y, 270, 380, 18, C.panel, col, 3);
    b += circle(x + 46, y + 50, 26, col) + txt(x + 46, y + 60, String(i + 1), { size: 26, weight: 700, fill: C.bg, anchor: "middle" });
    b += txt(x + 24, y + 130, t, { size: 30, weight: 700, fill: C.white });
    b += para(x + 24, y + 176, d, { size: 23, width: 20, fill: C.text, lh: 1.45 });
    if (i < 4) b += `<path d="M${x + 274} ${y + 190} l18 0 m-8 -8 l8 8 l-8 8" fill="none" stroke="${C.gold}" stroke-width="4" stroke-linecap="round"/>`;
  });
  b += txt(W / 2, 780, "Speed beats perfection: a reset password or an unplugged laptop in the first minutes limits the damage.", { size: 24, fill: C.gold, anchor: "middle", weight: 600 });
  return svg(W, H, b);
}

// ── Officers: monthly checks and drills ────────────────────────────────────
function monthlyChecks() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Keeping it alive", "Monthly checks and twice-yearly drills");
  const checks = [
    "Updates installed on every ship's laptop and PC (nothing older than 14 days)",
    "Backups ran — and one file was restored as a test",
    "Leavers' accounts disabled; joiners have accounts, MFA and the crew course",
    "Crew Wi-Fi password changed after crew changes",
    "Removable media log reviewed and signed",
    "Anti-malware up to date on the scanning PC",
  ];
  b += rect(80, 220, 860, 600, 18, C.panel, C.line, 2) + txt(110, 275, "Monthly checklist", { size: 30, weight: 700, fill: C.white });
  checks.forEach((c, i) => {
    const y = 330 + i * 78;
    b += rect(110, y - 26, 34, 34, 6, "none", C.gold, 3) + `<path d="M116 ${y - 10} l9 9 l15 -17" fill="none" stroke="${C.gold}" stroke-width="4" stroke-linecap="round"/>`;
    b += para(162, y, c, { size: 22, width: 60, fill: C.text, lh: 1.3 });
  });
  b += rect(980, 220, 540, 600, 18, C.panel, C.amber, 2) + txt(1010, 275, "Drill ideas (twice a year)", { size: 30, weight: 700, fill: C.white });
  const drills = [
    ["Ransomware mid-charter", "Office PC shows a ransom note. Who does what? Can you still provision and pay?"],
    ["GPS spoofed", "ECDIS jumps inland. Bridge team cross-checks and switches to the GPS-loss procedure."],
    ["Payroll phishing", "A fake payroll email reaches the crew. How fast is it reported?"],
  ];
  drills.forEach(([t, d], i) => {
    const y = 330 + i * 160;
    b += g(1010, y - 30, 0.5, icon.warn());
    b += txt(1075, y, t, { size: 25, weight: 700, fill: C.white });
    b += para(1075, y + 36, d, { size: 21, width: 36, fill: C.muted, lh: 1.35 });
  });
  return svg(W, H, b);
}

// ── Captains: what the SMS and auditors expect ──────────────────────────────
function smsMap() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Safety Management System", "What an auditor will ask to see");
  const items = [
    ["Cyber risk assessment", "Kept current — redone when systems or networks change"],
    ["Inventory", "IT and OT: hardware, software, networks, remote connections"],
    ["Roles", "Who is responsible on board and ashore, and who IT support is"],
    ["Procedures", "Accounts, USB / removable media, contractors and remote access, backups"],
    ["Training records", "Crew course completions — Crew Academy reports are your evidence"],
    ["Response and recovery", "Incident plan, contingency plans, drills and their reports"],
  ];
  items.forEach(([t, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 80 + col * 740, y = 220 + row * 200;
    b += rect(x, y, 700, 172, 18, C.panel, C.line, 2);
    b += g(x + 28, y + 40, 0.9, icon.tick(i < 4 ? C.green : C.teal));
    b += txt(x + 150, y + 76, t, { size: 30, weight: 700, fill: C.white });
    b += para(x + 150, y + 116, d, { size: 22, width: 44, fill: C.muted });
  });
  b += txt(W / 2, 860, "ISM Code + IMO resolution MSC.428(98): cyber risk is managed in the SMS, like any other safety risk.", { size: 23, fill: C.gold, anchor: "middle" });
  return svg(W, H, b);
}

// ── Captains: the Cyber Essentials Plus year ───────────────────────────────
function ceTimeline() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Cyber Essentials Plus", "How the certificate year works");
  const steps = [
    ["Scope", "Agree what's in: company and vessel IT, cloud services, devices that reach company data"],
    ["Self-assessment", "Questions answered and signed off by a senior person"],
    ["External scan", "The assessor scans what faces the internet — firewalls and routers"],
    ["Device tests", "The assessor picks sample devices: patches, malware, email, browser and MFA"],
    ["Certificate", "Valid 12 months. No grace period — renew before it runs out"],
  ];
  b += line(160, 420, 1440, 420, C.line, 6);
  steps.forEach(([t, d], i) => {
    const x = 160 + i * 320;
    b += circle(x, 420, 30, i === 4 ? C.green : C.gold) + txt(x, 431, String(i + 1), { size: 28, weight: 700, fill: C.bg, anchor: "middle" });
    b += txt(x, 360, t, { size: 28, weight: 700, fill: C.white, anchor: "middle" });
    b += para(x - 140, 500, d, { size: 21, width: 25, fill: C.text, lh: 1.4 });
  });
  b += rect(80, 700, 1440, 120, 16, C.panel, C.amber, 2);
  b += txt(110, 748, "At sea? Plan the device tests around the itinerary and the connection — the assessor needs", { size: 23, fill: C.white });
  b += txt(110, 784, "remote access to sample laptops, and patches must already be on (critical ones within 14 days).", { size: 23, fill: C.white });
  return svg(W, H, b);
}

// ── Captains: contingency plans ────────────────────────────────────────────
function contingency() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Contingency plans", "Five things to plan for before they happen");
  const cards = [
    ["Loss of GPS / position", "Cross-checks, GPS-loss procedure, paper or backup charts, report it.", icon.ecdis(), C.red],
    ["Loss of communications", "Starlink, VSAT and 4G all down: sat phone, GMDSS, who calls whom.", icon.satellite(C.muted), C.teal],
    ["Ransomware / IT outage", "Paper fallback for crew list, port papers, provisioning and payments.", icon.laptop("#5a1f1c", C.red), C.amber],
    ["Payment fraud", "Bank-detail changes confirmed by phone. Who can approve payments.", icon.key(), C.gold],
    ["Data breach", "Guest or crew data exposed: tell the company and its data protection lead at once.", icon.user(C.muted), C.green],
  ];
  const cw = 272, gap = 20, x0 = (W - (cw * 5 + gap * 4)) / 2;
  cards.forEach(([t, d, ic, col], i) => {
    const x = x0 + i * (cw + gap), y = 230;
    b += rect(x, y, cw, 560, 18, C.panel, col, 3);
    b += circle(x + cw / 2, y + 110, 72, C.deep) + g(x + cw / 2 - 50, y + 60, 1, ic);
    b += para(x + 24, y + 250, t, { size: 27, width: 18, weight: 700, fill: C.white, lh: 1.25 });
    b += para(x + 24, y + 340, d, { size: 22, width: 22, fill: C.text, lh: 1.4 });
  });
  b += txt(W / 2, 850, "Write each one down, keep a printed copy on board, and drill at least one a year.", { size: 24, fill: C.gold, anchor: "middle", weight: 600 });
  return svg(W, H, b);
}

export const LEADER_PICTURES = {
  "o1-officer-role.png": officerRole,
  "o2-media-log.png": mediaLog,
  "o3-incident-flow.png": incidentFlow,
  "o4-monthly-checks.png": monthlyChecks,
  "c1-sms-audit.png": smsMap,
  "c2-ce-plus-year.png": ceTimeline,
  "c3-contingency.png": contingency,
};
