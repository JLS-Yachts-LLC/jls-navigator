// Shared animation helpers for the AV/IT courses (same approach as the cyber course:
// each animation is a function of time in seconds → SVG body on a 1600 × 900 canvas).
import { C, SERIF, txt, rect, circle, g, backdrop, icon, captionBar } from "../academy-cyber/art.mjs";
import { terminal } from "./kit.mjs";

export const W = 1600, H = 900;
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (x) => x * x * (3 - 2 * x);
/** 0 → 1 between t0 and t1, eased. */
export const ramp = (t, t0, t1) => smooth(clamp((t - t0) / (t1 - t0)));
/** Fade in at t0, out at t1 (each over d seconds). */
export const vis = (t, t0, t1, d = 0.4) => Math.min(ramp(t, t0, t0 + d), 1 - ramp(t, t1 - d, t1));
export const lerp = (a, b, p) => a + (b - a) * p;
export const pt = (a, b, p) => [lerp(a[0], b[0], p), lerp(a[1], b[1], p)];
export const op = (o, body) => (o <= 0.001 ? "" : `<g opacity="${o.toFixed(3)}">${body}</g>`);

export function titleCard(t, t1, kicker, title, sub) {
  const o = vis(t, 0, t1, 0.5);
  return op(o, txt(W / 2, 360, kicker.toUpperCase(), { size: 24, weight: 700, fill: C.gold, anchor: "middle", spacing: 4 }) +
    txt(W / 2, 450, title, { size: 72, family: SERIF, fill: C.white, anchor: "middle" }) +
    (sub ? txt(W / 2, 520, sub, { size: 30, fill: C.muted, anchor: "middle" }) : ""));
}
export function endCard(t, t0, title, sub, ic = icon.shield()) {
  const o = ramp(t, t0, t0 + 0.6);
  return op(o, rect(0, 0, W, H, 0, C.bg) + backdrop(W, H) + g(W / 2 - 60, 230, 1.2, ic) +
    txt(W / 2, 480, title, { size: 54, family: SERIF, fill: C.white, anchor: "middle" }) +
    (sub ? txt(W / 2, 550, sub, { size: 30, fill: C.muted, anchor: "middle" }) : ""));
}
export const captions = (t, list) => list.map(([t0, t1, s, sub]) => {
  const o = vis(t, t0, t1, 0.35);
  return o > 0 ? captionBar(W, H, s, { opacity: o, sub }) : "";
}).join("");

/**
 * A terminal whose lines appear over time. script = [[t0, line], …]; a line whose text
 * starts with a prompt is typed out character by character from t0 (cps chars/second).
 */
export function liveTerminal(t, x, y, w, h, title, script, o = {}) {
  const { cps = 30, size = 22, keep = 99, promptRe = /^([A-Za-z0-9_.-]+(?:\([a-z-]+\))?[#>] ?)/ } = o;
  const shown = [];
  for (const [t0, ln] of script) {
    if (t < t0) break;
    const L = typeof ln === "string" ? { t: ln } : { ...ln };
    const m = !L.c && promptRe.exec(L.t);
    if (m) {
      const n = Math.floor((t - t0) * cps);
      L.t = m[1] + L.t.slice(m[1].length, m[1].length + n);
    }
    shown.push(L);
  }
  const lines = shown.slice(-keep);
  const tt = terminal(x, y, w, h, title, lines, { size, ...o });
  // blinking cursor after the last line
  const last = lines[lines.length - 1];
  const cur = last && Math.floor(t * 2) % 2 === 0 ? rect(tt.colX(last.t.length) + 2, tt.rowY(lines.length - 1) - size * 0.85, size * 0.5, size, 1, "#d6deeb") : "";
  return tt.svg + cur;
}

/** A dome CCTV camera, drawn in a 100 × 100 box. */
export const camera = (on = true) =>
  rect(18, 8, 64, 14, 4, "#c7ced9") + `<path d="M22 22 h56 v14 a28 28 0 0 1 -56 0 z" fill="#e4e8ef"/>` +
  circle(50, 44, 17, "#1d222b") + circle(50, 44, 9, on ? "#2b5fb8" : "#30343c") + circle(46, 40, 3, on ? "#cfe0ff" : "#3a3f48") +
  circle(70, 30, 3.5, on ? C.green : "#3a3f48");

export const frameSvg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${C.bg}"/>${body}</svg>`;
