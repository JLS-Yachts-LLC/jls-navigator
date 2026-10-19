// Short silent, captioned animations for "Wellbeing at sea". Crew often watch with the
// sound off, so the captions carry the story. Each is a function of time (s) → SVG body
// on a 1600 × 900 canvas (frameSvg wraps it at 1280 × 720).
//  wb-a1  Your body clock: a 24-hour dial. The alertness curve is an ILLUSTRATION of the
//         shape the IMO Guidelines on Fatigue describe (MSC.1/Circ.1598 paras 27–29: low
//         typically 03:00–05:00, incidents mainly midnight–06:00, a dip 15:00–17:00), not data.
//  wb-a2  Notice, ask, listen: a crewmate going quiet over a week; someone checks in.
import { C, txt, rect, circle, line, g, backdrop, icon } from "../../academy-cyber/art.mjs";
import { W, H, ramp, vis, op, titleCard, endCard, captions, frameSvg } from "../../academy-avit/anim.mjs";
import { person, bubble, prop, UNIFORM, SKIN, HAIR } from "../people.mjs";
import { ic } from "./pictures.mjs";

export { frameSvg };

// ── wb-a1: your body clock ──────────────────────────────────────────────────
const CX = 520, CY = 375, R1 = 248, R0 = 196;
const TAU = Math.PI * 2;
const circDist = (a, b) => { const d = Math.abs(a - b) % 24; return Math.min(d, 24 - d); };
/** Illustrative alertness 0–1 by hour: lowest about 04:00, a dip about 16:00. */
const alert = (h) => 0.55 - 0.3 * Math.cos(TAU * (h - 4) / 24) - 0.12 * Math.exp(-(circDist(h, 4) ** 2) / 3) - 0.3 * Math.exp(-(circDist(h, 16) ** 2) / 2.5);
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, p) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * p)).join(",")})`; };
const alertCol = (a) => (a < 0.45 ? mix(C.red, C.amber, Math.max(0, (a - 0.12) / 0.33)) : mix(C.amber, C.green, Math.min(1, (a - 0.45) / 0.3)));
const ang = (h) => (h / 24) * TAU - Math.PI / 2; // 00:00 at the top, clockwise
const P = (h, r) => [CX + r * Math.cos(ang(h)), CY + r * Math.sin(ang(h))];
/** Annular wedge from hour h0 to h1 between radii r0 and r1. */
function wedge(h0, h1, r0, r1, fill, extra = "") {
  const [a, b] = [P(h0, r1), P(h1, r1)], [c, d] = [P(h1, r0), P(h0, r0)];
  const large = h1 - h0 > 12 ? 1 : 0;
  return `<path d="M${a[0].toFixed(1)} ${a[1].toFixed(1)} A${r1} ${r1} 0 ${large} 1 ${b[0].toFixed(1)} ${b[1].toFixed(1)} L${c[0].toFixed(1)} ${c[1].toFixed(1)} A${r0} ${r0} 0 ${large} 0 ${d[0].toFixed(1)} ${d[1].toFixed(1)} Z" fill="${fill}" ${extra}/>`;
}
/** Arc stroke from h0 to h1 at radius r. */
function arc(h0, h1, r, stroke, sw, extra = "") {
  const [a, b] = [P(h0, r), P(h1, r)];
  return `<path d="M${a[0].toFixed(1)} ${a[1].toFixed(1)} A${r} ${r} 0 ${h1 - h0 > 12 ? 1 : 0} 1 ${b[0].toFixed(1)} ${b[1].toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" ${extra}/>`;
}
// hand position: [t, hours since 06:00]
const KEYS = [[6, 0], [11, 8], [16, 11.5], [19.5, 18], [25.5, 22]]; // stops at 04:00, the end of the night watch
function sweep(t) {
  if (t <= KEYS[0][0]) return 0;
  for (let i = 1; i < KEYS.length; i++) {
    const [t0, v0] = KEYS[i - 1], [t1, v1] = KEYS[i];
    if (t <= t1) return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
  }
  return KEYS[KEYS.length - 1][1];
}
const fmt = (h) => { const m = Math.round(((h % 24) + 24) % 24 * 60 / 15) * 15; return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

function bodyClock(t) {
  let b = backdrop(W, H);
  b += titleCard(t, 3.5, "Fatigue", "Your body clock", "Why some hours are harder than others");
  const o = vis(t, 3.5, 33, 0.5);
  if (o > 0) {
    let s = "";
    const done = sweep(t), now = (6 + done) % 24;
    // dial
    s += circle(CX, CY, R1 + 6, C.deep, C.line, 2) + circle(CX, CY, R0 - 6, C.panel, C.line, 2);
    for (let h = 0; h < 24; h++) { const [x0, y0] = P(h, R1 + 6), [x1, y1] = P(h, R1 + (h % 3 ? 14 : 22)); s += line(x0, y0, x1, y1, C.muted, h % 3 ? 2 : 3); }
    for (let h = 0; h < 24; h += 3) { const [x, y] = P(h, R1 + 48); s += txt(x, y + 9, `${String(h).padStart(2, "0")}:00`, { size: 22, weight: 600, fill: C.text, anchor: "middle" }); }
    // the alertness band, revealed behind the hand (unlit until then)
    s += wedge(0, 11.99, R0, R1, "#1a2c55") + wedge(12, 23.99, R0, R1, "#1a2c55");
    const step = 0.25;
    for (let d = 0; d < done - 1e-6; d += step) {
      const h0 = 6 + d, h1 = 6 + Math.min(done, d + step) + 0.02;
      s += wedge(h0, h1, R0, R1, alertCol(alert(((h0 + step / 2) % 24))));
    }
    // markers: afternoon dip, lowest point, highest-risk hours at sea, night watch
    const dip = ramp(t, 13.3, 14), low = ramp(t, 22.2, 23), risk = ramp(t, 23.6, 24.4), watch = ramp(t, 27.2, 28);
    s += op(dip, arc(15, 17, R1 + 92, C.amber, 12));
    s += op(risk, arc(0, 6, R1 + 92, C.red, 4, 'stroke-dasharray="10 10"'));
    s += op(low, arc(3, 5, R1 + 92, C.red, 14));
    s += op(watch, wedge(0, 4, R0 - 54, R0 - 14, C.gold, 'opacity="0.9"') + (() => { const [x, y] = P(2, R0 - 82); return txt(x, y + 8, "WATCH", { size: 18, weight: 700, fill: C.gold, anchor: "middle", spacing: 2 }); })());
    // hand + centre read-out
    if (t >= 5) {
      const [hx, hy] = P(now, R1 - 4);
      s += line(CX, CY, hx, hy, C.white, 6) + circle(hx, hy, 11, C.white) + circle(CX, CY, 10, C.white);
      const a = alert(now);
      s += rect(CX - 98, CY - 70, 196, 140, 18, C.deep, C.line, 2, 'opacity="0.92"');
      s += txt(CX, CY - 4, fmt(now), { size: 54, weight: 700, fill: C.white, anchor: "middle" });
      s += txt(CX, CY + 44, a < 0.2 ? "VERY LOW" : a < 0.55 ? "LOW" : a < 0.68 ? "DIPPING" : "ALERT", { size: 22, weight: 700, fill: alertCol(a), anchor: "middle", spacing: 2 });
      // right panel: meter + legend
      const px = 960;
      s += txt(px, 120, "ALERTNESS", { size: 22, weight: 700, fill: C.gold, spacing: 3 });
      s += rect(px, 140, 560, 40, 20, C.deep, C.line, 2) + rect(px + 4, 144, Math.max(32, 552 * a), 32, 16, alertCol(a));
      s += txt(px, 214, "low", { size: 20, fill: C.muted }) + txt(px + 560, 214, "high", { size: 20, fill: C.muted, anchor: "end" });
      const legend = [
        [dip, C.amber, "solid", "Afternoon dip", "about 15:00–17:00"],
        [low, C.red, "solid", "Lowest point", "typically about 03:00–05:00"],
        [risk, C.red, "dash", "Highest risk at sea", "midnight to 06:00"],
        [watch, C.gold, "solid", "A night watch", "00:00–04:00"],
      ];
      legend.forEach(([v, col, kind, t1, t2], i) => {
        const y = 290 + i * 92;
        s += op(v, (kind === "dash" ? line(px, y, px + 60, y, col, 5, 'stroke-dasharray="10 8"') : line(px, y, px + 60, y, col, 13)) +
          txt(px + 86, y - 2, t1, { size: 28, weight: 700, fill: C.white }) + txt(px + 86, y + 32, t2, { size: 23, fill: C.muted }));
      });
      s += txt(px, 676, "Illustration: everyone's body clock is a little different.", { size: 20, fill: C.muted, italic: true });
    }
    b += op(o, s);
  }
  b += captions(t, [
    [3.8, 9, "Your body clock runs on a 24-hour cycle", "It makes you alert or sleepy at set times, working or not"],
    [9, 12.6, "Alertness builds through the morning…"],
    [12.6, 16.5, "…then dips in the afternoon, about 15:00–17:00", "The \"post-lunch dip\""],
    [16.5, 21.5, "It lifts in the evening, then falls away at night"],
    [21.5, 27, "Lowest of all: typically about 03:00–05:00", "Studies at sea found fatigue-related incidents mostly between midnight and 06:00"],
    [27, 33, "On a 00:00–04:00 watch, you work through the low", "Sleep before it, use your breaks, and speak up if you're struggling"],
  ]);
  b += endCard(t, 33, "Know your low points.", "Plan your sleep, and say so if you're too tired to work safely.", ic.moon("#e8eefc"));
  return b;
}

// ── wb-a2: notice, ask, listen ──────────────────────────────────────────────
const RUI = { shirt: UNIFORM.interior[0], legs: UNIFORM.interior[1], skin: SKIN[1], hair: HAIR[0] };
const KEMI = { shirt: UNIFORM.deck[0], legs: UNIFORM.deck[1], skin: SKIN[4], hair: HAIR[3], long: true };
const CREW_A = { shirt: UNIFORM.deck[0], legs: UNIFORM.deck[1], skin: SKIN[0], hair: HAIR[2] };
const CREW_B = { shirt: UNIFORM.engineer[0], legs: UNIFORM.engineer[1], skin: SKIN[2], hair: HAIR[4] };
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function dayStrip(day, o = 1) {
  let s = "";
  DAYS.forEach((d, i) => {
    const x = 470 + i * 96, on = i === day;
    s += rect(x, 40, 84, 44, 10, on ? C.gold : C.deep, on ? C.gold : C.line, 2) + txt(x + 42, 70, d, { size: 20, weight: 700, fill: on ? C.deep : C.muted, anchor: "middle" });
  });
  return op(o, s);
}
/** Crew mess: seated figures behind a table. seats = [[x, figure, mood, arm]]. */
function mess(seats, extra = "") {
  let s = rect(0, 110, W, 620, 0, "#1b2f5c") + rect(0, 110, W, 620, 0, "none", C.line, 0);
  for (const x of [150, 1450]) s += circle(x, 240, 66, "#c7ced9") + circle(x, 240, 54, "#2f7fb5") + `<path d="M${x - 54} 252 L${x + 54} 252 A54 54 0 0 1 ${x - 54} 252 Z" fill="#1d4f80"/>`; // portholes
  for (const [x, fig, mood = "", arm = "down"] of seats) s += g(x - 65, 330, 1.3, person({ ...fig, mood, arm }));
  s += rect(260, 512, 1080, 26, 8, "#8b6a4a") + rect(280, 538, 1040, 160, 4, "#6b4f36");
  for (const [x] of seats) s += `<ellipse cx="${x}" cy="510" rx="48" ry="10" fill="#e8eefc"/>`;
  return s + extra;
}

function noticeAskListen(t) {
  let b = backdrop(W, H);
  b += titleCard(t, 3, "Looking out for each other", "Notice, ask, listen", "Supporting a crewmate who's struggling");
  // Monday: Rui is their usual self
  b += op(vis(t, 3, 7, 0.4), mess([[480, CREW_A, "happy"], [660, RUI, "happy", "wave"], [840, KEMI, "happy"], [1020, CREW_B, "happy"]]) + dayStrip(0));
  // Wednesday: quieter, eating alone, on the phone
  b += op(vis(t, 7, 11, 0.4), mess([[480, CREW_A, "happy"], [660, KEMI, "happy"], [840, CREW_B, "happy"], [1200, RUI, "", "phone"]]) + dayStrip(2));
  // Friday: skipping meals, snapping; then Kemi notices
  if (t > 10.6 && t < 18.9) {
    const o = vis(t, 11, 18.5, 0.4), n = ramp(t, 15, 15.6);
    let extra = `<ellipse cx="1200" cy="510" rx="48" ry="10" fill="#e8eefc"/>` + circle(1200, 503, 16, "#c97b5a");
    extra += g(1330, 280, 1.35, person({ ...RUI, mood: "sad", arm: "cross" }));
    extra += op(vis(t, 11.8, 15, 0.3), bubble(1120, 140, 260, 96, "Not now!", { size: 30, tail: "right" }));
    extra += op(n, circle(1398, 440, 150, "none", C.gold, 5, 'stroke-dasharray="14 10"') + line(890, 360, 1330, 330, C.gold, 3, 'stroke-dasharray="6 10" opacity="0.7"'));
    b += op(o, mess([[480, CREW_A, ""], [660, CREW_B, ""], [840, KEMI, ""]], extra) + dayStrip(4));
  }
  // On deck, in private: ask, listen, encourage help
  if (t > 18.1 && t < 33) {
    const o = vis(t, 18.5, 32.5, 0.4);
    let s = `<defs><linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3f78"/><stop offset="1" stop-color="#d98a6a"/></linearGradient></defs>`;
    s += rect(0, 0, W, 520, 0, "url(#dusk)") + rect(0, 470, W, 60, 0, "#1d4f80") + rect(0, 520, W, 380, 0, "#b98a58");
    s += line(0, 500, W, 500, "#e4e8ef", 7) + line(0, 540, W, 540, "#c7ced9", 3);
    for (let x = 60; x < W; x += 160) s += line(x, 500, x, 600, "#c7ced9", 5);
    s += g(500, 300, 1.5, person({ ...KEMI, mood: "" })) + g(880, 300, 1.5, person({ ...RUI, mood: t > 23.5 ? "" : "sad", arm: t > 23.5 ? "down" : "cross" }));
    const bub = (t0, t1, x, y, w, h, msg, tail) => op(vis(t, t0, t1, 0.3), bubble(x, y, w, h, msg, { size: 27, tail }));
    s += bub(18.8, 21.4, 540, 100, 400, 150, "You've seemed quiet lately. How are you doing?", "left") + bub(20, 21.4, 960, 130, 260, 80, "I'm fine.", "left");
    s += bub(21.4, 23.5, 540, 100, 400, 150, "Are you sure? I'm happy to listen.", "left");
    s += bub(23.6, 28, 960, 100, 560, 150, "I miss home. I'm not sleeping. I didn't know who to talk to.", "left");
    s += bub(28.1, 32.4, 540, 80, 420, 180, "Shall we talk to the Captain? Or call YachtCrewHelp. I'll sit with you.", "left");
    b += op(o, s);
  }
  // A few days later: checking in
  b += op(vis(t, 32.6, 37, 0.4), mess([[480, CREW_A, "happy"], [660, CREW_B, "happy"], [840, KEMI, "happy"], [1020, RUI, "happy"]],
    op(vis(t, 33, 37, 0.3), bubble(400, 150, 400, 90, "How are things today?", { size: 27, tail: "right" })) +
    op(vis(t, 34.4, 37, 0.3), bubble(1000, 150, 360, 90, "A bit better. Thanks.", { size: 27, tail: "left" }))) + dayStrip(1));
  b += captions(t, [
    [3.2, 7, "Monday: Rui is their usual self"],
    [7, 11, "Wednesday: quieter, eating alone, always on the phone"],
    [11, 15, "Friday: skipping meals, snapping at people", "Small changes over days are worth noticing"],
    [15, 18.5, "1 · Notice. Kemi can see something isn't right"],
    [18.5, 23.5, "2 · Ask, somewhere private. It's OK to ask twice"],
    [23.5, 28, "3 · Listen without judging", "You don't have to fix it or have the answers"],
    [28, 32.5, "4 · Encourage help", "The Captain, the medical officer, or YachtCrewHelp, 24/7"],
    [32.5, 37, "5 · Check in again a few days later"],
  ]);
  b += endCard(t, 37, "Notice. Ask. Listen.", "You don't have to fix it. Be there, and help them find support.", prop.heart());
  return b;
}

export const ANIMATIONS = {
  "wb-a1-body-clock.mp4": { seconds: 37, frame: bodyClock },
  "wb-a2-notice-ask-listen.mp4": { seconds: 40, frame: noticeAskListen },
};
