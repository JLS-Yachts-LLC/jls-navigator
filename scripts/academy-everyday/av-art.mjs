// Pictures and animation for "AV first-line troubleshooting — guest areas" (curriculum B4).
// Drawn with the cyber course kit (../academy-cyber/art.mjs). Generic equipment only —
// no brand logos; brand names appear only as plain words where crew will recognise them.
import { C, SERIF, txt, para, svg, g, rect, circle, line, backdrop, icon, titleBlock, captionBar } from "../academy-cyber/art.mjs";

const W = 1600, H = 900;
const pct = (v) => +(v / W * 100).toFixed(2);
const spot = (x, y, r) => ({ x: pct(x), y: pct(y), r: pct(r) });

// Small equipment boxes used in the signal path picture and the animation.
const unit = (x, y, w, label, sub, col = C.panel2, glow = 0) =>
  (glow ? rect(x - 6, y - 6, w + 12, 88, 14, "none", C.gold, 3, `opacity="${glow}"`) : "") +
  rect(x, y, w, 76, 10, col, C.line, 2) + circle(x + 20, y + 38, 6, C.green) +
  txt(x + 38, y + 34, label, { size: 22, weight: 700, fill: C.white }) + (sub ? txt(x + 38, y + 60, sub, { size: 16, fill: C.muted }) : "");

function tvShape(x, y, w, h, screen = "#0a1424", content = "") {
  return rect(x, y, w, h, 8, "#11161f", "#3a465e", 3) + rect(x + 10, y + 10, w - 20, h - 20, 3, screen) + content +
    rect(x + w / 2 - 40, y + h, 80, 14, 3, "#3a465e") + rect(x + w / 2 - 90, y + h + 14, 180, 8, 4, "#3a465e");
}
const picture = (x, y, w, h) => // a simple "sunset" picture on a TV
  `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6a35b"/><stop offset="1" stop-color="#7b3f8c"/></linearGradient></defs>` +
  rect(x, y, w, h * 0.62, 0, "url(#sky)") + circle(x + w * 0.62, y + h * 0.5, h * 0.14, "#ffd88a") + rect(x, y + h * 0.62, w, h * 0.38, 0, "#1d4f7c");

// ── 1. How the picture gets to the TV ───────────────────────────────────────
export function signalPath(state = {}) {
  const { glow = {}, body = "" } = state;
  let b = backdrop(W, H) + titleBlock(80, 90, "How it works", "From the rack to the cabin TV");
  // rack
  b += rect(80, 190, 470, 620, 18, "#0a1530", C.red, 2, 'stroke-dasharray="12 8"');
  b += txt(100, 228, "AV RACK — ETO ONLY", { size: 20, weight: 700, fill: "#ffb3ae", spacing: 2 });
  b += unit(110, 250, 410, "Apple TV", "streaming apps", C.panel2, glow.source ?? 0);
  b += unit(110, 345, 410, "Movie server", "e.g. Kaleidescape");
  b += unit(110, 440, 410, "Satellite TV box", "live channels");
  b += unit(110, 535, 410, "Music streamer", "e.g. Sonos");
  b += unit(110, 690, 410, "Control processor", "runs the touch panels", "#3a2a2a", glow.control ?? 0);
  // matrix
  b += rect(640, 380, 260, 150, 14, "#1a2f5c", C.gold, 3) + txt(770, 445, "Matrix", { size: 30, weight: 700, fill: C.white, anchor: "middle" }) +
    txt(770, 480, "picks which source", { size: 18, fill: C.muted, anchor: "middle" }) + txt(770, 502, "goes to which room", { size: 18, fill: C.muted, anchor: "middle" });
  if (glow.matrix) b += rect(632, 372, 276, 166, 18, "none", C.gold, 3, `opacity="${glow.matrix}"`);
  for (const y of [288, 383, 478, 573]) b += line(520, y, 640, 455, C.line, 3);
  // cable to the cabin
  b += line(900, 455, 1130, 455, C.teal, 6, 'stroke-dasharray="2 10"') + txt(1015, 430, "network cable", { size: 18, fill: C.teal, anchor: "middle" }) + txt(1015, 492, "(HDBaseT)", { size: 16, fill: C.muted, anchor: "middle" });
  // receiver + TV
  b += rect(1130, 420, 110, 70, 8, "#283245", "#4a5a78", 2) + txt(1185, 520, "Receiver", { size: 18, fill: C.muted, anchor: "middle" }) + txt(1185, 542, "behind the TV", { size: 16, fill: C.muted, anchor: "middle" });
  if (glow.receiver) b += rect(1124, 414, 122, 82, 10, "none", C.gold, 3, `opacity="${glow.receiver}"`);
  b += line(1240, 455, 1290, 455, C.line, 4);
  b += tvShape(1290, 330, 260, 160, "#0a1424", glow.tv ? picture(1300, 340, 240, 140) : "");
  b += txt(1420, 545, "Main saloon TV", { size: 20, weight: 600, fill: C.white, anchor: "middle" });
  // touch panel and its link to the control processor
  b += rect(1330, 620, 180, 120, 12, "#1c2230", "#4a5a78", 3) + rect(1342, 632, 156, 96, 6, C.panel2) +
    txt(1420, 670, "Touch panel", { size: 18, fill: C.white, anchor: "middle" }) + txt(1420, 696, "or remote", { size: 16, fill: C.muted, anchor: "middle" });
  if (glow.panel) b += rect(1322, 612, 196, 136, 14, "none", C.gold, 3, `opacity="${glow.panel}"`);
  b += `<path d="M520 728 C900 820 1150 790 1330 690" fill="none" stroke="${C.amber}" stroke-width="3" stroke-dasharray="10 8"/>`;
  b += txt(930, 800, "the panel talks to the control processor, which tells everything else what to do", { size: 18, fill: C.amber, anchor: "middle" });
  return b + body;
}
const signalPicture = () => svg(W, H, signalPath({ glow: {} }));

// ── 2. A touch panel (hotspot picture, 1600 × 1000) ──────────────────────────
const PH = 1000;
function touchPanel() {
  let b = rect(0, 0, W, PH, 0, "#d9dee7");
  b += rect(260, 60, 1080, 880, 48, "#14181f", "#3a4352", 4) + rect(300, 100, 1000, 800, 14, "#0f1b33");
  // header
  b += txt(340, 160, "MAIN SALOON", { size: 34, weight: 700, fill: C.white, spacing: 2 });
  b += rect(1090, 122, 180, 56, 28, "#1e2e52", "#3a5288", 2) + txt(1180, 158, "Rooms ▾", { size: 24, fill: C.white, anchor: "middle" });
  b += txt(340, 200, "Now playing: nothing", { size: 20, fill: C.muted });
  // source tiles
  const tiles = [["Apple TV", "▶"], ["Movies", "🎬"], ["TV", "📺"], ["Music", "♫"], ["Lights", "💡"], ["Blinds", "▤"]];
  tiles.forEach(([t, ic], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 340 + col * 315, y = 240 + row * 230;
    b += rect(x, y, 290, 200, 18, i < 4 ? "#1f3b6e" : "#1b2a45", "#3a5288", 2);
    b += txt(x + 145, y + 100, ic, { size: 54, fill: C.white, anchor: "middle" });
    b += txt(x + 145, y + 165, t, { size: 28, weight: 600, fill: C.white, anchor: "middle" });
  });
  // bottom bar
  b += rect(340, 720, 920, 140, 18, "#16233f");
  b += circle(420, 790, 42, "#24365e") + txt(420, 803, "−", { size: 44, fill: C.white, anchor: "middle" });
  b += rect(480, 778, 300, 24, 12, "#24365e") + rect(480, 778, 120, 24, 12, C.teal);
  b += circle(840, 790, 42, "#24365e") + txt(840, 805, "+", { size: 44, fill: C.white, anchor: "middle" });
  b += txt(930, 800, "🔇", { size: 34, fill: C.white });
  b += rect(1040, 750, 200, 80, 16, "#7a2622", C.red, 2) + txt(1140, 800, "Room off", { size: 26, weight: 700, fill: C.white, anchor: "middle" });
  return svg(W, PH, b, null);
}
export const PANEL_SPOTS = {
  appletv: [spot(485, 340, 120)],
  roomoff: [spot(1140, 790, 85)],
  rooms: [spot(1180, 150, 80)],
};

// ── 3. The remote (hotspot picture, 1600 × 1000) ────────────────────────────
function remote() {
  let b = backdrop(W, PH);
  b += titleBlock(80, 90, "Apple TV remote", "Restart it from the remote");
  // remote body
  const rx = 780, ry = 150, rw = 220, rh = 820;
  b += rect(rx, ry, rw, rh, 60, "#c9ced6", "#9aa3b2", 3);
  b += circle(rx + rw / 2, ry + 150, 92, "#2a2f38") + circle(rx + rw / 2, ry + 150, 40, "#3a404b"); // clickpad
  b += circle(rx + rw - 40, ry + 40, 16, "#2a2f38") + txt(rx + rw - 40, ry + 47, "⏻", { size: 18, fill: "#d8dce3", anchor: "middle" }); // power
  const btn = (cx, cy, label, size = 22) => circle(cx, cy, 40, "#2a2f38") + txt(cx, cy + size / 3, label, { size, fill: "#e8ebf0", anchor: "middle" });
  b += btn(rx + 60, ry + 320, "‹", 40) + btn(rx + 160, ry + 320, "▭", 30); // Back, TV
  b += btn(rx + 60, ry + 420, "⏯", 26) + btn(rx + 160, ry + 420, "🔇", 24);
  b += rect(rx + 125, ry + 480, 70, 200, 35, "#2a2f38") + txt(rx + 160, ry + 540, "+", { size: 34, fill: "#e8ebf0", anchor: "middle" }) + txt(rx + 160, ry + 640, "−", { size: 34, fill: "#e8ebf0", anchor: "middle" });
  b += rect(rx + rw - 4, ry + 260, 12, 70, 5, "#9aa3b2"); // Siri side button
  // labels
  const lab = (x1, y1, x2, y2, t) => line(x1, y1, x2, y2, C.muted, 2) + txt(x2 + (x2 > x1 ? 12 : -12), y2 + 8, t, { size: 22, fill: C.text, anchor: x2 > x1 ? "start" : "end" });
  b += lab(rx + 20, ry + 320, 630, ry + 320, "Back");
  b += lab(rx + 70, ry + 150, 630, ry + 150, "Touch / click pad");
  b += lab(rx + 200, ry + 420, 1120, ry + 420, "Mute");
  b += lab(rx + 195, ry + 580, 1120, ry + 580, "Volume");
  b += lab(rx + rw - 24, ry + 40, 1120, ry + 40, "Power");
  b += lab(rx + 20, ry + 420, 630, ry + 420, "Play / pause");
  b += rect(1080, 660, 460, 220, 16, C.panel, C.gold, 2);
  b += para(1105, 710, "Restart: hold Back and one other button together until the light on the Apple TV flashes. Then let go.", { size: 24, width: 31, fill: C.white, lh: 1.4 });
  return svg(W, PH, b);
}
export const REMOTE_SPOTS = { tv: [spot(780 + 160, 150 + 320, 55)] };

// ── 4. The reboot ladder ─────────────────────────────────────────────────────
function ladder() {
  let b = backdrop(W, H) + titleBlock(80, 90, "The reboot ladder", "Start at the bottom. Stop when it works.");
  const steps = [
    ["Check the panel", "Right room? Right source? Volume up and not muted?", C.green],
    ["Room off, then on", "Use \"Room off\" on the panel, wait 30 seconds, choose the source again.", C.teal],
    ["Restart the source", "Only the one that's stuck — e.g. restart the Apple TV from its menu or remote.", C.gold],
    ["Call the ETO", "Say which room, which source, what you see — and what you've tried.", C.red],
  ];
  steps.forEach(([t, d, col], i) => {
    const x = 120 + i * 300, y = 640 - i * 120, w = 440;
    b += rect(x, y, w, 150, 16, C.panel, col, 3);
    b += circle(x + 40, y + 42, 24, col) + txt(x + 40, y + 51, String(i + 1), { size: 24, weight: 700, fill: C.bg, anchor: "middle" });
    b += txt(x + 80, y + 52, t, { size: 28, weight: 700, fill: C.white });
    b += para(x + 30, y + 92, d, { size: 20, width: 40, fill: C.text, lh: 1.35 });
  });
  b += rect(120, 220, 560, 200, 16, "#3a1414", C.red, 3);
  b += g(140, 240, 0.55, icon.cross());
  b += txt(210, 272, "Never", { size: 30, weight: 700, fill: "#ffb3ae" });
  b += para(145, 320, "Unplug or switch off anything in the AV rack, the control processor, network switches or the box behind the TV.", { size: 21, width: 46, fill: C.white, lh: 1.4 });
  return svg(W, H, b);
}

// ── Animation: where the picture goes ───────────────────────────────────────
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (x) => x * x * (3 - 2 * x);
const ramp = (t, t0, t1) => smooth(clamp((t - t0) / (t1 - t0)));
const vis = (t, t0, t1, d = 0.4) => Math.min(ramp(t, t0, t0 + d), 1 - ramp(t, t1 - d, t1));
const op = (o, s) => (o <= 0.001 ? "" : `<g opacity="${o.toFixed(3)}">${s}</g>`);
const captions = (t, list) => list.map(([t0, t1, s, sub]) => { const o = vis(t, t0, t1, 0.35); return o > 0 ? captionBar(W, H, s, { opacity: o, sub }) : ""; }).join("");

function wherePicture(t) {
  let b = "";
  const title = vis(t, 0, 3.4, 0.5);
  if (title > 0) {
    b += backdrop(W, H) + op(title, txt(W / 2, 360, "HOW IT WORKS", { size: 24, weight: 700, fill: C.gold, anchor: "middle", spacing: 4 }) +
      txt(W / 2, 450, "Where the picture goes", { size: 72, family: SERIF, fill: C.white, anchor: "middle" }) +
      txt(W / 2, 520, "…and where it can get stuck", { size: 30, fill: C.muted, anchor: "middle" }));
    return b;
  }
  // travelling signal: panel → control → source → matrix → receiver → TV
  const pts = [[1420, 680], [520, 728], [520, 288], [770, 455], [1185, 455], [1420, 410]];
  const legs = [[3.6, 5.4], [5.4, 6.6], [6.6, 8.0], [8.0, 9.6], [9.6, 10.6]];
  let dot = "";
  legs.forEach(([a, z], i) => {
    if (t >= a && t < z) {
      const p = ramp(t, a, z);
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      dot = circle(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p, 12, C.gold) + circle(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p, 24, "none", C.gold, 3, 'opacity="0.5"');
    }
  });
  const glow = {
    panel: vis(t, 3.4, 5.8), control: vis(t, 5.2, 7.0), source: vis(t, 6.5, 8.4), matrix: vis(t, 7.9, 10.0), receiver: vis(t, 9.5, 11),
    tv: t > 10.5 && t < 13.5 ? 1 : 0,
  };
  // fault points (13.5 – 27)
  const faults = [
    [13.6, [1420, 680], "1", "Panel: wrong room or source", "Check the panel first"],
    [16.6, [1420, 410], "2", "TV off or on the wrong input", "Room off, then on, from the panel"],
    [19.6, [520, 288], "3", "Apple TV frozen", "Restart just the Apple TV"],
    [22.6, [960, 455], "4", "Matrix, cable or receiver", "Call the ETO — rack is hands off"],
  ];
  let f = "";
  for (const [t0, [x, y], n, what, fix] of faults) {
    const o = ramp(t, t0, t0 + 0.5);
    if (o <= 0) continue;
    const pulse = 1 + 0.08 * Math.sin((t - t0) * 6);
    f += op(o, circle(x, y, 34 * pulse, C.red) + txt(x, y + 11, n, { size: 30, weight: 800, fill: C.white, anchor: "middle" }));
  }
  const cur = faults.filter(([t0]) => t >= t0).pop();
  let card = "";
  if (cur && t < 26.6) {
    const [t0, , n, what, fix] = cur;
    const o = vis(t, t0, t0 + 3, 0.3);
    card = op(o, rect(600, 570, 500, 110, 16, C.deep, C.red, 3) + txt(630, 615, `${n}  ${what}`, { size: 26, weight: 700, fill: "#ffb3ae" }) + txt(630, 655, `→ ${fix}`, { size: 24, fill: C.white }));
  }
  b += signalPath({ glow, body: dot + f + card });
  b += captions(t, [
    [3.6, 6.6, "You choose Apple TV on the touch panel…"],
    [6.7, 9.6, "…the control processor switches the source on and the matrix routes it…"],
    [9.7, 13.4, "…down a network cable to the box behind the TV — and the picture appears."],
    [13.5, 26.6, "When it doesn't, the fault is at one of four points.", "Work up the reboot ladder: 1, 2, 3 — then 4 is the ETO's job."],
  ]);
  // end card
  const e = ramp(t, 26.8, 27.4);
  if (e > 0) b += op(e, rect(0, 0, W, H, 0, C.bg) + backdrop(W, H) + g(W / 2 - 60, 230, 1.2, icon.shield()) +
    txt(W / 2, 480, "Work up the ladder.", { size: 54, family: SERIF, fill: C.white, anchor: "middle" }) +
    txt(W / 2, 550, "And leave the rack to the ETO.", { size: 30, fill: C.muted, anchor: "middle" }));
  return b;
}

export const PICTURES = {
  "av1-signal-path.png": signalPicture,
  "av2-touch-panel.png": touchPanel,
  "av3-remote.png": remote,
  "av4-reboot-ladder.png": ladder,
};
export const ANIMATIONS = {
  "av5-where-the-picture-goes.mp4": { seconds: 30, frame: wherePicture },
};
