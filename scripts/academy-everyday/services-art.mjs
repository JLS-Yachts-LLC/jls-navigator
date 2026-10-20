// Pictures for curriculum B3 (guest Wi-Fi and guest devices), B5 (printers and scanning)
// and B6 (phones on board). Generic devices only — no brand logos.
import { C, txt, para, svg, g, rect, circle, line, backdrop, icon, titleBlock } from "../academy-cyber/art.mjs";

const W = 1600, H = 900, TALL = 1000;
const pct = (v) => +(v / W * 100).toFixed(2);
const spot = (x, y, r) => ({ x: pct(x), y: pct(y), r: pct(r) });
const BLUE = "#2b5fb8";
const phoneFrame = (x, y, w, h) => rect(x, y, w, h, 46, "#1c2230", "#4a5a78", 3) + rect(x + 18, y + 40, w - 36, h - 80, 14, "#f4f6fa") + rect(x + w / 2 - 50, y + 16, 100, 10, 5, "#4a5a78");

// ── B3-1 Guest network map ──────────────────────────────────────────────────
function guestMap() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Guest Wi-Fi", "What guests can — and can't — reach");
  const box = (x, y, w, h, t, d, col) => rect(x, y, w, h, 16, C.panel, col, 3) + txt(x + 24, y + 48, t, { size: 28, weight: 700, fill: C.white }) + para(x + 24, y + 88, d, { size: 21, width: Math.floor(w / 13), fill: C.muted, lh: 1.35 });
  b += g(120, 330, 1.3, icon.phone()) + g(230, 360, 1.1, icon.laptop());
  b += txt(220, 520, "Guest devices", { size: 24, weight: 600, fill: C.white, anchor: "middle" });
  b += box(420, 300, 330, 230, "Guest Wi-Fi", "Its own network. A welcome page may ask guests to accept the terms first.", C.teal);
  b += line(340, 415, 420, 415, C.teal, 5);
  b += line(750, 380, 900, 280, C.green, 5) + box(900, 200, 300, 160, "Internet", "Through the yacht's Starlink / VSAT / 4G.", C.green);
  b += line(750, 450, 900, 450, C.green, 5) + box(900, 380, 300, 160, "Cabin Apple TV", "Only where the AV is set up for guests to cast.", C.green);
  b += g(1220, 230, 0.5, icon.tick()) + g(1220, 410, 0.5, icon.tick());
  b += line(750, 500, 900, 640, C.red, 5, 'stroke-dasharray="12 10"') + box(900, 580, 300, 200, "Crew & office", "Crew Wi-Fi, office PCs, printers, bridge and engine systems.", C.red);
  b += g(1220, 610, 0.5, icon.cross());
  b += rect(1300, 300, 230, 380, 16, C.deep, C.gold, 2) + para(1320, 350, "Guests are walled off from everything on board except the internet and, where allowed, their cabin TV. That protects them and the yacht.", { size: 20, width: 19, fill: C.white, lh: 1.45 });
  return svg(W, H, b);
}

// ── B3-2 Which network? (hotspot picture, 1600 × 1000) ───────────────────────
function wifiList() {
  let b = rect(0, 0, W, TALL, 0, "#e9edf3");
  b += phoneFrame(560, 40, 480, 920);
  b += txt(800, 140, "Wi-Fi", { size: 34, weight: 700, fill: C.ink, anchor: "middle" });
  b += rect(600, 180, 400, 70, 12, "#fff") + txt(620, 225, "Wi-Fi", { size: 24, fill: C.ink }) + rect(920, 198, 60, 34, 17, "#34c759") + circle(963, 215, 14, "#fff");
  b += txt(620, 300, "NETWORKS", { size: 17, weight: 700, fill: "#8a93a3", spacing: 1 });
  const nets = [["SERENITY-Crew", true], ["SERENITY-Guest", false], ["SERENITY-Office", true], ["Marina_Free_WiFi", false], ["SERENITY-Bridge", true]];
  b += rect(600, 315, 400, nets.length * 84, 12, "#fff");
  nets.forEach(([n, lock], i) => {
    const y = 315 + i * 84;
    if (i) b += line(620, y, 1000, y, "#e6eaf1", 2);
    b += txt(625, y + 52, n, { size: 25, fill: C.ink });
    if (lock) b += rect(925, y + 30, 18, 14, 3, "#8a93a3") + `<path d="M928 ${y + 30} v-5 a6 6 0 0 1 12 0 v5" fill="none" stroke="#8a93a3" stroke-width="3"/>`;
    b += `<path d="M955 ${y + 50} a22 22 0 0 1 30 0 M961 ${y + 56} a13 13 0 0 1 18 0" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/>` + circle(970, y + 62, 3, C.ink);
  });
  b += para(620, 800, "A guest asks you which Wi-Fi to join.", { size: 22, width: 32, fill: "#5b6476" });
  return svg(W, TALL, b, null);
}
export const WIFI_SPOTS = { guest: [spot(720, 315 + 84 + 42, 70), spot(880, 315 + 84 + 42, 70)] };

// ── B3-3 Wi-Fi or internet? (hotspot picture, 1600 × 1000) ───────────────────
function noInternet() {
  let b = rect(0, 0, W, TALL, 0, "#e9edf3");
  b += phoneFrame(560, 40, 480, 920);
  b += txt(800, 140, "Wi-Fi", { size: 34, weight: 700, fill: C.ink, anchor: "middle" });
  b += rect(600, 190, 400, 150, 12, "#fff");
  b += txt(625, 240, "✓  SERENITY-Guest", { size: 25, weight: 600, fill: BLUE });
  b += txt(655, 285, "No Internet Connection", { size: 22, fill: "#c42b1c" });
  b += `<path d="M955 225 a22 22 0 0 1 30 0 M961 231 a13 13 0 0 1 18 0" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/>` + circle(970, 237, 3, C.ink);
  b += txt(625, 320, "Signal: full bars", { size: 18, fill: "#8a93a3" });
  b += rect(600, 380, 400, 290, 12, "#fff");
  b += txt(625, 425, "Safari", { size: 22, weight: 700, fill: C.ink });
  b += txt(625, 480, "You are not connected", { size: 22, fill: C.ink }) + txt(625, 512, "to the internet.", { size: 22, fill: C.ink });
  b += para(625, 570, "This page can't be displayed because your iPhone is not connected to the internet.", { size: 18, width: 38, fill: "#5b6476", lh: 1.4 });
  b += para(620, 760, "The guest says \"the Wi-Fi is broken\".", { size: 22, width: 32, fill: "#5b6476" });
  return svg(W, TALL, b, null);
}
export const NOINTERNET_SPOTS = { sign: [spot(800, 285 - 8, 120)] };

// ── B3-4 Casting to the right cabin (hotspot picture, 1600 × 1000) ──────────
function airplay() {
  let b = rect(0, 0, W, TALL, 0, "#e9edf3");
  b += phoneFrame(560, 40, 480, 920);
  b += rect(600, 300, 400, 520, 20, "#ffffff");
  b += txt(800, 350, "Screen Mirroring", { size: 26, weight: 700, fill: C.ink, anchor: "middle" });
  const tvs = ["Master Cabin Apple TV", "Saloon Apple TV", "VIP Cabin Apple TV", "Guest Cabin 3 Apple TV", "Sky Lounge Apple TV"];
  tvs.forEach((t, i) => {
    const y = 380 + i * 80;
    b += rect(620, y, 360, 68, 12, "#f1f3f7") + rect(640, y + 20, 34, 26, 4, "none", C.ink, 3) + txt(690, y + 43, t, { size: 21, fill: C.ink });
  });
  b += rect(600, 850, 400, 60, 14, "#f1f3f7") + txt(800, 888, "You're in Guest Cabin 3", { size: 20, weight: 600, fill: "#5b6476", anchor: "middle" });
  return svg(W, TALL, b, null);
}
export const AIRPLAY_SPOTS = { cabin3: [spot(800, 380 + 3 * 80 + 34, 75)] };

// ── B5-1 Printer with a jam (hotspot picture, 1600 × 1000) ──────────────────
function printer() {
  let b = backdrop(W, TALL) + titleBlock(80, 90, "Printers", "Read the screen before you open anything");
  // body
  b += rect(420, 220, 760, 300, 24, "#d9dde4", "#9aa3b2", 3) + rect(460, 190, 680, 50, 10, "#c3c8d1");
  b += rect(500, 250, 420, 60, 6, "#2a2f38"); // output slot
  // display
  b += rect(960, 260, 190, 130, 10, "#10233f", "#4a5a78", 2) + txt(1055, 300, "Paper jam", { size: 20, weight: 700, fill: C.amber, anchor: "middle" }) +
    txt(1055, 332, "Open front", { size: 18, fill: "#fff", anchor: "middle" }) + txt(1055, 358, "door A", { size: 18, fill: "#fff", anchor: "middle" });
  b += circle(1000, 420, 14, C.green) + circle(1050, 420, 14, "#5a6578") + circle(1100, 420, 14, C.red);
  // front door A
  b += rect(450, 340, 460, 160, 10, "#c9ced6", "#9aa3b2", 2) + txt(680, 430, "A", { size: 44, weight: 700, fill: "#7a8394", anchor: "middle" });
  // trays
  b += rect(420, 520, 760, 120, 10, "#cfd3da", "#9aa3b2", 2) + txt(800, 590, "Tray 1", { size: 24, fill: "#5b6476", anchor: "middle" }) + rect(740, 600, 120, 14, 7, "#9aa3b2");
  b += rect(420, 650, 760, 120, 10, "#cfd3da", "#9aa3b2", 2) + txt(800, 720, "Tray 2", { size: 24, fill: "#5b6476", anchor: "middle" }) + rect(740, 730, 120, 14, 7, "#9aa3b2");
  b += rect(420, 780, 760, 40, 8, "#9aa3b2");
  b += g(1240, 300, 0.7, icon.warn()) + para(1310, 330, "Inside can be hot. Pull paper out slowly in the direction it travels.", { size: 20, width: 20, fill: C.white, lh: 1.4 });
  return svg(W, TALL, b);
}
export const PRINTER_SPOTS = { doorA: [spot(680, 420, 140)] };

// ── B6-1 Desk phone (hotspot picture, 1600 × 1000) ──────────────────────────
function deskPhone() {
  let b = backdrop(W, TALL) + titleBlock(80, 90, "Phones on board", "The desk handset");
  // body
  b += `<path d="M380 300 L1220 300 L1300 880 L300 880 Z" fill="#2a2f38" stroke="#4a5a78" stroke-width="3"/>`;
  b += rect(320, 230, 260, 640, 60, "#1f242c", "#4a5a78", 3); // handset
  // screen
  b += rect(640, 340, 420, 170, 10, "#cfe0f3") + txt(660, 380, "Bridge  ext 201", { size: 22, weight: 700, fill: C.ink }) + txt(660, 415, "Tue 20 Oct  14:32", { size: 18, fill: "#3b4556" }) + txt(660, 480, "1 new voicemail", { size: 18, fill: "#3b4556" });
  // line keys right
  ["Line 1", "Galley 214", "Captain 200", "Crew mess 230"].forEach((t, i) => { b += rect(1080, 340 + i * 44, 140, 36, 6, "#3a404b") + txt(1150, 364 + i * 44, t, { size: 15, fill: "#e8ebf0", anchor: "middle" }); });
  // soft keys
  const keys = [["Hold", 660], ["Transfer", 770], ["Conf", 880], ["Voicemail", 990]];
  keys.forEach(([t, x]) => { b += rect(x - 50, 530, 100, 46, 8, "#3a404b") + txt(x, 560, t, { size: 17, fill: "#e8ebf0", anchor: "middle" }); });
  // keypad
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].forEach((k, i) => {
    const c = i % 3, r = Math.floor(i / 3);
    b += rect(700 + c * 110, 610 + r * 62, 90, 50, 8, "#3a404b") + txt(745 + c * 110, 645 + r * 62, k, { size: 24, fill: "#e8ebf0", anchor: "middle" });
  });
  b += rect(1040, 630, 120, 50, 8, "#3a404b") + txt(1100, 662, "🔈", { size: 22, fill: "#e8ebf0", anchor: "middle" });
  b += rect(1040, 700, 120, 50, 8, "#3a404b") + txt(1100, 732, "Mute", { size: 18, fill: "#e8ebf0", anchor: "middle" });
  return svg(W, TALL, b);
}
export const PHONE_SPOTS = { transfer: [spot(770, 553, 55)], voicemail: [spot(990, 553, 55)] };

// ── B6-2 Satphone and GMDSS ──────────────────────────────────────────────────
function satphone() {
  let b = backdrop(W, H) + titleBlock(80, 90, "When the internet is down", "Satphone and GMDSS");
  // satphone
  b += rect(220, 300, 170, 440, 30, "#2a2f38", "#4a5a78", 3) + rect(270, 200, 40, 130, 14, "#3a404b") + rect(240, 340, 130, 110, 8, "#9cc3d9");
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b += rect(245 + c * 42, 480 + r * 54, 34, 40, 6, "#3a404b");
  b += txt(305, 790, "Satellite phone", { size: 22, weight: 600, fill: C.white, anchor: "middle" });
  b += rect(470, 260, 440, 520, 18, C.panel, C.gold, 2) + txt(500, 310, "Satphone", { size: 30, weight: 700, fill: C.white });
  ["For ship's business and emergencies", "Works when Starlink, VSAT and 4G don't", "Expensive per minute — not for personal calls", "Antenna up, outside, with a clear sky", "Kept charged where everyone knows", "Dialling instructions on its label"].forEach((t, i) => {
    b += g(500, 340 + i * 68, 0.38, icon.tick()) + txt(550, 368 + i * 68, t, { size: 21, fill: C.text });
  });
  // GMDSS
  b += rect(980, 260, 540, 520, 18, "#3a1414", C.red, 3) + txt(1010, 310, "GMDSS radio equipment", { size: 30, weight: 700, fill: "#ffb3ae" });
  b += para(1010, 360, "VHF / MF / HF DSC radios, satellite distress terminals and EPIRBs are for safety and distress — operated by the certified officers on the bridge.", { size: 21, width: 44, fill: C.white, lh: 1.45 });
  b += g(1010, 560, 0.7, icon.warn()) + para(1090, 590, "Never press a red DISTRESS button or test an EPIRB. A false alert launches a real search.", { size: 22, width: 32, weight: 600, fill: "#ffb3ae", lh: 1.4 });
  return svg(W, H, b);
}

export const PICTURES = {
  "g1-guest-network.png": guestMap,
  "g2-wifi-list.png": wifiList,
  "g3-no-internet.png": noInternet,
  "g4-airplay.png": airplay,
  "p1-printer.png": printer,
  "ph1-desk-phone.png": deskPhone,
  "ph2-satphone-gmdss.png": satphone,
};
export const ANIMATIONS = {};
