// Shared figures and props for the crew-life courses, on top of the cyber course's
// art.mjs (same navy + gold palette). Flat, faceless figures so nobody is a real
// person and skin/hair can vary. All plain SVG strings; place them with g().
import { C, txt, para, rect, circle, line } from "../academy-cyber/art.mjs";

export const SKIN = ["#f1c9a5", "#d9a77c", "#b07a52", "#7a4e30", "#4f3222"];
export const HAIR = ["#2a1d14", "#6b4423", "#c9a15a", "#1b1b1b", "#8a8a8a"];
/** Crew uniform colours: polo / trousers. */
export const UNIFORM = {
  deck: ["#f4f6fa", "#1b2a4a"], // white polo, navy shorts
  interior: ["#1b2a4a", "#1b2a4a"], // navy polo
  engineer: ["#3b4a63", "#3b4a63"], // boiler suit
  officer: ["#ffffff", "#ffffff"], // whites with epaulettes
  guest: ["#c97b5a", "#e8dcc6"],
  shore: ["#5a7fa8", "#2d3646"],
};

/**
 * A standing person in a 100 × 240 box (feet at y = 240). o.shirt/o.legs colours,
 * o.skin, o.hair, o.arm: "down" | "wave" | "phone" | "point" | "cross" (arms folded),
 * o.epaulettes for officers, o.long for long hair, o.mood: "" | "sad" | "happy" (a mouth).
 */
export function person(o = {}) {
  const { shirt = UNIFORM.deck[0], legs = UNIFORM.deck[1], skin = SKIN[1], hair = HAIR[0], arm = "down", epaulettes = false, long = false, mood = "" } = o;
  const outline = "#0b1730";
  let s = "";
  // legs
  s += rect(30, 140, 17, 95, 6, legs, outline, 1.5) + rect(53, 140, 17, 95, 6, legs, outline, 1.5);
  s += rect(26, 230, 24, 10, 4, "#20242c") + rect(50, 230, 24, 10, 4, "#20242c");
  // body
  s += `<path d="M22 70 Q22 58 36 56 L64 56 Q78 58 78 70 L76 146 L24 146 Z" fill="${shirt}" stroke="${outline}" stroke-width="1.5"/>`;
  // arms
  const armL = { down: "M24 66 L14 132", wave: "M24 66 L8 40 L6 14", phone: "M24 66 L14 120", point: "M24 66 L14 132", cross: "M24 66 L20 98 L72 98" }[arm];
  const armR = { down: "M76 66 L86 132", wave: "M76 66 L86 132", phone: "M76 66 L92 96 L72 44", point: "M76 66 L112 70 L140 66", cross: "M76 66 L80 110 L28 110" }[arm];
  for (const d of [armL, armR]) s += `<path d="${d}" fill="none" stroke="${shirt}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${outline}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.35"/>`;
  const hands = { down: [[14, 132], [86, 132]], wave: [[6, 14], [86, 132]], phone: [[14, 120], [72, 44]], point: [[14, 132], [140, 66]], cross: [[74, 98], [26, 110]] }[arm];
  for (const [x, y] of hands) s += circle(x, y, 7, skin);
  if (epaulettes) s += rect(24, 57, 16, 6, 2, C.gold) + rect(60, 57, 16, 6, 2, C.gold);
  if (arm === "phone") s += rect(64, 22, 16, 28, 3, "#1c2433", "#4a5a78", 1.5) + rect(66, 25, 12, 21, 1, "#2bb3c0");
  // neck + head
  s += rect(43, 44, 14, 14, 4, skin);
  if (long) s += `<path d="M26 30 Q26 4 50 4 Q74 4 74 30 L76 66 L24 66 Z" fill="${hair}"/>`;
  s += circle(50, 28, 22, skin, outline, 1.5);
  s += `<path d="M28 26 Q28 4 50 4 Q72 4 72 26 Q62 16 50 16 Q38 16 28 26 Z" fill="${hair}"/>`;
  if (mood === "happy") s += `<path d="M42 36 Q50 43 58 36" fill="none" stroke="${outline}" stroke-width="2.5" stroke-linecap="round"/>`;
  if (mood === "sad") s += `<path d="M42 41 Q50 34 58 41" fill="none" stroke="${outline}" stroke-width="2.5" stroke-linecap="round"/>`;
  return s;
}

/** Head-and-shoulders bust in a 100 × 100 box (for avatars, chat bubbles, cards). */
export function bust(o = {}) {
  const { shirt = UNIFORM.deck[0], skin = SKIN[1], hair = HAIR[0], long = false } = o;
  const outline = "#0b1730";
  return (long ? `<path d="M24 40 Q24 8 50 8 Q76 8 76 40 L80 80 L20 80 Z" fill="${hair}"/>` : "") +
    `<path d="M10 100 Q10 70 34 66 L66 66 Q90 70 90 100 Z" fill="${shirt}" stroke="${outline}" stroke-width="1.5"/>` +
    rect(43, 54, 14, 14, 4, skin) + circle(50, 36, 24, skin, outline, 1.5) +
    `<path d="M26 34 Q26 10 50 10 Q74 10 74 34 Q63 23 50 23 Q37 23 26 34 Z" fill="${hair}"/>`;
}

/** A speech bubble with wrapped text; tail points down-left from (x, y + h). */
export function bubble(x, y, w, h, s, o = {}) {
  const { fill = C.paper, ink = C.ink, size = 24, tail = "left" } = o;
  const tx = tail === "left" ? x + 40 : x + w - 40;
  const d = tail === "left" ? `M${tx} ${y + h - 2} l-14 30 l40 -30 z` : `M${tx} ${y + h - 2} l14 30 l-40 -30 z`;
  return rect(x, y, w, h, 18, fill) + `<path d="${d}" fill="${fill}"/>` +
    para(x + 22, y + 22 + size, s, { size, width: Math.floor((w - 44) / (size * 0.5)), fill: ink, lh: 1.3 });
}

/** A phone screen showing a social / chat post, in a 300 × 560 box. */
export function phoneFrame(inner, o = {}) {
  const { screen = C.paper } = o;
  return rect(0, 0, 300, 560, 36, "#1c2433", "#4a5a78", 3) + rect(14, 40, 272, 480, 8, screen) +
    rect(120, 16, 60, 8, 4, "#4a5a78") + `<g transform="translate(14 40)">${inner}</g>`;
}

/** Small props, each in a 100 × 100 box. */
export const prop = {
  passport: (fill = "#7a1f2b") => rect(22, 10, 56, 80, 6, fill, "#3d0f15", 2) + circle(50, 42, 13, "none", C.gold, 3) + rect(34, 66, 32, 4, 2, C.gold),
  camera: () => rect(10, 30, 80, 52, 8, "#2a3446", "#4a5a78", 2) + rect(30, 22, 24, 12, 3, "#2a3446") + circle(50, 56, 18, "#0b1220", "#8e98ab", 3) + circle(50, 56, 8, "#2bb3c0"),
  bed: () => rect(8, 50, 84, 26, 5, "#3a4a6a") + rect(8, 40, 22, 20, 5, "#e8eefc") + rect(30, 46, 62, 14, 5, "#8fa6d4") + rect(10, 76, 6, 14, 2, "#2a3446") + rect(84, 76, 6, 14, 2, "#2a3446"),
  clock: (h = 3, m = 0) => {
    const a = ((h % 12) + m / 60) * 30 * Math.PI / 180, b = m * 6 * Math.PI / 180;
    return circle(50, 50, 42, C.paper, "#4a5a78", 4) + line(50, 50, 50 + 22 * Math.sin(a), 50 - 22 * Math.cos(a), C.ink, 6) + line(50, 50, 50 + 32 * Math.sin(b), 50 - 32 * Math.cos(b), C.ink, 4) + circle(50, 50, 4, C.ink);
  },
  heart: (fill = "#e5534b") => `<path d="M50 86 C20 64 8 48 8 32 C8 18 20 8 32 8 C40 8 46 12 50 20 C54 12 60 8 68 8 C80 8 92 18 92 32 C92 48 80 64 50 86 Z" fill="${fill}"/>`,
  bottle: (fill = "#3fb27f") => rect(38, 6, 24, 16, 3, "#c7ced9") + `<path d="M34 22 H66 L70 36 V90 Q70 96 64 96 H36 Q30 96 30 90 V36 Z" fill="${fill}" opacity="0.85"/>` + rect(34, 48, 32, 26, 3, C.paper),
  pills: () => rect(16, 30, 68, 44, 8, "#e8eefc", "#9fb0d4", 2) + [0, 1, 2, 3, 4, 5].map((i) => circle(30 + (i % 3) * 20, 44 + Math.floor(i / 3) * 18, 6, i === 4 ? "#e8eefc" : "#e5534b")).join(""),
  speech: (fill = C.teal) => `<path d="M10 16 Q10 8 18 8 H82 Q90 8 90 16 V60 Q90 68 82 68 H40 L22 88 V68 H18 Q10 68 10 60 Z" fill="${fill}"/>`,
  flag: (stripes = ["#00732f", "#ffffff", "#000000"], hoist = "#ff0000") =>
    rect(6, 14, 4, 80, 2, "#8e98ab") + stripes.map((c, i) => rect(10, 14 + i * 18, 84, 18, 0, c)).join("") + rect(10, 14, 24, 54, 0, hoist),
};

/** Label under/over something. */
export const label = (x, y, s, o = {}) => txt(x, y, s, { size: 22, weight: 600, fill: C.text, anchor: "middle", ...o });
