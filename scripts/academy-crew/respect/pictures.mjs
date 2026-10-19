// Still pictures for "Respect on board — harassment, bullying and your rights".
// Each entry: file name → () => SVG string (1600 × 900; the two hotspot pictures are
// 1600 × 1000). Hotspot exercises read SPOTS (percentages of the picture's WIDTH).
// Figures are the shared faceless crew from ../people.mjs; names are invented.
import { C, SERIF, txt, para, svg, g, rect, circle, line, backdrop, yacht, waves, titleBlock } from "../../academy-cyber/art.mjs";
import { person, bust, bubble, prop, SKIN, HAIR, UNIFORM } from "../people.mjs";
import { spotsFor } from "../blocks.mjs";

const W = 1600, H = 900;
const spot = spotsFor(W);
export const SPOTS = {};

// ── Shared little icons (100 × 100 boxes) ───────────────────────────────────
const ic = {
  contract: () => rect(22, 8, 56, 80, 6, C.paper, "#9fb0d4", 2) + [24, 36, 48, 60].map((y) => rect(32, y, 36, 5, 2, "#9fb0d4")).join("") +
    `<path d="M34 76 q8 -10 14 0 t14 -2" fill="none" stroke="#2b5fb8" stroke-width="3" stroke-linecap="round"/>`,
  wages: () => rect(8, 26, 84, 50, 8, "#3fb27f") + circle(50, 51, 15, "none", "#e8fff3", 4) + rect(16, 34, 10, 6, 2, "#e8fff3") + rect(74, 62, 10, 6, 2, "#e8fff3"),
  leave: () => rect(20, 30, 60, 54, 8, C.amber) + `<path d="M38 30 V20 Q38 14 44 14 H56 Q62 14 62 20 V30" fill="none" stroke="${C.amber}" stroke-width="6"/>` +
    rect(20, 50, 60, 6, 0, "#b8741a") + rect(26, 84, 8, 6, 2, "#5a3a10") + rect(66, 84, 8, 6, 2, "#5a3a10"),
  home: () => `<path d="M14 50 L50 18 L86 50" fill="none" stroke="${C.teal}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` +
    rect(24, 46, 52, 42, 4, C.teal) + rect(44, 62, 14, 26, 2, C.bg),
  medical: () => circle(50, 50, 42, C.paper) + rect(41, 22, 18, 56, 3, C.red) + rect(22, 41, 56, 18, 3, C.red),
  food: () => circle(50, 54, 34, C.paper, "#9fb0d4", 3) + circle(50, 54, 20, "none", "#c9d3e8", 3) + rect(6, 22, 6, 62, 3, "#c7ced9") + rect(88, 22, 6, 62, 3, "#c7ced9"),
  speech: () => prop.speech(C.gold),
  clock: () => prop.clock(10, 10),
  bed: () => prop.bed(),
};

// ── 1. Cover ────────────────────────────────────────────────────────────────
function cover() {
  let b = backdrop(W, H);
  b += waves(W, 560, 0, C.sea) + waves(W, 600, 1.5, "#0f3160");
  b += g(820, 420, 1.15, yacht());
  // deck the crew stand on
  b += rect(0, 700, W, 200, 0, "#0a1a3c");
  const crew = [
    { shirt: UNIFORM.officer[0], legs: UNIFORM.officer[1], skin: SKIN[3], hair: HAIR[3], epaulettes: true, long: true, mood: "happy" },
    { shirt: UNIFORM.deck[0], legs: UNIFORM.deck[1], skin: SKIN[0], hair: HAIR[2], mood: "happy" },
    { shirt: UNIFORM.interior[0], legs: UNIFORM.interior[1], skin: SKIN[4], hair: HAIR[3], long: true, mood: "happy" },
    { shirt: UNIFORM.engineer[0], legs: UNIFORM.engineer[1], skin: SKIN[2], hair: HAIR[1], mood: "happy" },
    { shirt: UNIFORM.interior[0], legs: UNIFORM.interior[1], skin: SKIN[1], hair: HAIR[4], mood: "happy" },
  ];
  crew.forEach((o, i) => { b += g(120 + i * 118, 400, 1.35, person(o)); });
  b += txt(W / 2, 80, "CREW ACADEMY", { size: 22, weight: 700, fill: C.gold, anchor: "middle", spacing: 4 });
  b += txt(W / 2, 800, "Respect on board", { size: 72, family: SERIF, fill: C.white, anchor: "middle" });
  b += txt(W / 2, 856, "Harassment, bullying and your rights at sea", { size: 30, fill: C.muted, anchor: "middle" });
  return svg(W, H, b);
}

// ── 2. Your rights under the MLC — eight cards ──────────────────────────────
function rights() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Maritime Labour Convention, 2006", "Your rights on board, in plain terms");
  const cards = [
    [ic.contract(), "A written SEA", "Read it and get advice before you sign. Keep a signed copy."],
    [ic.wages(), "Wages", "Paid in full, at least once a month, with a pay statement."],
    [ic.clock(), "Hours of rest", "At least 10 in any 24 hours and 77 in any 7 days."],
    [ic.leave(), "Paid leave", "At least 2.5 days for each month worked. Shore leave too."],
    [ic.home(), "Repatriation", "Home at no cost to you when the contract ends, and before 12 months on board."],
    [ic.medical(), "Medical care", "Prompt care on board and ashore, in principle free of charge."],
    [ic.food(), "Living on board", "Free drinking water, balanced meals, a decent cabin."],
    [ic.speech(), "Complaints", "Complain on board or outside, with no victimisation."],
  ];
  const cw = 340, ch = 280, gx = 26, gy = 24, x0 = (W - (cw * 4 + gx * 3)) / 2, y0 = 210;
  cards.forEach(([icon, t, d], i) => {
    const x = x0 + (i % 4) * (cw + gx), y = y0 + Math.floor(i / 4) * (ch + gy);
    b += rect(x, y, cw, ch, 18, C.panel, C.line, 2);
    b += circle(x + 70, y + 72, 46, C.deep) + g(x + 40, y + 42, 0.6, icon);
    b += txt(x + 134, y + 82, t, { size: 28, weight: 700, fill: C.white });
    b += para(x + 26, y + 160, d, { size: 24, width: 25, fill: C.text, lh: 1.4 });
  });
  b += txt(W / 2, 872, "These are minimums. Your SEA, the yacht's policy or the flag state's law can give you more, never less.", { size: 24, fill: C.muted, anchor: "middle" });
  return svg(W, H, b);
}

// ── 3. The rest-hours rules on one page ─────────────────────────────────────
function restRules() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Hours of rest", "The rules on one page");
  // a 24-hour bar: rest 00–06, work 06–12, rest 12–14, work 14–21, rest 21–24
  const x0 = 100, y0 = 250, bw = 1400, bh = 80, k = bw / 24;
  const blocks = [[0, 6, "r"], [6, 12, "w"], [12, 14, "r"], [14, 21, "w"], [21, 24, "r"]];
  for (const [a, z, kind] of blocks) b += rect(x0 + a * k, y0, (z - a) * k, bh, 0, kind === "w" ? "#2b5fb8" : C.teal);
  b += rect(x0, y0, bw, bh, 8, "none", C.white, 2);
  for (let h = 0; h <= 24; h += 3) b += txt(x0 + h * k, y0 + bh + 34, `${String(h).padStart(2, "0")}:00`, { size: 20, fill: C.muted, anchor: "middle" });
  b += txt(x0 + 3 * k, y0 + 50, "Rest", { size: 24, weight: 700, fill: C.bg, anchor: "middle" });
  b += txt(x0 + 9 * k, y0 + 50, "Work", { size: 24, weight: 700, fill: C.white, anchor: "middle" });
  b += txt(x0 + 13 * k, y0 + 50, "Rest", { size: 24, weight: 700, fill: C.bg, anchor: "middle" });
  b += txt(x0 + 17.5 * k, y0 + 50, "Work", { size: 24, weight: 700, fill: C.white, anchor: "middle" });
  b += txt(x0 + 22.5 * k, y0 + 50, "Rest", { size: 24, weight: 700, fill: C.bg, anchor: "middle" });
  b += txt(x0, y0 - 24, "One day on charter: 11 hours of rest, in two periods (the night 21:00–06:00 is one period)", { size: 24, fill: C.text });
  const rules = [
    ["10 hours", "of rest in any 24-hour period, at least"],
    ["77 hours", "of rest in any 7-day period, at least"],
    ["2 periods", "at most. One must be 6 hours or longer"],
    ["14 hours", "at most between one rest period and the next"],
  ];
  const cw = 335, gap = 20, cx0 = (W - (cw * 4 + gap * 3)) / 2;
  rules.forEach(([big, small], i) => {
    const x = cx0 + i * (cw + gap), y = 440;
    b += rect(x, y, cw, 230, 18, C.panel, C.gold, 2);
    b += txt(x + cw / 2, y + 92, big, { size: 54, family: SERIF, fill: C.gold, anchor: "middle" });
    b += para(x + 28, y + 150, small, { size: 25, width: 24, fill: C.text, lh: 1.35 });
  });
  b += para(100, 742, "Some flag states use the other option in the MLC instead: no more than 14 hours of work in any 24 hours and 72 hours in any 7 days. Drills should disturb your rest as little as possible, and in an emergency the Captain can suspend the schedule. You get your rest back afterwards.", { size: 24, width: 118, fill: C.muted, lh: 1.45 });
  return svg(W, H, b);
}

// ── 4. A week's record of hours of rest (hotspot picture, 1600 × 1000) ──────
// Work periods in hours (half-hours allowed). Exactly one day (Thursday) has
// less than 10 hours of rest; the others pass. See check in the course notes.
export const REST_WEEK = [
  ["Mon", "Normal day", [[7, 12], [13, 18]]],
  ["Tue", "Guests join", [[6, 12], [13, 19.5]]],
  ["Wed", "Charter", [[6, 12.5], [14, 21.5]]],
  ["Thu", "Charter, late dinner", [[6.5, 13], [14, 22]]],
  ["Fri", "Charter, at anchor", [[7, 12], [14, 20.5]]],
  ["Sat", "Guests leave", [[7, 12], [13, 19]]],
  ["Sun", "Half day", [[8, 12]]],
];
export const BAD_DAY = 3;
const restOf = (work) => 24 - work.reduce((s, [a, z]) => s + (z - a), 0);
const fmtH = (h) => (Number.isInteger(h) ? `${h}` : `${Math.floor(h)}½`);

const RH = 1000;
function restRecord() {
  let b = rect(0, 0, W, RH, 0, "#e9edf3");
  b += rect(30, 24, W - 60, RH - 48, 16, C.white, "#c3cad8", 2);
  b += txt(70, 88, "Record of hours of rest", { size: 38, weight: 700, fill: C.ink });
  b += txt(70, 128, "Deck department  ·  Deckhand: R. Okafor  ·  One week", { size: 23, fill: "#5b6476" });
  // legend
  b += rect(1110, 62, 30, 24, 4, "#2b4a86") + txt(1150, 82, "Work", { size: 22, fill: C.ink });
  b += rect(1250, 62, 30, 24, 4, "#cdeff2", "#8fcbd1", 1) + txt(1290, 82, "Rest", { size: 22, fill: C.ink });
  const gx = 240, cw = 23, gy = 190, rh = 96, tx = gx + 48 * cw + 16; // totals column
  // hour labels
  for (let h = 0; h <= 24; h += 2) b += txt(gx + h * 2 * cw, gy - 16, String(h).padStart(2, "0"), { size: 19, fill: "#5b6476", anchor: "middle" });
  b += txt(tx + 90, gy - 46, "Rest in", { size: 20, weight: 700, fill: C.ink, anchor: "middle" });
  b += txt(tx + 90, gy - 18, "24 hours", { size: 20, weight: 700, fill: C.ink, anchor: "middle" });
  let week = 0;
  REST_WEEK.forEach(([day, note, work], r) => {
    const y = gy + r * rh;
    if (r % 2 === 0) b += rect(46, y, W - 92, rh, 0, "#f5f7fb");
    b += txt(70, y + 44, day, { size: 30, weight: 700, fill: C.ink });
    b += txt(70, y + 74, note, { size: 18, fill: "#5b6476" });
    for (let s = 0; s < 48; s++) {
      const t = s / 2 + 0.25;
      const isWork = work.some(([a, z]) => t > a && t < z);
      b += rect(gx + s * cw + 1, y + 22, cw - 2, rh - 44, 2, isWork ? "#2b4a86" : "#cdeff2");
    }
    const rest = restOf(work);
    week += rest;
    b += rect(tx + 30, y + 22, 120, rh - 44, 10, "#f0f3f8", "#c3cad8", 1.5) + txt(tx + 90, y + 59, fmtH(rest), { size: 30, weight: 700, fill: C.ink, anchor: "middle" });
    if (r === BAD_DAY) {
      const cy = y + rh / 2;
      SPOTS.badDay = [spot(120, cy, 58), ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => spot(gx + 75 + i * 145, cy, 56)), spot(tx + 90, cy, 58)];
    }
  });
  for (let h = 0; h <= 24; h += 6) b += line(gx + h * 2 * cw, gy - 6, gx + h * 2 * cw, gy + 7 * rh, "#9aa5b8", 1.5, 'stroke-dasharray="4 5"');
  const fy = gy + 7 * rh + 12;
  b += line(46, fy, W - 46, fy, "#c3cad8", 2);
  b += txt(70, fy + 50, "Rest this week (7 days):", { size: 26, fill: C.ink });
  b += txt(390, fy + 50, `${fmtH(week)} hours`, { size: 26, weight: 700, fill: C.ink });
  b += txt(W - 70, fy + 50, "Signed: Seafarer ............   Master ............", { size: 22, fill: "#5b6476", anchor: "end" });
  return svg(W, RH, b, null);
}

// ── 5. Banter or crossing the line? ─────────────────────────────────────────
function theLine() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Harassment and bullying", "Banter — or crossing the line?");
  // left panel: equals
  b += rect(60, 190, 720, 470, 20, C.panel, C.green, 3);
  b += txt(90, 236, "Banter between equals", { size: 28, weight: 700, fill: C.green });
  b += g(170, 390, 1.0, person({ shirt: UNIFORM.deck[0], legs: UNIFORM.deck[1], skin: SKIN[2], hair: HAIR[0], mood: "happy", arm: "wave" }));
  b += g(540, 390, 1.0, person({ shirt: UNIFORM.deck[0], legs: UNIFORM.deck[1], skin: SKIN[0], hair: HAIR[2], long: true, mood: "happy" }));
  b += bubble(84, 262, 300, 100, "Your knots are still a mess!", { size: 23 });
  b += bubble(420, 262, 336, 100, "Says the one who lost a fender!", { size: 23, tail: "right" });
  // right panel: crossing the line
  b += rect(820, 190, 720, 470, 20, C.panel, C.red, 3);
  b += txt(850, 236, "Crossing the line", { size: 28, weight: 700, fill: "#ff8f88" });
  b += g(870, 390, 1.0, person({ shirt: UNIFORM.interior[0], legs: UNIFORM.interior[1], skin: SKIN[4], hair: HAIR[3], mood: "happy", arm: "cross" }));
  b += g(1010, 390, 1.0, person({ shirt: UNIFORM.officer[0], legs: UNIFORM.officer[1], skin: SKIN[1], hair: HAIR[3], epaulettes: true, arm: "point", mood: "happy" }));
  b += g(1360, 410, 0.92, person({ shirt: UNIFORM.deck[0], legs: UNIFORM.deck[1], skin: SKIN[3], hair: HAIR[1], long: true, mood: "sad" }));
  b += bubble(980, 262, 520, 100, "Here's our slowest deckhand again. Useless!", { size: 23 });
  // the four questions
  const qs = [
    ["Is everyone laughing?", "Including the person it's about?"],
    ["Could they say it back?", "Without risk to their job or tips?"],
    ["Is it about who they are?", "Race, sex, religion, body, accent…"],
    ["Has anyone said stop?", "Then it stops. Every time."],
  ];
  qs.forEach(([t, d], i) => {
    const x = 60 + i * 375, y = 690;
    b += rect(x, y, 355, 130, 14, C.deep, C.line, 2);
    b += txt(x + 22, y + 50, t, { size: 24, weight: 700, fill: C.white });
    b += txt(x + 22, y + 92, d, { size: 21, fill: C.muted });
  });
  b += txt(W / 2, 866, "What counts is how it lands, not what you meant.", { size: 26, weight: 600, fill: C.gold, anchor: "middle" });
  return svg(W, H, b);
}

// ── 6. Crew group chat (hotspot picture, 1600 × 1000) ───────────────────────
const CH = 1000;
function groupChat() {
  let b = rect(0, 0, W, CH, 0, "#dfe4ee");
  // phone
  const px = 470, pw = 660;
  b += rect(px, 20, pw, 960, 54, "#1c2230", "#4a5a78", 3) + rect(px + 22, 70, pw - 44, 880, 12, "#ece5dd");
  b += rect(px + 22, 70, pw - 44, 96, 12, "#1f5c4f") + rect(px + 22, 140, pw - 44, 26, 0, "#1f5c4f");
  b += circle(px + 82, 118, 30, "#c5ccd6") + g(px + 60, 96, 0.44, bust({ shirt: "#7a8394", skin: "#e0e4ea", hair: "#7a8394" }));
  b += txt(px + 128, 112, "Deck crew", { size: 26, weight: 700, fill: C.white }) + txt(px + 128, 142, "9 members", { size: 19, fill: "#cfe3dd" });
  const msgs = [
    ["Bosun", "#2b8a6e", ["Wash-down 07:00, guests back at 11."], false],
    ["Mateo", "#b5552b", ["Anyone seen my sunglasses?"], false],
    ["You", null, ["Check the tender. It's always the tender."], true],
    ["Jules", "#7a4bb5", ["Did you see Sam's beach photos on", "their Insta? Posting the best ones", "here. Rate them out of 10!"], false],
    ["Mateo", "#b5552b", ["Found them in the tender, thanks!"], false],
  ];
  let y = 192;
  const x0 = px + 44, maxW = pw - 110;
  msgs.forEach(([name, col, lines, mine], i) => {
    const h = lines.length * 34 + (mine ? 30 : 64), w = maxW, x = mine ? px + pw - 44 - w : x0;
    b += rect(x, y, w, h, 16, mine ? "#d6f5c8" : C.white);
    let ty = y + 40;
    if (!mine) { b += txt(x + 20, y + 36, name, { size: 21, weight: 700, fill: col }); ty += 30; }
    lines.forEach((l, j) => { b += txt(x + 20, ty + j * 34, l, { size: 25, fill: C.ink }); });
    if (name === "Jules") SPOTS.chat = [spot(x + w * 0.2, y + h / 2, 92), spot(x + w * 0.5, y + h / 2, 92), spot(x + w * 0.8, y + h / 2, 92)];
    y += h + 20;
  });
  // input bar
  b += rect(px + 40, 880, pw - 80, 52, 26, C.white) + txt(px + 70, 914, "Message", { size: 22, fill: "#8a93a3" });
  return svg(W, CH, b, null);
}

// ── 7. The complaint route ──────────────────────────────────────────────────
function complaintRoute() {
  let b = backdrop(W, H) + titleBlock(80, 90, "The on-board complaint procedure", "Where you can take a complaint");
  const steps = [
    ["Your Head of Department", "or another senior officer you trust. Most things are best sorted here.", C.teal],
    ["The Captain", "if it isn't sorted, or if your HoD is involved. You can always go straight to the Captain.", C.gold],
    ["Ashore: the company", "the management company or DPA, and your crew agent. Anything not settled on board goes here.", C.amber],
    ["Outside the yacht", "the flag state, a port state inspector, a seafarers' union or the ITF, or a helpline.", C.red],
  ];
  const cw = 340, gap = 40, x0 = (W - (cw * 4 + gap * 3)) / 2, y = 230;
  steps.forEach(([t, d, col], i) => {
    const x = x0 + i * (cw + gap);
    b += rect(x, y, cw, 400, 18, C.panel, col, 3);
    b += circle(x + 52, y + 56, 30, col) + txt(x + 52, y + 67, String(i + 1), { size: 30, weight: 700, fill: C.bg, anchor: "middle" });
    b += para(x + 26, y + 150, t, { size: 30, weight: 700, width: 19, fill: C.white, lh: 1.25 });
    b += para(x + 26, y + 250, d, { size: 23, width: 25, fill: C.text, lh: 1.4 });
    if (i < 3) b += `<path d="M${x + cw + 6} ${y + 200} l26 0 m-10 -12 l12 12 l-12 12" fill="none" stroke="${C.white}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  b += rect(x0, 670, cw * 4 + gap * 3, 180, 18, C.deep, C.gold, 2);
  const notes = [
    "You can skip steps: straight to the Captain, or straight outside, whenever you need to.",
    "You can bring a crewmate with you, and there's a named person on board for confidential advice.",
    "Nobody may punish or victimise you for complaining. You get a copy of the procedure when you join.",
  ];
  notes.forEach((n, i) => { b += circle(x0 + 34, 712 + i * 50, 7, C.gold) + txt(x0 + 56, 721 + i * 50, n, { size: 25, fill: C.white }); });
  return svg(W, H, b);
}

// ── 8. When someone comes to you (HoDs and officers) ────────────────────────
function whenSomeoneComes() {
  let b = backdrop(W, H) + titleBlock(80, 90, "For HoDs and officers", "When someone comes to you");
  // two busts talking
  b += circle(250, 410, 175, C.panel2, C.line, 2);
  b += g(95, 300, 1.45, bust({ shirt: UNIFORM.officer[0], skin: SKIN[4], hair: HAIR[3], long: true }));
  b += rect(118, 402, 30, 8, 2, C.gold) + rect(202, 402, 30, 8, 2, C.gold);
  b += g(262, 312, 1.35, bust({ shirt: UNIFORM.shore[0], skin: SKIN[0], hair: HAIR[1] }));
  b += rect(90, 440, 320, 22, 6, "#8a6a3a") + rect(120, 462, 14, 60, 3, "#6a4f2a") + rect(366, 462, 14, 60, 3, "#6a4f2a");
  b += txt(250, 640, "Find somewhere private.", { size: 24, weight: 600, fill: C.white, anchor: "middle" });
  b += txt(250, 676, "Listen first.", { size: 24, weight: 600, fill: C.white, anchor: "middle" });
  const steps = [
    ["Listen", "Let them talk. Don't interrupt, judge or play it down."],
    ["Take it seriously", "Thank them for telling you. Never \"it's only banter\"."],
    ["Keep it confidential", "Share only with those who need to know, and say who that is."],
    ["Write it down", "Facts, dates, their words. Agree the note with them."],
    ["Escalate", "To the Captain or the company/DPA ashore. Don't investigate alone."],
    ["Protect them", "From victimisation. Never move or sideline them for speaking up."],
  ];
  steps.forEach(([t, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 520 + col * 520, y = 200 + row * 205;
    b += rect(x, y, 500, 185, 16, C.panel, C.line, 2);
    b += circle(x + 44, y + 48, 24, C.gold) + txt(x + 44, y + 57, String(i + 1), { size: 24, weight: 700, fill: C.bg, anchor: "middle" });
    b += txt(x + 84, y + 58, t, { size: 30, weight: 700, fill: C.white });
    b += para(x + 30, y + 112, d, { size: 23, width: 38, fill: C.text, lh: 1.4 });
  });
  b += txt(W / 2, 862, "Follow your yacht's own policy and the company's procedure. You don't have to sort it out alone.", { size: 24, fill: C.muted, anchor: "middle" });
  return svg(W, H, b);
}

export const PICTURES = {
  "rb-01-cover.png": cover,
  "rb-02-your-rights.png": rights,
  "rb-03-rest-rules.png": restRules,
  "rb-04-rest-record.png": restRecord,
  "rb-05-the-line.png": theLine,
  "rb-06-group-chat.png": groupChat,
  "rb-07-complaint-route.png": complaintRoute,
  "rb-08-when-someone-comes.png": whenSomeoneComes,
};

// The hotspot spots are filled in as the pictures are drawn; draw them once on import.
restRecord();
groupChat();
