// Pictures for "Crew IT on board" (curriculum B1, the induction course).
import { C, txt, para, svg, g, rect, circle, line, backdrop, icon, titleBlock } from "../academy-cyber/art.mjs";

const W = 1600, H = 900;
const pct = (v) => +(v / W * 100).toFixed(2);
const spot = (x, y, r) => ({ x: pct(x), y: pct(y), r: pct(r) });

// ── 1. Which network? ───────────────────────────────────────────────────────
function whichNetwork() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Wi-Fi on board", "Which network is yours?");
  const cards = [
    ["Crew Wi-Fi", "YOUR network", "Your phone, tablet and laptop. Password from the crew mess notice or your HoD.", icon.tick(C.green), C.green],
    ["Guest Wi-Fi", "Guests only", "Never join it — and never give guests the crew password instead.", icon.cross(C.amber), C.amber],
    ["Ship's office", "Ship's laptops only", "Set up by IT. Don't join personal devices to it.", icon.cross(C.amber), C.amber],
    ["Bridge & engine", "Never", "Navigation and engine systems. Nothing personal, ever.", icon.cross(C.red), C.red],
  ];
  const cw = 340, gap = 26, x0 = (W - (cw * 4 + gap * 3)) / 2;
  cards.forEach(([t, tag, d, ic, col], i) => {
    const x = x0 + i * (cw + gap), y = 230;
    b += rect(x, y, cw, 540, 20, C.panel, col, 3);
    b += `<path d="M${x + cw / 2 - 70} ${y + 120} a100 100 0 0 1 140 0 M${x + cw / 2 - 45} ${y + 145} a64 64 0 0 1 90 0 M${x + cw / 2 - 20} ${y + 170} a28 28 0 0 1 40 0" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round"/>` + circle(x + cw / 2, y + 192, 9, col);
    b += g(x + cw - 76, y + 20, 0.55, ic);
    b += txt(x + 30, y + 270, t, { size: 34, weight: 700, fill: C.white });
    b += txt(x + 30, y + 312, tag.toUpperCase(), { size: 18, weight: 700, fill: col, spacing: 2 });
    b += para(x + 30, y + 360, d, { size: 23, width: 26, fill: C.text, lh: 1.4 });
  });
  b += txt(W / 2, 840, "Network names differ from yacht to yacht — your HoD will tell you which one is the crew network.", { size: 23, fill: C.muted, anchor: "middle" });
  return svg(W, H, b);
}

// ── 2. Sharing the connection ───────────────────────────────────────────────
function dataUse() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Internet at sea", "One connection, shared by everyone on board");
  // gauge
  const cx = 360, cy = 520, r = 220;
  const arc = (a0, a1, col) => {
    const p = (a) => [cx + r * Math.cos(Math.PI * (1 - a)), cy - r * Math.sin(Math.PI * (1 - a))];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `<path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" fill="none" stroke="${col}" stroke-width="44"/>`;
  };
  b += arc(0, 0.55, C.green) + arc(0.55, 0.8, C.amber) + arc(0.8, 1, C.red);
  b += line(cx, cy, cx + (r - 40) * Math.cos(Math.PI * 0.32), cy - (r - 40) * Math.sin(Math.PI * 0.32), C.white, 8) + circle(cx, cy, 18, C.white);
  b += txt(cx, cy + 70, "Busy charter evening", { size: 26, weight: 700, fill: C.white, anchor: "middle" });
  b += para(cx - 210, cy + 120, "Starlink, VSAT and 4G are shared by guests, crew and the ship's systems — and guests come first.", { size: 21, width: 40, fill: C.muted, lh: 1.4 });
  // heavy vs kind
  b += rect(700, 210, 380, 600, 18, C.panel, C.red, 2) + txt(730, 262, "Heavy on the link", { size: 28, weight: 700, fill: "#ffb3ae" });
  ["4K / HD streaming", "Phone & photo backups", "Game and app updates", "Big downloads", "Torrents (not allowed)", "VPNs — only if allowed"].forEach((t, i) => {
    b += g(730, 300 + i * 78, 0.4, icon.warn()) + txt(785, 330 + i * 78, t, { size: 23, fill: C.text });
  });
  b += rect(1120, 210, 400, 600, 18, C.panel, C.green, 2) + txt(1150, 262, "Kind to everyone", { size: 28, weight: 700, fill: "#b9f0d0" });
  ["Download shows in port", "Updates and backups at night", "Lower video quality at sea", "Photos: back up in port", "Close apps you're not using", "Ask before a big download"].forEach((t, i) => {
    b += g(1150, 302 + i * 78, 0.4, icon.tick()) + txt(1205, 330 + i * 78, t, { size: 23, fill: C.text });
  });
  return svg(W, H, b);
}

// ── 3. A good request vs a bad one (hotspot picture, 1600 × 1000) ───────────
const TH = 1000;
function goodRequest() {
  let b = rect(0, 0, W, TH, 0, "#e9edf3");
  const card = (x, title, lines, ok) => {
    let s = rect(x, 90, 700, 820, 16, "#ffffff", ok ? "#1e8e3e" : "#c42b1c", 4);
    s += rect(x, 90, 700, 70, 16, ok ? "#e6f4ea" : "#fde8e7") + rect(x, 146, 700, 14, 0, ok ? "#e6f4ea" : "#fde8e7");
    s += txt(x + 30, 136, title, { size: 26, weight: 700, fill: ok ? "#1e8e3e" : "#b3261e" });
    lines.forEach(([label, value], i) => {
      const y = 205 + i * 120;
      s += txt(x + 30, y, label.toUpperCase(), { size: 16, weight: 700, fill: "#8a93a3", spacing: 1 });
      s += para(x + 30, y + 34, value, { size: 23, width: 50, fill: C.ink, lh: 1.35 });
    });
    return s;
  };
  b += card(60, "Request A", [
    ["Subject", "INTERNET BROKEN!!!"],
    ["Where", "—"],
    ["What happened", "nothing works, please fix asap"],
    ["When", "—"],
    ["Tried", "—"],
    ["Photo", "—"],
  ], false);
  b += card(840, "Request B", [
    ["Subject", "Crew Wi-Fi drops every 10 minutes in the crew mess"],
    ["Where", "Crew mess, lower deck. Cabin 6 is fine."],
    ["What happened", "Phone and laptop both lose Wi-Fi for about a minute, then reconnect."],
    ["When", "Since about 07:00 today."],
    ["Tried", "Forgot the network and rejoined; restarted the phone."],
    ["Photo", "Screenshot of the error attached. — Sam, ext 214"],
  ], true);
  return svg(W, TH, b, null);
}
export const TICKET_SPOTS = { good: [spot(1190, 400, 260), spot(1190, 700, 260)] };

export const PICTURES = {
  "i1-which-network.png": whichNetwork,
  "i2-data-use.png": dataUse,
  "i3-good-request.png": goodRequest,
};
export const ANIMATIONS = {};
