// Pictures for "Microsoft 365 essentials" (curriculum B2). Generic, drawn screens —
// no Microsoft logos or product artwork, just the shapes crew will recognise.
import { C, txt, para, svg, g, rect, circle, line, backdrop, icon, titleBlock } from "../academy-cyber/art.mjs";

const W = 1600, H = 900;
const pct = (v) => +(v / W * 100).toFixed(2);
const spot = (x, y, r) => ({ x: pct(x), y: pct(y), r: pct(r) });
const BLUE = "#2b5fb8";

// ── 1. Number matching ──────────────────────────────────────────────────────
function numberMatch() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Signing in", "Number matching: type the number you see");
  // laptop sign-in
  b += rect(80, 210, 760, 470, 16, "#2a3446", "#4a5a78", 3) + rect(100, 230, 720, 430, 4, C.paper);
  b += txt(140, 290, "Approve sign in request", { size: 30, weight: 700, fill: C.ink });
  b += para(140, 340, "Open your Authenticator app, and enter the number shown to sign in.", { size: 22, width: 52, fill: "#3b4556", lh: 1.4 });
  b += txt(460, 500, "42", { size: 120, weight: 700, fill: C.ink, anchor: "middle" });
  b += txt(140, 620, "j.martin@vessel-mail.com", { size: 20, fill: "#5b6476" });
  b += txt(460, 730, "On the laptop you're signing in to", { size: 22, fill: C.muted, anchor: "middle" });
  // phone
  b += rect(1000, 160, 340, 640, 40, "#1c2230", "#4a5a78", 3) + rect(1020, 200, 300, 560, 10, C.paper);
  b += txt(1170, 260, "Are you trying to", { size: 24, weight: 700, fill: C.ink, anchor: "middle" }) + txt(1170, 292, "sign in?", { size: 24, weight: 700, fill: C.ink, anchor: "middle" });
  b += txt(1170, 330, "Vessel Mail · j.martin", { size: 17, fill: "#5b6476", anchor: "middle" });
  b += txt(1170, 372, "Enter the number shown to sign in.", { size: 17, fill: "#3b4556", anchor: "middle" });
  b += rect(1060, 395, 220, 64, 8, "#ffffff", BLUE, 2) + txt(1170, 440, "42", { size: 36, weight: 700, fill: C.ink, anchor: "middle" });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const n = r * 3 + c + 1;
    b += rect(1060 + c * 76, 480 + r * 56, 68, 48, 6, "#e6eaf1") + txt(1094 + c * 76, 513 + r * 56, String(n), { size: 22, fill: C.ink, anchor: "middle" });
  }
  b += rect(1060, 660, 104, 50, 8, "#e6eaf1") + txt(1112, 693, "No, it's not me", { size: 13, fill: "#b3261e", anchor: "middle" });
  b += rect(1176, 660, 104, 50, 8, BLUE) + txt(1228, 693, "Yes", { size: 18, weight: 700, fill: "#fff", anchor: "middle" });
  b += `<path d="M860 445 C920 445 940 427 1000 427" fill="none" stroke="${C.gold}" stroke-width="4" stroke-dasharray="10 8"/>`;
  b += rect(380, 812, 840, 64, 14, "#3a1414", C.red, 2) + txt(800, 853, "No number on a screen in front of you? You didn't start it — tap \"No, it's not me\".", { size: 22, weight: 600, fill: C.white, anchor: "middle" });
  return svg(W, H, b);
}

// ── 2. OneDrive sync icons (hotspot picture, 1600 × 1000) ───────────────────
const FH = 1000;
const status = {
  cloud: (x, y) => `<path d="M${x - 16} ${y + 8} a10 10 0 0 1 2 -20 a14 14 0 0 1 26 -2 a10 10 0 0 1 4 22 z" fill="none" stroke="${BLUE}" stroke-width="3"/>`,
  local: (x, y) => circle(x, y, 13, "#fff", "#1e8e3e", 3) + `<path d="M${x - 6} ${y} l4 5 l8 -9" fill="none" stroke="#1e8e3e" stroke-width="3" stroke-linecap="round"/>`,
  always: (x, y) => circle(x, y, 13, "#1e8e3e") + `<path d="M${x - 6} ${y} l4 5 l8 -9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
  error: (x, y) => circle(x, y, 13, "#c42b1c") + line(x - 5, y - 5, x + 5, y + 5, "#fff", 3) + line(x + 5, y - 5, x - 5, y + 5, "#fff", 3),
  syncing: (x, y) => `<path d="M${x - 10} ${y - 2} a10 10 0 0 1 18 -5 m2 -5 v6 h-6 M${x + 10} ${y + 2} a10 10 0 0 1 -18 5 m-2 5 v-6 h6" fill="none" stroke="${BLUE}" stroke-width="3" stroke-linecap="round"/>`,
  shared: (x, y) => circle(x - 4, y - 5, 5, "#5b6476") + `<path d="M${x - 13} ${y + 10} c0 -8 18 -8 18 0" fill="#5b6476"/>` + circle(x + 7, y - 3, 4, "#8a93a3"),
};
function syncIcons() {
  let b = rect(0, 0, W, FH, 0, "#e9edf3") + rect(80, 60, 1440, 880, 12, "#ffffff", "#cfd6e2", 2);
  b += rect(80, 60, 1440, 70, 12, "#f3f5f9") + rect(80, 116, 1440, 14, 0, "#f3f5f9");
  b += txt(120, 106, "OneDrive — Vessel Mail  ›  Documents  ›  Charter", { size: 22, fill: "#3b4556" });
  b += rect(80, 130, 1440, 54, 0, "#fafbfd") + txt(150, 165, "Name", { size: 19, weight: 700, fill: "#5b6476" }) + txt(900, 165, "Status", { size: 19, weight: 700, fill: "#5b6476" }) + txt(1100, 165, "Date modified", { size: 19, weight: 700, fill: "#5b6476" });
  const rows = [
    ["Guest preferences.docx", "always", "Today 08:12"],
    ["Provisioning list — week 43.xlsx", "local", "Today 09:40"],
    ["Charter contract.pdf", "cloud", "12 Oct"],
    ["Crew rota October.xlsx", "error", "Today 10:05"],
    ["Wine cellar inventory.xlsx", "syncing", "Today 10:07"],
    ["Menu ideas.docx", "shared", "Yesterday"],
  ];
  rows.forEach(([n, st, d], i) => {
    const y = 184 + i * 92;
    b += rect(80, y, 1440, 92, 0, i % 2 ? "#fafbfd" : "#fff", "#eef1f6", 1);
    b += rect(120, y + 26, 30, 38, 4, n.endsWith(".pdf") ? "#c42b1c" : n.endsWith(".xlsx") ? "#1e7145" : BLUE);
    b += txt(170, y + 54, n, { size: 24, fill: C.ink });
    b += status[st](925, y + 46);
    b += txt(1100, y + 54, d, { size: 22, fill: "#5b6476" });
  });
  // legend
  const leg = [["cloud", "Online only — opens when you have internet"], ["local", "On this device"], ["always", "Always kept on this device"], ["syncing", "Syncing"], ["error", "Can't sync — needs attention"]];
  leg.forEach(([st, t], i) => {
    const x = 120 + (i % 2) * 700, y = 790 + Math.floor(i / 2) * 50;
    b += status[st](x + 14, y) + txt(x + 44, y + 8, t, { size: 20, fill: "#3b4556" });
  });
  return svg(W, FH, b, null);
}
export const SYNC_SPOTS = { error: [spot(925, 184 + 3 * 92 + 46, 70), spot(420, 184 + 3 * 92 + 46, 130)] };

// ── 3. Sharing a file (hotspot picture, 1600 × 1000) ────────────────────────
function shareDialog() {
  let b = rect(0, 0, W, FH, 0, "#e9edf3");
  b += rect(420, 80, 760, 840, 16, "#ffffff", "#cfd6e2", 2);
  b += txt(460, 145, "Share \"Provisioning list — week 43.xlsx\"", { size: 26, weight: 700, fill: C.ink });
  b += txt(460, 190, "Who would you like to share with?", { size: 22, fill: "#3b4556" });
  const opts = [
    ["Anyone", "Anyone with the link — even if it's forwarded", "#c42b1c"],
    ["People in your organisation", "Anyone at the company with the link", "#b26b00"],
    ["People with existing access", "Only people who can already open it", "#3b4556"],
    ["Specific people", "Only the people you choose", "#1e8e3e"],
  ];
  opts.forEach(([t, d, col], i) => {
    const y = 220 + i * 120;
    b += rect(460, y, 680, 100, 10, i === 0 ? "#eef4ff" : "#fff", i === 0 ? BLUE : "#dfe4ee", 2);
    b += circle(500, y + 50, 14, "#fff", col, 4);
    if (i === 0) b += circle(500, y + 50, 7, BLUE);
    b += txt(530, y + 45, t, { size: 24, weight: 700, fill: C.ink }) + txt(530, y + 76, d, { size: 19, fill: "#5b6476" });
  });
  b += txt(460, 740, "Anyone with the link can: view and edit", { size: 20, fill: "#3b4556" });
  b += rect(460, 770, 680, 56, 8, "#fff", "#dfe4ee", 2) + txt(480, 806, "Enter a name or email address", { size: 20, fill: "#8a93a3" });
  b += rect(940, 850, 200, 50, 8, BLUE) + txt(1040, 883, "Send", { size: 20, weight: 700, fill: "#fff", anchor: "middle" });
  return svg(W, FH, b, null);
}
export const SHARE_SPOTS = { specific: [spot(800, 220 + 3 * 120 + 50, 120)] };

// ── 4. Which app for what ───────────────────────────────────────────────────
function whichApp() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Microsoft 365 on board", "Which app for what");
  const cards = [
    ["Outlook", "Email — guests' agents, suppliers, the office. Formal, and anything outside the company.", icon.envelope(), BLUE],
    ["Teams chat", "Quick questions to one or a few people. Calls, including over Starlink.", icon.phone(), "#6264a7"],
    ["Teams channel", "Your department's conversations and files, kept together.", icon.user(C.muted), "#6264a7"],
    ["OneDrive", "Your own work files — saved in the cloud, not only on the laptop.", icon.laptop(), BLUE],
    ["SharePoint", "Shared files for the yacht or a department (what you see as \"Files\" in a Teams channel).", icon.server(), "#1e7145"],
  ];
  const cw = 272, gap = 20, x0 = (W - (cw * 5 + gap * 4)) / 2;
  cards.forEach(([t, d, ic, col], i) => {
    const x = x0 + i * (cw + gap), y = 230;
    b += rect(x, y, cw, 560, 18, C.panel, col, 3);
    b += circle(x + cw / 2, y + 110, 72, C.deep) + g(x + cw / 2 - 50, y + 60, 1, ic);
    b += txt(x + 24, y + 260, t, { size: 30, weight: 700, fill: C.white });
    b += para(x + 24, y + 306, d, { size: 22, width: 22, fill: C.text, lh: 1.4 });
  });
  b += txt(W / 2, 850, "Big files? Send a link from OneDrive or SharePoint, not an attachment — it saves the satellite link.", { size: 23, fill: C.gold, anchor: "middle" });
  return svg(W, H, b);
}

export const PICTURES = {
  "m1-number-match.png": numberMatch,
  "m2-sync-icons.png": syncIcons,
  "m3-share-dialog.png": shareDialog,
  "m4-which-app.png": whichApp,
};
export const ANIMATIONS = {};
