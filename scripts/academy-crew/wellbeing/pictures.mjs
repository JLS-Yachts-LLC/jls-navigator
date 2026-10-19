// Still pictures for "Wellbeing at sea — fatigue, health and getting help". Each entry:
// file name → () => SVG (1600 × 900; the two hotspot pictures are 1600 × 1000).
// Hotspot exercises read CABIN_SPOTS / DECK_SPOTS (percentages of the picture's WIDTH).
// People are the shared faceless figures from ../people.mjs; names are invented.
import { C, SERIF, txt, para, svg, g, rect, circle, line, backdrop, yacht, waves, titleBlock } from "../../academy-cyber/art.mjs";
import { person, bust, prop, UNIFORM, SKIN, HAIR } from "../people.mjs";
import { spotsFor } from "../blocks.mjs";

const W = 1600, H = 900;
const spot = spotsFor(W);
const OUT = "#0b1730";

// ── Small icons for this course (100 × 100 box, place with g()) ─────────────
export const ic = {
  sun: (fill = C.amber) => circle(50, 50, 22, fill) +
    [...Array(8)].map((_, i) => { const a = i * Math.PI / 4; return line(50 + 31 * Math.cos(a), 50 + 31 * Math.sin(a), 50 + 44 * Math.cos(a), 50 + 44 * Math.sin(a), fill, 6); }).join(""),
  moon: (fill = "#e8eefc") => `<path d="M62 10 A40 40 0 1 0 90 66 A32 32 0 1 1 62 10 Z" fill="${fill}"/>` +
    circle(24, 22, 3, fill) + circle(14, 44, 2, fill),
  plane: (fill = C.text) => `<path d="M50 6 Q56 6 56 16 L56 40 L92 60 L92 68 L56 58 L56 80 L66 88 L66 94 L50 89 L34 94 L34 88 L44 80 L44 58 L8 68 L8 60 L44 40 L44 16 Q44 6 50 6 Z" fill="${fill}"/>`,
  waves: (fill = C.teal) => [26, 50, 74].map((y) => `<path d="M8 ${y} Q20 ${y - 12} 32 ${y} T56 ${y} T80 ${y} T96 ${y - 4}" fill="none" stroke="${fill}" stroke-width="7" stroke-linecap="round"/>`).join(""),
  cloud: (fill = "#8e98ab") => `<path d="M24 66 Q8 66 8 52 Q8 38 24 38 Q26 18 46 18 Q62 18 68 32 Q90 30 92 50 Q92 66 74 66 Z" fill="${fill}"/>` +
    `<path d="M48 64 L38 84 L50 84 L42 98" fill="none" stroke="${C.amber}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`,
  battery: (fill = C.red) => rect(8, 28, 76, 44, 8, "none", C.text, 6) + rect(84, 40, 10, 20, 3, C.text) + rect(16, 36, 16, 28, 3, fill),
  drop: (fill = "#7cc4ff") => `<path d="M50 8 Q78 46 78 62 A28 28 0 0 1 22 62 Q22 46 50 8 Z" fill="${fill}"/>`,
  dumbbell: (fill = C.text) => rect(20, 46, 60, 8, 3, fill) + rect(8, 30, 14, 40, 4, fill) + rect(78, 30, 14, 40, 4, fill) + rect(2, 38, 8, 24, 3, fill) + rect(90, 38, 8, 24, 3, fill),
  phone: (screen = "#2bb3c0") => rect(30, 6, 40, 88, 8, "#222b3b", "#4a5a78", 2) + rect(34, 14, 32, 70, 3, screen),
  noPhone: () => ic.phone("#5b6c8c") + circle(50, 50, 44, "none", C.red, 7) + line(19, 81, 81, 19, C.red, 7),
  beach: () => circle(70, 34, 16, C.amber) + rect(6, 64, 88, 10, 4, "#2b6fa8") + `<path d="M6 80 Q50 70 94 80 L94 92 L6 92 Z" fill="#e3c48a"/>` +
    `<path d="M30 80 Q32 50 26 32" fill="none" stroke="#8b5a2b" stroke-width="5"/>` + `<path d="M26 32 Q12 26 6 36 M26 32 Q40 22 48 32 M26 32 Q22 18 12 16 M26 32 Q34 18 44 18" fill="none" stroke="${C.green}" stroke-width="5" stroke-linecap="round"/>`,
  medic: (fill = C.red) => rect(10, 10, 80, 80, 14, C.paper) + rect(40, 20, 20, 60, 3, fill) + rect(20, 40, 60, 20, 3, fill),
  warn: (fill = C.red) => `<path d="M50 8 L94 88 H6 Z" fill="${fill}" stroke="${fill}" stroke-width="6" stroke-linejoin="round"/>` + rect(46, 34, 8, 30, 4, C.white) + circle(50, 74, 5, C.white),
  thermo: (fill = C.red) => rect(40, 8, 20, 62, 10, C.paper) + circle(50, 76, 18, C.paper) + rect(45, 30, 10, 44, 5, fill) + circle(50, 76, 12, fill),
};

/** A cap on a person() head (same 100 × 240 box). */
const cap = (fill = "#1b2a4a") => `<path d="M27 24 Q28 2 50 2 Q72 2 73 24 Z" fill="${fill}"/>` + rect(56, 18, 34, 7, 3, fill);

/** Icon in a round disc, centred at (cx, cy). */
const disc = (cx, cy, r, icon, o = {}) => circle(cx, cy, r, o.fill ?? C.deep, o.stroke ?? C.line, o.sw ?? 2) + g(cx - r * 0.62, cy - r * 0.62, r * 1.24 / 100, icon);

// ── 1. Cover ────────────────────────────────────────────────────────────────
function cover() {
  let b = backdrop(W, H);
  for (const [x, y, r] of [[180, 160, 2.5], [300, 90, 2], [420, 210, 1.8], [1210, 110, 2.2], [1330, 200, 1.8], [1450, 120, 2.5], [980, 70, 1.6], [640, 60, 1.6]]) b += circle(x, y, r, C.text, "none", 0, 'opacity="0.7"');
  b += g(170, 200, 1.1, ic.moon("#f3e7b5"));
  b += waves(W, 700, 0, C.sea) + waves(W, 735, 1.5, "#0f3160");
  b += g(500, 535, 1, yacht());
  const items = [[520, ic.moon("#e8eefc"), "Rest", C.teal], [800, prop.heart(), "Health", C.gold], [1080, ic.sun(), "Heat", C.amber]];
  for (const [x, icon, label, col] of items) {
    b += disc(x, 300, 92, icon, { stroke: col, sw: 4 });
    b += txt(x, 430, label, { size: 26, weight: 700, fill: C.text, anchor: "middle" });
  }
  b += txt(W / 2, 90, "CREW ACADEMY", { size: 22, weight: 700, fill: C.gold, anchor: "middle", spacing: 4 });
  b += txt(W / 2, 160, "Wellbeing at sea", { size: 72, family: SERIF, fill: C.white, anchor: "middle" });
  b += rect(360, 770, 880, 84, 16, C.deep, C.gold, 2, 'fill-opacity="0.85"');
  b += txt(W / 2, 824, "Fatigue · heat · health · getting help", { size: 34, weight: 600, fill: C.white, anchor: "middle" });
  return svg(W, H, b);
}

// ── 2. Why yacht crew get tired ─────────────────────────────────────────────
function fatigueCauses() {
  let b = backdrop(W, H) + titleBlock(84, 80, "Fatigue", "Why yacht crew get tired");
  const cards = [
    ["Long charter days", "Early starts and late finishes, for weeks on end.", prop.clock(6, 0), C.gold],
    ["Broken sleep", "Night call-outs, alarms, a shared cabin.", prop.bed(), C.teal],
    ["Night watches", "Working through the hours your body wants to sleep.", ic.moon(), C.teal],
    ["Noise and motion", "Engines, generators, a rolling hull, a busy corridor.", ic.waves(), C.teal],
    ["Heat", "Hot decks and engine rooms drain your energy fast.", ic.sun(), C.amber],
    ["Stress", "Demanding days, worries at home, no space of your own.", ic.cloud(), C.muted],
    ["Jet lag on rotation", "Long flights to join the yacht upset your body clock.", ic.plane(), C.text],
    ["It adds up", "Short sleep night after night builds a sleep debt.", ic.battery(), C.red],
  ];
  const cw = 340, ch = 270, gap = 24, x0 = (W - (cw * 4 + gap * 3)) / 2;
  cards.forEach(([t, d, icon, col], i) => {
    const x = x0 + (i % 4) * (cw + gap), y = 200 + Math.floor(i / 4) * (ch + gap);
    b += rect(x, y, cw, ch, 18, C.panel, C.line, 2);
    b += disc(x + 70, y + 72, 46, icon, { stroke: col, sw: 3 });
    b += txt(x + 28, y + 162, t, { size: 27, weight: 700, fill: C.white });
    b += para(x + 28, y + 202, d, { size: 22, width: 28, fill: C.text, lh: 1.35 });
  });
  b += txt(W / 2, 862, "Fatigue affects everyone, whatever their skill or experience.  (IMO Guidelines on Fatigue)", { size: 24, fill: C.muted, anchor: "middle" });
  return svg(W, H, b);
}

// ── 3. Crew cabin at 14:00 (hotspot picture, 1600 × 1000) ───────────────────
const CH = 1000;
const CAB = { phone: [452, 432], lamp: [700, 352], port: [1400, 300], can: [1281, 572] };
export const CABIN_SPOTS = [
  spot(...CAB.phone, 72),   // phone screen glowing in Ayo's face
  spot(...CAB.lamp, 62),    // reading light left on
  spot(...CAB.port, 105),   // porthole with the curtain open, sun pouring in
  spot(...CAB.can, 56),     // energy drink on the bedside table
];
function cabin() {
  let b = rect(0, 0, W, CH, 0, "#2c3753");
  // wall panelling
  for (let x = 0; x < W; x += 200) b += line(x, 90, x, 880, "#27314b", 3);
  b += rect(0, 880, W, 120, 0, "#1f2433") + line(0, 880, W, 880, "#3a4560", 4);
  // sunlight from the porthole across the cabin
  b += `<path d="M1330 250 L1470 330 L1000 880 L560 880 Z" fill="#fff3b0" opacity="0.16"/>`;
  // porthole with the curtain pulled open
  const [px, py] = CAB.port;
  b += circle(px, py, 96, "#c7ced9") + circle(px, py, 80, "#bfe6ff") + circle(px + 26, py - 22, 30, "#fff6c8") + circle(px + 26, py - 22, 44, "#fff6c8", "none", 0, 'opacity="0.45"');
  b += `<path d="M${px - 80} ${py + 30} Q${px} ${py + 10} ${px + 80} ${py + 30} L${px + 80} ${py + 80} L${px - 80} ${py + 80} Z" fill="#2f7fb5" opacity="0.8" clip-path="url(#pclip)"/>`;
  b += `<defs><clipPath id="pclip"><circle cx="${px}" cy="${py}" r="80"/></clipPath></defs>`;
  b += rect(px + 110, 170, 60, 300, 10, "#7a3b4a") + rect(px + 100, 160, 80, 16, 6, "#8e98ab");
  // wall clock showing 14:00
  b += g(180, 112, 1.05, prop.clock(2, 0)) + txt(232, 246, "14:00", { size: 24, weight: 700, fill: C.text, anchor: "middle" });
  // bunks: frame, upper bunk, lower bunk
  b += rect(130, 280, 28, 600, 6, "#6b4f36") + rect(1150, 280, 28, 600, 6, "#6b4f36");
  b += rect(158, 268, 992, 34, 10, "#8fa6d4") + rect(158, 300, 992, 44, 4, "#6b4f36");
  b += rect(700, 238, 300, 34, 14, "#5f78b4"); // folded duvet on the upper bunk
  b += rect(158, 640, 992, 66, 10, "#c9d4ea") + rect(158, 704, 992, 64, 4, "#6b4f36") + rect(158, 768, 992, 112, 0, "#5a4330");
  for (const x of [260, 600, 940]) b += rect(x, 790, 220, 70, 8, "#6b4f36", "#4a3626", 2) + rect(x + 90, 818, 40, 10, 5, "#c7ced9");
  // reading light under the upper bunk, switched on, with its light cone
  const [lx, ly] = CAB.lamp;
  b += `<path d="M${lx - 24} ${ly + 14} L${lx + 24} ${ly + 14} L${lx + 170} 640 L${lx - 170} 640 Z" fill="#ffe9a8" opacity="0.22"/>`;
  b += rect(lx - 48, ly - 8, 96, 22, 8, "#c7ced9") + `<ellipse cx="${lx}" cy="${ly + 16}" rx="30" ry="9" fill="#fff6c8"/>` + circle(lx, ly + 16, 26, "#fff6c8", "none", 0, 'opacity="0.35"');
  // Ayo lying awake: pillow, head, duvet, arm up holding the phone
  const skin = SKIN[3], hair = HAIR[3];
  b += rect(180, 590, 190, 62, 26, "#eef2fb");
  b += circle(300, 598, 40, skin, OUT, 1.5) + `<path d="M262 590 Q262 552 300 552 Q320 552 330 562 Q300 566 286 600 Q276 622 266 616 Z" fill="${hair}"/>`;
  b += `<path d="M308 648 Q318 572 410 566 Q600 552 800 572 Q960 588 1140 604 L1140 660 L308 660 Z" fill="#4f6aa8" stroke="${OUT}" stroke-width="1.5"/>`;
  b += `<path d="M330 600 L1130 620" stroke="#5f78b4" stroke-width="3" fill="none" opacity="0.6"/>`;
  b += `<path d="M396 586 Q430 530 452 478" fill="none" stroke="${UNIFORM.interior[0]}" stroke-width="22" stroke-linecap="round"/>`;
  b += circle(452, 472, 13, skin);
  const [fx, fy] = CAB.phone;
  b += `<path d="M${fx - 18} ${fy + 30} L${fx + 18} ${fy + 30} L330 610 L282 586 Z" fill="#9fe7ff" opacity="0.22"/>`; // screen glow on the face
  b += circle(fx, fy, 56, "#9fe7ff", "none", 0, 'opacity="0.18"');
  b += rect(fx - 24, fy - 42, 48, 84, 8, "#1c2433", "#4a5a78", 2) + rect(fx - 19, fy - 34, 38, 66, 3, "#9fe7ff");
  b += rect(fx - 13, fy - 26, 26, 6, 2, "#ffffff") + rect(fx - 13, fy - 14, 20, 4, 2, "#5aa7c4") + rect(fx - 13, fy - 4, 26, 18, 2, "#e98ad0") + rect(fx - 13, fy + 18, 22, 4, 2, "#5aa7c4");
  // bedside table: energy drink (a spot), water bottle, eye mask, earplugs, book
  b += rect(1210, 620, 320, 26, 6, "#7a5a3e") + rect(1230, 646, 280, 234, 4, "#6b4f36") + rect(1250, 700, 240, 70, 6, "#7a5a3e", "#4a3626", 2);
  const [cx, cy] = CAB.can;
  b += rect(cx - 27, cy - 46, 54, 94, 10, "#e5534b", OUT, 1.5) + rect(cx - 27, cy - 46, 54, 12, 6, "#c7ced9");
  b += `<path d="M${cx + 4} ${cy - 26} L${cx - 12} ${cy + 4} L${cx} ${cy + 4} L${cx - 6} ${cy + 30} L${cx + 14} ${cy - 4} L${cx + 2} ${cy - 4} Z" fill="#ffe14d"/>`;
  b += g(1322, 522, 0.98, prop.bottle("#7cc4ff"));
  b += `<path d="M1422 606 Q1440 590 1462 600 Q1484 590 1502 606 Q1484 620 1462 612 Q1440 620 1422 606 Z" fill="#1b1f2a"/>` + line(1412, 604, 1422, 606, "#1b1f2a", 3) + line(1502, 606, 1514, 604, "#1b1f2a", 3);
  b += rect(1414, 664, 90, 18, 4, "#3fb27f") + rect(1420, 648, 78, 16, 4, "#d4a62a");
  // caption band
  b += rect(0, 0, W, 90, 0, C.deep) + txt(W / 2, 58, "14:00 · Ayo has the night watch tonight and is trying to sleep", { size: 32, weight: 600, fill: C.white, anchor: "middle" });
  return svg(W, CH, b, null);
}

// ── 4. Heat exhaustion or heatstroke ────────────────────────────────────────
function heatIllness() {
  let b = backdrop(W, H) + titleBlock(60, 70, "Heat illness", "Heat exhaustion or heatstroke?", { size: 50 });
  const panels = [
    {
      x: 60, col: C.amber, title: "Heat exhaustion", sub: "Act quickly: usually not serious if treated", icon: ic.drop(),
      signs: ["Heavy sweating, pale and clammy skin", "Headache, dizziness, feeling sick", "Cramps in the arms, legs or stomach", "Very thirsty, tired or irritable", "A high temperature"],
      todo: ["Into the shade or a cool space", "Remove extra clothing", "Water, or a sports or rehydration drink", "Cool the skin: spray or sponge, and fan", "Stay with them: better within 30 minutes"],
    },
    {
      x: 820, col: C.red, title: "Heatstroke", sub: "A MEDICAL EMERGENCY", icon: ic.thermo(),
      signs: ["A very high temperature", "Hot skin that has stopped sweating", "Fast breathing and a fast heartbeat", "Confused, restless or clumsy", "A fit, collapsing or unconscious"],
      todo: ["Raise the alarm now", "Tell the Captain or medical officer", "Get medical help straight away", "Keep cooling: wet sheet, cool water, fan", "Unconscious? Recovery position"],
    },
  ];
  for (const p of panels) {
    const y = 160, w = 720, h = 618;
    b += rect(p.x, y, w, h, 18, C.panel, p.col, 3);
    b += rect(p.x, y, w, 96, 18, p.col) + rect(p.x, y + 70, w, 26, 0, p.col);
    b += g(p.x + 20, y + 10, 0.76, p.icon);
    b += txt(p.x + 112, y + 48, p.title, { size: 34, weight: 700, fill: C.deep });
    b += txt(p.x + 112, y + 80, p.sub, { size: 21, weight: 700, fill: C.deep });
    b += txt(p.x + 32, y + 142, "SIGNS", { size: 20, weight: 700, fill: p.col, spacing: 2 });
    p.signs.forEach((s, i) => { b += circle(p.x + 40, y + 177 + i * 40, 5, p.col) + txt(p.x + 58, y + 185 + i * 40, s, { size: 25, fill: C.text }); });
    b += txt(p.x + 32, y + 400, "WHAT TO DO", { size: 20, weight: 700, fill: p.col, spacing: 2 });
    p.todo.forEach((s, i) => { b += txt(p.x + 34, y + 443 + i * 38, `${i + 1}`, { size: 22, weight: 700, fill: p.col }) + txt(p.x + 62, y + 443 + i * 38, s, { size: 25, fill: C.white, weight: i === 0 && p.col === C.red ? 700 : 400 }); });
  }
  b += rect(60, 800, 1480, 70, 14, C.deep, C.red, 2) + txt(W / 2, 845, "Not better after 30 minutes of cooling and fluids, or any heatstroke sign? Treat it as an emergency.", { size: 26, weight: 600, fill: C.white, anchor: "middle" });
  return svg(W, H, b);
}

// ── 5. Aft deck in the heat (hotspot picture, 1600 × 1000) ──────────────────
const DH = 1000;
/** A seated, slumped figure (same palette as person()), seat at y = 150 in a 100 × 240 box. */
function slumped(o = {}) {
  const { shirt = UNIFORM.deck[0], legs = UNIFORM.deck[1], skin = SKIN[1], hair = HAIR[0] } = o;
  let s = "";
  s += rect(24, 140, 52, 28, 8, legs, OUT, 1.5);                                   // lap
  s += rect(28, 160, 17, 70, 6, legs, OUT, 1.5) + rect(55, 160, 17, 70, 6, legs, OUT, 1.5); // shins
  s += rect(24, 226, 24, 10, 4, "#20242c") + rect(52, 226, 24, 10, 4, "#20242c");
  s += `<path d="M24 82 Q24 70 38 68 L62 68 Q76 70 76 82 L74 150 L26 150 Z" fill="${shirt}" stroke="${OUT}" stroke-width="1.5"/>`;
  // right arm resting on the knee
  s += `<path d="M74 78 L84 120 L66 146" fill="none" stroke="${shirt}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>` + circle(66, 146, 7, skin);
  s += rect(43, 56, 14, 14, 4, skin);
  // head dropped forward, hand on the forehead
  s += circle(50, 44, 22, skin, OUT, 1.5) + `<path d="M28 42 Q28 20 50 20 Q72 20 72 42 Q62 32 50 32 Q38 32 28 42 Z" fill="${hair}"/>`;
  s += `<path d="M42 56 Q50 50 58 56" fill="none" stroke="${OUT}" stroke-width="2.5" stroke-linecap="round"/>`;
  s += `<path d="M26 78 L10 64 L36 34" fill="none" stroke="${shirt}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>` + circle(38, 34, 8, skin);
  // sweat drops and a dizzy swirl
  for (const [x, y] of [[78, 34], [86, 50], [20, 22]]) s += `<path d="M${x} ${y - 9} Q${x + 6} ${y} ${x} ${y + 5} Q${x - 6} ${y} ${x} ${y - 9} Z" fill="#7cc4ff"/>`;
  s += `<path d="M50 6 m-14 0 a14 6 0 1 0 28 0 a10 4 0 1 0 -20 0" fill="none" stroke="${C.amber}" stroke-width="3" transform="translate(0 -12)"/>`;
  return s;
}
const DECK = { sick: [1336, 640], sickHead: [1338, 556] };
export const DECK_SPOTS = [spot(...DECK.sick, 120), spot(...DECK.sickHead, 70)];
function deckHeat() {
  let b = `<defs><linearGradient id="hot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe3a2"/><stop offset="1" stop-color="#bfe0f2"/></linearGradient></defs>`;
  b += rect(0, 0, W, 440, 0, "url(#hot)");
  b += circle(1430, 150, 120, "#fff2b8", "none", 0, 'opacity="0.55"') + circle(1430, 150, 70, "#fff6cc");
  b += rect(0, 400, W, 110, 0, "#3b8fc4") + line(0, 400, W, 400, "#2f7fb5", 3);
  // teak deck
  b += rect(0, 500, W, DH - 500, 0, "#c89a63");
  for (let y = 530; y < DH; y += 34) b += line(0, y, W, y, "#a97c4a", 2);
  // rail
  b += line(0, 440, W, 440, "#e4e8ef", 8);
  for (let x = 40; x < W; x += 140) b += line(x, 440, x, 506, "#c7ced9", 6);
  b += line(0, 474, W, 474, "#c7ced9", 3);
  // shade awning on the left and its shadow
  b += `<path d="M40 560 L560 560 L620 1000 L0 1000 Z" fill="#000" opacity="0.14"/>`;
  b += `<path d="M30 180 Q300 140 570 180 L570 214 Q300 176 30 214 Z" fill="#f4f6fa" stroke="#9aa6bb" stroke-width="2"/>`;
  b += line(60, 210, 60, 600, "#c7ced9", 8) + line(540, 210, 540, 600, "#c7ced9", 8);
  // A: in the shade with a water bottle (cap on)
  b += g(220, 330, 1.25, person({ shirt: UNIFORM.deck[0], legs: UNIFORM.deck[1], skin: SKIN[0], hair: HAIR[2], long: true, mood: "happy" }) + cap());
  b += g(300, 500, 0.7, prop.bottle("#7cc4ff"));
  // B: washing down with a hose (cap on)
  b += g(660, 320, 1.25, person({ skin: SKIN[2], hair: HAIR[0], arm: "point", mood: "happy" }) + cap("#c9a15a"));
  b += `<path d="M837 403 Q880 470 900 560 Q930 700 1000 760" fill="none" stroke="#2f9e5f" stroke-width="7"/>`;
  b += `<path d="M836 400 Q900 420 960 470" fill="none" stroke="#7cc4ff" stroke-width="5" opacity="0.8" stroke-dasharray="10 8"/>`;
  // C: coiling a line (cap on), water bottle at their feet
  b += g(980, 320, 1.25, person({ skin: SKIN[4], hair: HAIR[3], arm: "cross" }) + cap());
  b += `<ellipse cx="1150" cy="625" rx="44" ry="14" fill="none" stroke="#f0e2c0" stroke-width="6"/>` + `<ellipse cx="1150" cy="619" rx="34" ry="10" fill="none" stroke="#f0e2c0" stroke-width="5"/>`;
  b += g(1100, 540, 0.6, prop.bottle("#7cc4ff"));
  // D: slumped on the deck locker, no cap, empty bottle on its side
  b += rect(1230, 680, 220, 120, 10, "#f4f6fa", "#9aa6bb", 2) + rect(1230, 680, 220, 18, 8, "#dfe4ee");
  b += g(1276, 500, 1.25, slumped({ skin: SKIN[1], hair: HAIR[1] }));
  b += `<g transform="translate(1500 760) rotate(80)">${prop.bottle("#cfd8e6")}</g>`;
  // caption
  b += rect(40, 30, 600, 74, 14, C.deep, C.gold, 2, 'fill-opacity="0.92"') + txt(64, 78, "Aft deck · 16:00 · August in the Gulf", { size: 28, weight: 600, fill: C.white });
  return svg(W, DH, b, null);
}

// ── 6. Fit for duty? ────────────────────────────────────────────────────────
function fitForDuty() {
  let b = backdrop(W, H) + titleBlock(80, 80, "Fit for duty?", "Four checks before every watch or shift");
  const cards = [
    ["Alcohol", "Follow your yacht's own policy: often zero on duty. STCW limit for safety duties: 0.05% blood or 0.25 mg/l breath. Only time clears last night's drinks.", prop.bottle("#b5651d"), C.amber],
    ["Medicines", "Anything that could make you drowsy or slow? Tell the Captain or the medical officer before you work.", prop.pills(), C.teal],
    ["Drugs", "Illegal drugs: never. Many yachts test at random, and after an accident.", ic.warn(C.red), C.red],
    ["Sleep", "Too tired to do the job safely? Tell your Head of Department before you start.", prop.bed(), C.gold],
  ];
  const cw = 345, gap = 20, x0 = (W - (cw * 4 + gap * 3)) / 2;
  cards.forEach(([t, d, icon, col], i) => {
    const x = x0 + i * (cw + gap), y = 200;
    b += rect(x, y, cw, 560, 18, C.panel, col, 2);
    b += disc(x + cw / 2, y + 110, 72, icon, { stroke: col, sw: 3 });
    b += txt(x + 28, y + 232, `${i + 1}`, { size: 22, weight: 700, fill: col });
    b += txt(x + 28, y + 272, t, { size: 32, weight: 700, fill: C.white });
    b += para(x + 28, y + 318, d, { size: 23, width: 26, fill: C.text, lh: 1.4 });
  });
  b += txt(W / 2, 840, "Not sure you're fit for duty? Then you're not. Say so.", { size: 32, weight: 600, fill: C.gold, anchor: "middle" });
  return svg(W, H, b);
}

// ── 7. Look after yourself ──────────────────────────────────────────────────
function lookAfterYourself() {
  let b = backdrop(W, H) + titleBlock(80, 80, "Your wellbeing", "Small habits that protect you on board");
  const tiles = [
    ["Sleep", "Protect it. Everything else is harder without it.", prop.bed(), C.teal],
    ["Food and water", "Regular meals, even on busy days. Keep water with you.", prop.bottle("#7cc4ff"), C.teal],
    ["Move", "A swim, a run ashore, the gym, a stretch in your cabin.", ic.dumbbell(), C.gold],
    ["Stay in touch", "Short, regular calls with family and friends.", prop.speech(C.teal), C.teal],
    ["Time off the boat", "Get ashore on your time off when you can.", ic.beach(), C.amber],
    ["Less scrolling", "Other people's highlights aren't real life.", ic.noPhone(), C.red],
  ];
  const tw = 460, th = 250, gap = 30, x0 = (W - (tw * 3 + gap * 2)) / 2;
  tiles.forEach(([t, d, icon, col], i) => {
    const x = x0 + (i % 3) * (tw + gap), y = 200 + Math.floor(i / 3) * (th + gap);
    b += rect(x, y, tw, th, 18, C.panel, C.line, 2);
    b += disc(x + 92, y + th / 2, 62, icon, { stroke: col, sw: 3 });
    b += txt(x + 180, y + 90, t, { size: 30, weight: 700, fill: C.white });
    b += para(x + 180, y + 134, d, { size: 23, width: 21, fill: C.text, lh: 1.35 });
  });
  b += rect(80, 780, 1440, 76, 14, C.deep, C.gold, 2) + txt(W / 2, 828, "Struggling? Talk early: a crewmate, your HoD, the Captain or YachtCrewHelp.", { size: 28, weight: 600, fill: C.white, anchor: "middle" });
  return svg(W, H, b);
}

// ── 8. Where to get help ────────────────────────────────────────────────────
function whereToGetHelp() {
  let b = backdrop(W, H) + titleBlock(60, 70, "Getting help", "Where to get help", { size: 50 });
  // on board
  b += rect(60, 160, 600, 560, 18, C.panel, C.line, 2) + txt(90, 208, "ON BOARD AND ASHORE", { size: 20, weight: 700, fill: C.gold, spacing: 2 });
  const people = [
    ["The Captain", "or your Head of Department", bust({ shirt: UNIFORM.officer[0], skin: SKIN[1], hair: HAIR[4] })],
    ["The medical officer", "health, medicines, injuries", ic.medic()],
    ["A crewmate you trust", "the first chat is often the hardest", bust({ shirt: UNIFORM.interior[0], skin: SKIN[3], hair: HAIR[0], long: true })],
    ["Your EAP, if you have one", "employee assistance programme", prop.speech(C.teal)],
    ["Your own doctor", "for anything that goes on a while", prop.heart()],
  ];
  people.forEach(([t, d, icon], i) => {
    const y = 236 + i * 94;
    b += circle(124, y + 40, 38, C.deep, C.line, 2) + g(96, y + 12, 0.56, icon);
    b += txt(184, y + 36, t, { size: 27, weight: 700, fill: C.white }) + txt(184, y + 68, d, { size: 22, fill: C.muted });
  });
  // YachtCrewHelp
  b += rect(700, 160, 840, 340, 18, C.panel, C.gold, 3);
  b += txt(740, 228, "YachtCrewHelp", { size: 50, family: SERIF, fill: C.white });
  b += txt(740, 268, "For yacht crew · free · confidential · 24 hours, 365 days", { size: 24, fill: C.gold, weight: 600 });
  const rows = [["Call", "+44 20 3713 7273"], ["WhatsApp", "+44 7514 500153"], ["Chat, email, call-back", "iswan.org.uk/yachtcrewhelp"]];
  rows.forEach(([k, v], i) => {
    const y = 330 + i * 54;
    b += txt(740, y, k, { size: 25, fill: C.muted }) + txt(1050, y, v, { size: 32, weight: 700, fill: C.white });
  });
  // SeafarerHelp
  b += rect(700, 520, 840, 200, 18, C.panel, C.line, 2);
  b += txt(740, 578, "SeafarerHelp", { size: 38, family: SERIF, fill: C.white }) + txt(1050, 578, "for all seafarers · 24/7", { size: 24, fill: C.muted });
  b += txt(740, 636, "Call", { size: 25, fill: C.muted }) + txt(1050, 636, "+44 20 7323 2737", { size: 30, weight: 700, fill: C.white });
  b += txt(740, 688, "Online", { size: 25, fill: C.muted }) + txt(1050, 688, "iswan.org.uk/seafarerhelp", { size: 28, weight: 600, fill: C.white });
  // emergency bar
  b += rect(60, 745, 1480, 74, 14, "#5a1d1b", C.red, 3) + g(80, 752, 0.6, ic.warn(C.red));
  b += txt(150, 794, "Someone in immediate danger? Tell the Captain now, or call the emergency services.", { size: 28, weight: 700, fill: C.white });
  b += txt(W / 2, 868, "Both helplines are run by the seafarers' charity ISWAN. Details checked on iswan.org.uk on 19 October 2026.", { size: 21, fill: C.muted, anchor: "middle" });
  return svg(W, H, b);
}

export const PICTURES = {
  "wb-01-cover.png": cover,
  "wb-02-fatigue-causes.png": fatigueCauses,
  "wb-03-cabin.png": cabin,
  "wb-04-heat-illness.png": heatIllness,
  "wb-05-deck-heat.png": deckHeat,
  "wb-06-fit-for-duty.png": fitForDuty,
  "wb-07-look-after-yourself.png": lookAfterYourself,
  "wb-08-where-to-get-help.png": whereToGetHelp,
};
