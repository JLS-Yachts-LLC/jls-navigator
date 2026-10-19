// Still pictures for "Living and working in the UAE — a guide for crew".
// Each entry: file name → () => SVG (1600 × 900; the hotspot scene is 1600 × 1000).
// Generic skyline and marina only — no real buildings. Faceless shared figures from
// ../people.mjs with varied skin and hair. Hotspot exercises read SPOTS below
// (x, y, r as percentages of the picture's WIDTH, as the course player expects).
import { C, SERIF, txt, para, svg, g, rect, circle, line, backdrop, icon, yacht, waves, titleBlock } from "../../academy-cyber/art.mjs";
import { person, bust, prop, UNIFORM, SKIN, HAIR } from "../people.mjs";
import { spotsFor } from "../blocks.mjs";

const W = 1600, H = 900;
const spot = spotsFor(W);

// ── Shared drawing helpers (also used by the animations) ────────────────────
/** A4-ish document with a folded corner and text lines, in a 100 × 100 box. */
export const docIcon = (fill = C.paper, accent = C.gold) =>
  `<path d="M22 6 H64 L80 22 V94 H22 Z" fill="${fill}" stroke="#9fb0d4" stroke-width="2"/>` + `<path d="M64 6 V22 H80" fill="#d9e0ee"/>` +
  rect(30, 32, 34, 5, 2, accent) + [44, 54, 64, 74].map((y) => rect(30, y, 42, 4, 2, "#b8c2d6")).join("");
/** Side-view airliner, ~100 × 50. */
export const plane = (fill = C.white) =>
  `<path d="M4 26 Q4 18 16 18 H78 Q96 18 98 26 Q96 32 80 32 H16 Q4 32 4 26 Z" fill="${fill}"/>` +
  `<path d="M40 24 L62 24 L46 48 L36 48 Z" fill="${fill}" opacity="0.9"/>` + `<path d="M8 20 L4 4 L14 4 L24 20 Z" fill="${fill}"/>` +
  [0, 1, 2, 3, 4, 5].map((i) => rect(30 + i * 8, 21, 5, 4, 1, "#5a7fa8")).join("");
/** Fingerprint in a 100 × 100 box. */
export const fingerprint = (stroke = C.teal) =>
  [40, 32, 24, 16, 8].map((r) => `<path d="M${50 - r} ${62} A ${r} ${r * 1.2} 0 0 1 ${50 + r} ${62} V ${70 + (40 - r) / 3}" fill="none" stroke="${stroke}" stroke-width="4" stroke-linecap="round"/>`).join("") +
  `<path d="M50 62 V 88" fill="none" stroke="${stroke}" stroke-width="4" stroke-linecap="round"/>`;
/** Generic resident ID card, 300 × 190 (not a copy of the real design). */
export function idCard(o = {}) {
  const { skin = SKIN[2], hair = HAIR[0] } = o;
  return rect(0, 0, 300, 190, 16, "#eef3f8", "#9fb0d4", 2) + rect(0, 0, 300, 44, 16, "#1f6f5c") + rect(0, 30, 300, 14, 0, "#1f6f5c") +
    txt(18, 30, "EMIRATES ID", { size: 20, weight: 700, fill: C.white, spacing: 2 }) +
    rect(18, 60, 84, 108, 8, "#c9d3e2") + `<g transform="translate(18 66) scale(0.84)">${bust({ skin, hair, shirt: "#5a7fa8" })}</g>` +
    [70, 96, 122, 148].map((y, i) => rect(120, y, [150, 120, 160, 90][i], 10, 5, i ? "#b8c2d6" : "#7a8aa6")).join("") +
    rect(232, 140, 46, 34, 5, "#d4a62a", "#a37d17", 1.5);
}
/** Generic tower skyline between x0 and x1 standing on baseY. Deterministic. */
export function skyline(x0, x1, baseY, o = {}) {
  const { fill = "#0b1a3a", lit = "#f3c766", lights = true, scale = 1 } = o;
  const towers = [[0, 60, 230], [64, 46, 300], [114, 70, 260], [190, 40, 420], [236, 74, 330], [316, 52, 250], [374, 38, 370], [418, 80, 290],
    [504, 56, 470], [566, 44, 340], [616, 70, 240], [692, 48, 380], [746, 66, 300], [818, 40, 260], [864, 72, 350], [942, 50, 280], [998, 64, 220]];
  let s = "";
  const span = 1062, k = (x1 - x0) / span;
  for (const [i, [x, w, h]] of towers.entries()) {
    const X = x0 + x * k, Wd = w * k, Ht = h * scale;
    if (i === 8) s += `<path d="M${X} ${baseY} V${baseY - Ht + 60} L${X + Wd / 2} ${baseY - Ht - 30} L${X + Wd} ${baseY - Ht + 60} V${baseY} Z" fill="${fill}"/>`;
    else s += rect(X, baseY - Ht, Wd, Ht, 3, fill);
    if (lights) for (let r = 0; r < Ht / 26 - 1; r++) for (let c = 0; c < Math.floor(Wd / 16); c++) {
      if ((i * 7 + r * 3 + c * 5) % 4 === 0) s += rect(X + 6 + c * 16, baseY - Ht + 18 + r * 26, 6, 9, 1, lit, "none", 0, 'opacity="0.8"');
    }
  }
  return s;
}
/** Palm tree, trunk base at (0,0), ~ 260 tall. */
export function palm(fill = "#1f5a46", trunk = "#7a5a3a") {
  let s = `<path d="M-8 0 Q-2 -130 14 -250 L24 -250 Q10 -130 8 0 Z" fill="${trunk}"/>`;
  for (const [a, l] of [[-160, 140], [-130, 120], [-95, 110], [-60, 120], [-25, 140], [10, 110]]) {
    const r = a * Math.PI / 180, ex = 19 + Math.cos(r) * l, ey = -250 + Math.sin(r) * l * 0.6 + 40;
    s += `<path d="M19 -250 Q ${19 + Math.cos(r) * l * 0.5} ${-250 + Math.sin(r) * l * 0.5 - 30} ${ex} ${ey} Q ${19 + Math.cos(r) * l * 0.55} ${-250 + Math.sin(r) * l * 0.4 - 6} 19 -246 Z" fill="${fill}"/>`;
  }
  return s;
}
const crescent = (x, y, r, fill = "#f3d27a", bg = C.deep) => circle(x, y, r, fill) + circle(x + r * 0.42, y - r * 0.18, r * 0.86, bg);

// ── 1. Cover ────────────────────────────────────────────────────────────────
function cover() {
  let b = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1a3e"/><stop offset="0.55" stop-color="#3a3f6e"/><stop offset="0.85" stop-color="#c47a4a"/><stop offset="1" stop-color="#e9a95a"/></linearGradient>` +
    `<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a5a5e"/><stop offset="0.25" stop-color="#1d3a6b"/><stop offset="1" stop-color="#0b1d40"/></linearGradient></defs>`;
  b += rect(0, 0, W, 640, 0, "url(#sky)");
  b += circle(1180, 610, 70, "#f6c76a", "none", 0, 'opacity="0.95"');
  b += skyline(120, 1500, 640, { fill: "#101c3c", scale: 0.78 });
  b += rect(0, 638, W, 262, 0, "url(#sea)");
  for (let i = 0; i < 14; i++) b += rect(1120 + (i % 3) * 20 - 30, 660 + i * 14, 120 - i * 6, 3, 1.5, "#f6c76a", "none", 0, `opacity="${(0.5 - i * 0.03).toFixed(2)}"`);
  b += waves(W, 780, 0.5, "#0d2250");
  // pontoon + yacht
  b += rect(0, 806, W, 16, 0, "#4a3a2e") + [...Array(17)].map((_, i) => rect(40 + i * 96, 822, 12, 60, 2, "#3a2d24")).join("");
  b += g(180, 640, 1, yacht("#f4f6fa", C.gold, "#1d3d6e"));
  b += g(728, 682, 0.62, prop.flag());
  b += g(1250, 806, 1, palm("#16352e", "#3f3024"));
  b += txt(W / 2, 92, "CREW ACADEMY · CREW LIFE", { size: 22, weight: 700, fill: C.gold, anchor: "middle", spacing: 4 });
  b += txt(W / 2, 180, "Living and working in the UAE", { size: 72, family: SERIF, fill: C.white, anchor: "middle" });
  b += txt(W / 2, 236, "A guide for crew in Dubai and Abu Dhabi", { size: 32, fill: "#e8dcc6", anchor: "middle" });
  return svg(W, H, b);
}

// ── 2. Visa steps ───────────────────────────────────────────────────────────
function visaSteps() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Arriving and your visa", "The usual steps to a UAE residence visa");
  const steps = [
    ["Entry permit", "JLS applies. You get an electronic entry permit, with your Arrival Instructions.", docIcon()],
    ["Fly in", "Bring your passport, entry permit and the Arrival Instructions.", g(0, 25, 1, plane())],
    ["Medical test", "At an approved centre: usually a blood test and a chest X-ray.", rect(20, 34, 60, 60, 10, C.paper) + rect(44, 44, 12, 40, 2, C.red) + rect(30, 58, 40, 12, 2, C.red) + rect(36, 14, 28, 24, 6, "none", "#9fb0d4", 6)],
    ["Biometrics", "Fingerprints and a photo for your Emirates ID.", fingerprint()],
    ["Residence visa", "Issued electronically and linked to your Emirates ID card.", g(0, 20, 0.33, idCard())],
  ];
  const cw = 268, gap = 22, x0 = (W - (cw * 5 + gap * 4)) / 2, y = 230;
  steps.forEach(([t, d, ic], i) => {
    const x = x0 + i * (cw + gap);
    if (i) b += `<path d="M${x - gap + 2} ${y + 120} l${gap - 6} 0" stroke="${C.gold}" stroke-width="4"/>` + `<path d="M${x - 6} ${y + 112} l8 8 l-8 8" fill="none" stroke="${C.gold}" stroke-width="4"/>`;
    b += rect(x, y, cw, 470, 18, C.panel, i >= 2 && i <= 3 ? C.teal : C.line, 2);
    b += circle(x + cw / 2, y + 120, 76, C.deep) + g(x + cw / 2 - 50, y + 70, 1, ic);
    b += circle(x + 36, y + 36, 22, C.gold) + txt(x + 36, y + 45, String(i + 1), { size: 24, weight: 700, fill: C.bg, anchor: "middle" });
    b += txt(x + 24, y + 256, t, { size: 30, weight: 700, fill: C.white });
    b += para(x + 24, y + 300, d, { size: 23, width: 20, fill: C.text, lh: 1.4 });
  });
  // steps 3 and 4 can swap
  const xa = x0 + 2 * (cw + gap), xb = x0 + 3 * (cw + gap) + cw;
  b += `<path d="M${xa + cw / 2} ${y + 482} V ${y + 500} H ${xb - cw / 2} V ${y + 482}" fill="none" stroke="${C.teal}" stroke-width="3"/>`;
  b += txt((xa + xb) / 2, y + 532, "Steps 3 and 4 can come in either order", { size: 22, fill: C.teal, anchor: "middle" });
  b += txt(W / 2, 852, "The order and timing can vary. JLS books your appointments and will tell you what happens when.", { size: 25, weight: 600, fill: C.gold, anchor: "middle" });
  return svg(W, H, b);
}

// ── 3. Packing your medicines ───────────────────────────────────────────────
function medicines() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Drugs and medicines", "Packing your medicines for the UAE");
  // wash bag with contents
  b += rect(90, 250, 600, 500, 26, "#24375f", C.line, 2);
  b += rect(90, 250, 600, 70, 26, "#2f4677") + rect(90, 290, 600, 30, 0, "#2f4677") + rect(140, 280, 500, 8, 4, "#8e98ab");
  b += g(130, 380, 1.6, prop.pills()) + txt(210, 560, "Original packs", { size: 22, fill: C.text, anchor: "middle" });
  b += g(330, 360, 1.7, prop.bottle("#d97a3a")) + txt(415, 560, "with labels", { size: 22, fill: C.text, anchor: "middle" });
  // prescription
  b += `<g transform="rotate(-6 590 470)">` + rect(500, 350, 170, 230, 8, C.paper, "#9fb0d4", 2) + txt(520, 392, "Rx", { size: 34, weight: 700, fill: "#2b5fb8", family: SERIF }) +
    [420, 444, 468, 492, 516].map((y, i) => rect(520, y, [120, 96, 130, 80, 110][i], 7, 3, "#b8c2d6")).join("") + txt(520, 560, "Prescription", { size: 18, weight: 700, fill: C.ink }) + `</g>`;
  b += g(150, 600, 1.2, prop.passport());
  b += txt(390, 680, "In your hand luggage, with the", { size: 22, fill: C.muted, anchor: "middle" }) + txt(390, 710, "prescription in your name", { size: 22, fill: C.muted, anchor: "middle" });
  // checklist
  const rows = [
    [true, "Check the MOHAP list before you travel", "Some common medicines are controlled in the UAE."],
    [true, "Controlled? Get MOHAP approval first", "Apply online before you fly, not at the airport."],
    [true, "Prescription or doctor's letter", "In your name, covering the amount you carry."],
    [true, "Personal amounts only", "Check the current limit. It can be less for controlled medicines."],
    [false, "No CBD, no cannabis — in any form", "Oils, gummies, creams and vape liquids included."],
  ];
  rows.forEach(([ok, t, d], i) => {
    const y = 250 + i * 104;
    b += rect(740, y, 780, 92, 14, C.panel, ok ? C.line : C.red, 2);
    b += g(756, y + 14, 0.64, ok ? icon.tick() : icon.cross());
    b += txt(838, y + 40, t, { size: 27, weight: 700, fill: C.white });
    b += txt(838, y + 74, d, { size: 21, fill: C.muted });
  });
  b += txt(W / 2, 852, "Not sure? Ask your doctor, check with MOHAP, and ask JLS before you travel.", { size: 25, weight: 600, fill: C.gold, anchor: "middle" });
  return svg(W, H, b);
}

// ── 4. In public ────────────────────────────────────────────────────────────
function inPublic() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Behaviour in public", "Respect goes a long way — and much of it is the law");
  const tiles = [
    ["Dress modestly", "Malls, shops, streets and offices: shoulders and knees covered, nothing see-through or offensive."],
    ["Swimwear: beach and pool only", "Cover up before you walk to the shops, a café or a taxi."],
    ["Keep affection private", "Public displays of affection are frowned on. Kissing in public can lead to arrest."],
    ["No swearing or rude gestures", "In the street, at other drivers, in WhatsApp and online. It's a criminal offence."],
  ];
  const tw = 343, gap = 22, x0 = (W - (tw * 4 + gap * 3)) / 2, y = 220;
  const art = [
    g(tw / 2 - 52, 22, 0.9, person({ shirt: "#5a7fa8", legs: "#2d3646", skin: SKIN[3], hair: HAIR[3] })) + g(tw / 2 + 14, 22, 0.9, person({ shirt: "#c97b5a", legs: "#e8dcc6", skin: SKIN[0], hair: HAIR[2], long: true })),
    waves(tw, 160, 1, C.teal) + rect(0, 196, tw, 60, 0, "#e6d3a3") + `<path d="M${tw / 2} 60 Q ${tw / 2 - 110} 60 ${tw / 2 - 120} 120 H ${tw / 2 + 120} Q ${tw / 2 + 110} 60 ${tw / 2} 60 Z" fill="${C.red}"/>` +
      `<path d="M${tw / 2} 60 Q ${tw / 2 - 30} 60 ${tw / 2 - 40} 120 H ${tw / 2 + 40} Q ${tw / 2 + 30} 60 ${tw / 2} 60 Z" fill="${C.paper}"/>` + rect(tw / 2 - 3, 116, 6, 86, 3, "#8e98ab") + circle(tw - 50, 50, 26, C.gold),
    g(tw / 2 - 110, 70, 1, bust({ skin: SKIN[1], hair: HAIR[1], shirt: "#3b4a63" })) + g(tw / 2 + 10, 70, 1, bust({ skin: SKIN[4], hair: HAIR[0], shirt: "#7a5a9a", long: true })) + g(tw / 2 - 40, 0, 0.8, prop.heart(C.gold)),
    g(tw / 2 - 90, 30, 1.8, prop.speech("#3a4a6a")) + txt(tw / 2, 120, "#@!%", { size: 50, weight: 700, fill: C.white, anchor: "middle" }) + g(tw / 2 + 30, 110, 0.9, icon.cross()),
  ];
  tiles.forEach(([t, d], i) => {
    const x = x0 + i * (tw + gap);
    b += rect(x, y, tw, 590, 18, C.panel, C.line, 2);
    b += `<svg x="${x}" y="${y + 10}" width="${tw}" height="250" viewBox="0 0 ${tw} 250" overflow="hidden">${art[i]}</svg>`;
    b += line(x + 24, y + 275, x + tw - 24, y + 275, C.line, 2);
    b += para(x + 24, y + 320, t, { size: 28, weight: 700, width: 21, fill: C.white, lh: 1.25 });
    b += para(x + 24, y + (t.length > 21 ? 412 : 376), d, { size: 23, width: 26, fill: C.text, lh: 1.4 });
  });
  b += txt(W / 2, 862, "When in doubt, dress and behave as you would visiting someone else's home.", { size: 25, weight: 600, fill: C.gold, anchor: "middle" });
  return svg(W, H, b);
}

// ── 5. Ramadan ──────────────────────────────────────────────────────────────
function ramadan() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Ramadan", "During daylight hours in Ramadan");
  // night scene with crescent and lantern
  b += rect(80, 210, 560, 600, 22, C.deep, C.line, 2);
  for (const [x, y, r] of [[140, 270, 3], [230, 320, 2], [520, 260, 3], [580, 360, 2], [330, 250, 2], [420, 330, 2.5], [170, 420, 2]]) b += circle(x, y, r, C.white, "none", 0, 'opacity="0.8"');
  b += crescent(480, 330, 70);
  // lantern
  const lx = 250, ly = 400;
  b += line(lx, 210, lx, ly - 30, C.gold, 3) + `<path d="M${lx - 30} ${ly - 30} H${lx + 30} L${lx + 14} ${ly - 54} H${lx - 14} Z" fill="${C.gold}"/>`;
  b += `<path d="M${lx - 46} ${ly - 30} H${lx + 46} L${lx + 56} ${ly + 70} L${lx + 36} ${ly + 130} H${lx - 36} L${lx - 56} ${ly + 70} Z" fill="#f3c766" stroke="${C.gold}" stroke-width="4"/>`;
  b += `<path d="M${lx} ${ly - 30} V${ly + 130} M${lx - 51} ${ly + 40} H${lx + 51}" stroke="#a37d17" stroke-width="3"/>` + rect(lx - 30, ly + 130, 60, 16, 4, C.gold);
  // low skyline at the bottom of the panel
  b += `<svg x="80" y="210" width="560" height="600" viewBox="0 0 560 600" overflow="hidden">${skyline(0, 560, 600, { fill: "#16264a", scale: 0.6 })}</svg>`;
  b += txt(360, 780, "Ramadan Kareem", { size: 34, family: SERIF, fill: C.white, anchor: "middle" });
  const rows = [
    ["Don't eat, drink, smoke or chew gum in public", "Including in your car. Eat on board or inside a restaurant."],
    ["Dress more modestly than usual", "Especially in malls, streets and offices."],
    ["Keep it quiet", "No loud music, dancing or swearing in public."],
    ["Be patient", "People are fasting. Driving can be hurried just before sunset."],
    ["Plan around changed hours", "Offices, shops and suppliers often change their times."],
  ];
  rows.forEach(([t, d], i) => {
    const y = 210 + i * 120;
    b += rect(680, y, 840, 104, 14, C.panel, C.line, 2);
    b += circle(724, y + 52, 22, C.gold) + txt(724, y + 61, String(i + 1), { size: 24, weight: 700, fill: C.bg, anchor: "middle" });
    b += txt(766, y + 44, t, { size: 27, weight: 700, fill: C.white });
    b += txt(766, y + 80, d, { size: 22, fill: C.muted });
  });
  b += txt(W / 2, 862, "At sunset the fast ends with iftar, a meal often shared with family and friends.", { size: 25, weight: 600, fill: C.gold, anchor: "middle" });
  return svg(W, H, b);
}

// ── 6. Marina promenade (hotspot picture, 1600 × 1000) ──────────────────────
const PH = 1000;
const FEET = 950, S = 1.25; // figures' feet line and scale (figure box 125 × 300)
const fig = (x, o, s = S) => g(x, FEET - 240 * s, s, person(o));
const OFFENDER = { x: 840 };
function promenade() {
  let b = `<defs><linearGradient id="day" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8cc4ea"/><stop offset="1" stop-color="#e2f1fa"/></linearGradient></defs>`;
  b += rect(0, 0, W, 400, 0, "url(#day)");
  b += circle(1380, 110, 54, "#fff3c4");
  b += skyline(60, 1540, 400, { fill: "#9fb4cc", lights: false, scale: 0.8 });
  b += rect(0, 398, W, 190, 0, "#2f7fb5") + waves(W, 470, 0.8, "#2a72a6") + waves(W, 530, 2, "#25689a");
  // moored yachts
  b += g(120, 430, 0.62, yacht("#ffffff", "#2b5fb8", "#1d3d6e")) + g(1060, 420, 0.7, yacht("#ffffff", C.gold, "#1d3d6e"));
  // railing and promenade
  b += rect(0, 586, W, PH - 586, 0, "#e9dfcc");
  for (let i = 0; i < 9; i++) b += line(0, 640 + i * 46 + i * i * 2, W, 640 + i * 46 + i * i * 2, "#d8ccb4", 2);
  for (let i = -6; i < 18; i++) b += line(800 + i * 110, 600, 800 + i * 210, PH, "#d8ccb4", 2);
  b += rect(0, 560, W, 8, 3, "#8e98ab") + rect(0, 582, W, 6, 3, "#8e98ab");
  for (let i = 0; i < 33; i++) b += rect(10 + i * 50, 560, 5, 28, 2, "#8e98ab");
  // palms and a bench
  b += g(60, 900, 1.25, palm()) + g(1500, 900, 1.25, palm());
  b += rect(1380, 820, 200, 20, 6, "#7a5a3a") + rect(1390, 840, 10, 50, 3, "#5a4a3a") + rect(1560, 840, 10, 50, 3, "#5a4a3a") + rect(1380, 770, 200, 16, 6, "#7a5a3a");
  // 1. Two friends chatting
  b += fig(150, { shirt: UNIFORM.shore[0], legs: UNIFORM.shore[1], skin: SKIN[3], hair: HAIR[0] });
  b += fig(270, { shirt: "#e8dcc6", legs: "#3b4a63", skin: SKIN[0], hair: HAIR[2], long: true, arm: "cross" });
  // 2. Photographing the yacht and the view (fine): phone raised towards the water
  const px = 470;
  b += fig(px, { shirt: UNIFORM.deck[0], legs: UNIFORM.deck[1], skin: SKIN[1], hair: HAIR[1], arm: "wave" });
  const ph = [px + 6 * S, FEET - 240 * S + 14 * S];
  b += `<path d="M${ph[0]} ${ph[1]} L 300 470 M${ph[0]} ${ph[1]} L 560 450" stroke="#ffffff" stroke-width="3" stroke-dasharray="10 8" opacity="0.9"/>`;
  b += rect(ph[0] - 14, ph[1] - 24, 28, 44, 5, "#1c2433", "#4a5a78", 2);
  // 3. Walking past with shopping
  b += fig(640, { shirt: UNIFORM.guest[0], legs: UNIFORM.guest[1], skin: SKIN[4], hair: HAIR[3] }) + rect(632, FEET - 140, 34, 44, 4, C.gold);
  // 4. The offender: phone held out at a family who haven't noticed
  const ox = OFFENDER.x;
  b += fig(ox, { shirt: "#5a7fa8", legs: "#2d3646", skin: SKIN[2], hair: HAIR[0], arm: "point" });
  const hand = [ox + 140 * S, FEET - 240 * S + 66 * S];
  b += `<path d="M${hand[0] + 16} ${hand[1]} L 1140 ${FEET - 300} M${hand[0] + 16} ${hand[1]} L 1140 ${FEET - 40}" stroke="#ffffff" stroke-width="3" stroke-dasharray="10 8" opacity="0.95"/>`;
  b += rect(hand[0] - 4, hand[1] - 26, 24, 50, 5, "#1c2433", "#4a5a78", 2) + circle(hand[0] + 20, hand[1] - 14, 5, "#fff3c4");
  // 5. The family looking at the sea
  b += fig(1150, { shirt: "#7a5a9a", legs: "#e8dcc6", skin: SKIN[2], hair: HAIR[0], long: true });
  b += g(1275, FEET - 240 * 0.85, 0.85, person({ shirt: "#3fb27f", legs: "#1b2a4a", skin: SKIN[2], hair: HAIR[0] }));
  // 6. Someone reading on the bench
  b += g(1440, 640, 1.3, bust({ shirt: "#c97b5a", skin: SKIN[1], hair: HAIR[4] })) + rect(1452, 740, 106, 30, 4, "#c97b5a") + rect(1470, 712, 70, 46, 4, C.paper, "#9fb0d4", 2);
  return svg(W, PH, b, null);
}
export const SPOTS = {
  photo: [spot(OFFENDER.x + 95, FEET - 170, 160)],
};

// ── 7. Heat ─────────────────────────────────────────────────────────────────
function heat() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Heat", "Summer in the UAE: heat exhaustion and heatstroke");
  // thermometer
  const tx = 150, ty = 230;
  b += rect(tx, ty, 60, 470, 30, C.paper, "#9fb0d4", 3) + circle(tx + 30, ty + 500, 56, C.red, "#9fb0d4", 3) + rect(tx + 16, ty + 120, 28, 380, 14, C.red);
  for (let i = 0; i <= 5; i++) {
    const y = ty + 440 - i * 70;
    b += line(tx + 64, y, tx + 84, y, C.muted, 3) + txt(tx + 94, y + 8, `${20 + i * 5}°`, { size: 22, fill: C.muted });
  }
  b += txt(tx + 30, ty + 640, "Summer days", { size: 22, fill: C.text, anchor: "middle" }) + txt(tx + 30, ty + 668, "often 40°C +", { size: 22, weight: 700, fill: C.gold, anchor: "middle" });
  b += circle(110, 220, 34, C.gold) + [...Array(8)].map((_, i) => { const a = i * Math.PI / 4; return line(110 + Math.cos(a) * 44, 220 + Math.sin(a) * 44, 110 + Math.cos(a) * 58, 220 + Math.sin(a) * 58, C.gold, 5); }).join("");
  const cols = [
    ["Signs of heat exhaustion", C.amber, ["Headache, dizziness", "Feeling sick or being sick", "Heavy sweating, pale clammy skin", "Cramps in arms, legs or stomach", "Very thirsty, tired, irritable", "High temperature"]],
    ["What to do", C.teal, ["Move them somewhere cool", "Take off extra clothing", "Give water, a sports drink or rehydration salts", "Spray or sponge with cool water and fan them", "Stay with them: they should feel better within 30 minutes"]],
    ["Heatstroke: call 998", C.red, ["Not better after 30 minutes", "Hot skin that has stopped sweating", "Very high temperature", "Fast breathing or heartbeat", "Confused, a fit, or passes out", "Raise the alarm on board too"]],
  ];
  cols.forEach(([t, col, items], i) => {
    const x = 340 + i * 410, y = 220;
    b += rect(x, y, 390, 600, 18, C.panel, col, 3);
    b += rect(x, y, 390, 70, 18, col) + rect(x, y + 50, 390, 20, 0, col);
    b += txt(x + 24, y + 47, t, { size: 27, weight: 700, fill: i === 0 ? C.bg : C.white });
    let yy = y + 116;
    for (const it of items) {
      b += circle(x + 32, yy - 8, 6, col);
      const words = it.split(" "), lines = [];
      let cur = "";
      for (const w of words) { if ((cur + " " + w).trim().length > 27) { lines.push(cur.trim()); cur = w; } else cur += " " + w; }
      lines.push(cur.trim());
      lines.forEach((l, k) => { b += txt(x + 52, yy + k * 30, l, { size: 23, fill: C.text }); });
      yy += lines.length * 30 + 18;
    }
  });
  b += txt(W / 2, 866, "Drink water before you're thirsty, work in the shade when you can, and look out for each other.", { size: 25, weight: 600, fill: C.gold, anchor: "middle" });
  return svg(W, H, b);
}

// ── 8. Emergency numbers card ───────────────────────────────────────────────
function emergencyNumbers() {
  let b = backdrop(W, H) + titleBlock(80, 90, "If something goes wrong", "Emergency numbers in the UAE");
  const nums = [
    ["999", "Police", "Emergencies", C.red],
    ["998", "Ambulance", "Injury or illness", C.red],
    ["997", "Fire", "Civil Defence", C.red],
    ["996", "Coastguard", "Emergencies at sea", C.red],
    ["901", "Dubai Police", "Non-emergency", C.teal],
  ];
  const tw = 270, gap = 22, x0 = (W - (tw * 5 + gap * 4)) / 2, y = 220;
  nums.forEach(([n, t, d, col], i) => {
    const x = x0 + i * (tw + gap);
    b += rect(x, y, tw, 360, 20, C.panel, col, 3);
    b += txt(x + tw / 2, y + 150, n, { size: 104, weight: 700, fill: C.white, anchor: "middle" });
    b += line(x + 30, y + 196, x + tw - 30, y + 196, col, 3);
    b += txt(x + tw / 2, y + 252, t, { size: 32, weight: 700, fill: C.white, anchor: "middle" });
    b += txt(x + tw / 2, y + 296, d, { size: 23, fill: C.muted, anchor: "middle" });
  });
  b += rect(80, 620, 1440, 200, 20, C.deep, C.gold, 2);
  b += g(110, 650, 1.4, prop.speech(C.gold));
  b += txt(270, 690, "Then tell the Captain and JLS straight away", { size: 34, weight: 700, fill: C.white });
  b += txt(270, 738, "Accident, injury, police, theft, a lost passport or Emirates ID, a visa problem: whatever it is.", { size: 24, fill: C.text });
  b += txt(270, 784, "Save your embassy's number in your phone, next to the Captain's and JLS's.", { size: 24, fill: C.muted });
  b += txt(W / 2, 866, "On board, raise the alarm and follow the yacht's emergency procedures as well.", { size: 24, weight: 600, fill: C.gold, anchor: "middle" });
  return svg(W, H, b);
}

export const PICTURES = {
  "uae-01-cover.png": cover,
  "uae-02-visa-steps.png": visaSteps,
  "uae-03-medicines.png": medicines,
  "uae-04-in-public.png": inPublic,
  "uae-05-ramadan.png": ramadan,
  "uae-06-promenade.png": promenade,
  "uae-07-heat.png": heat,
  "uae-08-emergency-numbers.png": emergencyNumbers,
};
