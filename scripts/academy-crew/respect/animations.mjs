// Short silent, captioned animations for "Respect on board". Each is a function of
// time (seconds) → SVG body on a 1600 × 900 canvas; the shared renderer pipes the
// frames into ffmpeg. Captions carry the story — crew often watch with the sound off.
import { C, txt, rect, circle, line, g, backdrop } from "../../academy-cyber/art.mjs";
import { W, H, ramp, vis, op, titleCard, endCard, captions, frameSvg } from "../../academy-avit/anim.mjs";
import { person, bubble, prop, SKIN, HAIR, UNIFORM } from "../people.mjs";

export { frameSvg };

const fmtH = (h) => (Number.isInteger(h) ? `${h}` : `${Math.floor(h)}½`);
const tick = (x, y, s = 1, col = C.green) => g(x, y, s, circle(20, 20, 20, col) + `<path d="M10 21 L17 28 L31 13" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`);

// ── rb-a1: how the rest-hours rule works ────────────────────────────────────
// One 24-hour period from 06:00 to 06:00: work 06–12, rest 12–14, work 14–21, rest 21–06.
const DAY = [[0, 6, "w"], [6, 8, "r"], [8, 15, "w"], [15, 24, "r"]]; // hours after 06:00
const WEEK = [11, 11, 12, 10.5, 13, 12, 16]; // rest in each day: 85½ in the week

function restHours(t) {
  let b = backdrop(W, H);
  b += titleCard(t, 3.5, "Hours of rest", "How the rest rule works", "10 in any 24 hours. 77 in any 7 days.");

  // Scene A — one 24-hour period (3.5 – 20.5)
  const oa = vis(t, 3.5, 20.5, 0.5);
  if (oa > 0) {
    const x0 = 120, y0 = 250, bw = 1360, bh = 110, k = bw / 24;
    const hNow = 24 * ramp(t, 4.5, 14.5); // hours of the period shown so far
    let s = txt(x0, y0 - 30, "One 24-hour period: 06:00 today to 06:00 tomorrow", { size: 28, weight: 600, fill: C.white });
    s += rect(x0, y0, bw, bh, 10, C.deep, C.line, 2);
    let rest = 0, work = 0;
    for (const [a, z, kind] of DAY) {
      const e = Math.min(z, hNow);
      if (e <= a) continue;
      s += rect(x0 + a * k, y0, (e - a) * k, bh, 0, kind === "w" ? "#2b5fb8" : C.teal);
      if (kind === "w") work += e - a; else rest += e - a;
      if (e - a > 1.6) s += txt(x0 + ((a + e) / 2) * k, y0 + 66, kind === "w" ? "Work" : "Rest", { size: 28, weight: 700, fill: kind === "w" ? C.white : C.bg, anchor: "middle" });
    }
    s += rect(x0, y0, bw, bh, 10, "none", C.white, 2);
    for (let h = 0; h <= 24; h += 3) s += txt(x0 + h * k, y0 + bh + 36, `${String((h + 6) % 24).padStart(2, "0")}:00`, { size: 22, fill: C.muted, anchor: "middle" });
    // play head + clock
    if (t > 4.4 && t < 14.8) s += rect(x0 + hNow * k - 3, y0 - 12, 6, bh + 24, 3, C.gold);
    const clockH = (6 + hNow) % 24;
    s += g(1380, 60, 0.9, prop.clock(Math.floor(clockH), Math.round((clockH % 1) * 60)));
    // counters
    s += rect(x0, 440, 300, 120, 16, C.panel, C.teal, 2) + txt(x0 + 24, 486, "Rest so far", { size: 24, fill: C.muted }) +
      txt(x0 + 24, 538, `${fmtH(Math.floor(rest * 2) / 2)} hours`, { size: 40, weight: 700, fill: C.white });
    s += rect(x0 + 330, 440, 300, 120, 16, C.panel, "#2b5fb8", 2) + txt(x0 + 354, 486, "Work so far", { size: 24, fill: C.muted }) +
      txt(x0 + 354, 538, `${fmtH(Math.floor(work * 2) / 2)} hours`, { size: 40, weight: 700, fill: C.white });
    // rule checks
    const checks = [
      [15, "At least 10 hours of rest", "11 h"],
      [16.2, "No more than two rest periods", "midday + night"],
      [17.4, "One period of 6 hours or more", "9 h at night"],
      [18.6, "14 hours or less between rests", "longest 7 h"],
    ];
    checks.forEach(([t0, a, z], i) => {
      const o = ramp(t, t0, t0 + 0.4);
      const y = 430 + i * 66;
      s += op(o, tick(810, y, 1) + txt(866, y + 30, a, { size: 28, weight: 600, fill: C.white }) + txt(1480, y + 30, z, { size: 24, fill: C.gold, anchor: "end" }));
    });
    b += op(oa, s);
    b += captions(t, [
      [3.8, 9.2, "A charter day: work from 06:00, then a two-hour break at midday…"],
      [9.2, 14.8, "…back to work until 21:00, then rest until 06:00."],
      [14.9, 20.5, "11 hours of rest in two periods, one of them 9 hours. All the rules are met."],
    ]);
  }

  // Scene B — the week (20.5 – 30)
  const ob = vis(t, 20.5, 30, 0.5);
  if (ob > 0) {
    let s = txt(120, 150, "And over any 7 days: at least 77 hours of rest", { size: 34, weight: 600, fill: C.white });
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    let total = 0;
    days.forEach((d, i) => {
      const o = ramp(t, 21 + i * 0.6, 21.4 + i * 0.6);
      if (o <= 0) return;
      total += WEEK[i] * o;
      const y = 200 + i * 66, bw = 900, k = bw / 24, rest = WEEK[i];
      s += op(o, txt(120, y + 38, d, { size: 28, weight: 700, fill: C.white }) +
        rect(220, y + 8, bw, 42, 8, "#2b5fb8") + rect(220, y + 8, rest * k, 42, 8, C.teal) +
        txt(220 + rest * k - 14, y + 38, `${fmtH(rest)} h rest`, { size: 22, weight: 700, fill: C.bg, anchor: "end" }));
    });
    // running total and the 77 target
    const shown = Math.min(85.5, Math.floor(total * 2) / 2);
    s += rect(1180, 220, 300, 300, 20, C.panel, C.gold, 2);
    s += txt(1330, 270, "Rest this week", { size: 26, fill: C.muted, anchor: "middle" });
    s += txt(1330, 360, fmtH(shown), { size: 90, family: "Georgia, serif", fill: C.white, anchor: "middle" });
    s += txt(1330, 410, "hours", { size: 26, fill: C.muted, anchor: "middle" });
    const ok = ramp(t, 25.6, 26);
    s += op(ok, tick(1210, 446, 1) + txt(1262, 476, "77 or more", { size: 28, weight: 700, fill: C.green }));
    b += op(ob, s);
    b += captions(t, [
      [20.8, 25.4, "Over any 7 days you need at least 77 hours of rest, too."],
      [25.5, 30, "Record your real hours every day. Sign it, and keep your copy."],
    ]);
  }
  b += endCard(t, 30, "10 in any 24. 77 in any 7.", "If your hours don't add up, raise it. That's your right.", prop.clock(10, 10));
  return b;
}

// ── rb-a2: from banter to bullying ──────────────────────────────────────────
const KIT = { shirt: UNIFORM.deck[0], legs: UNIFORM.deck[1], skin: SKIN[3], hair: HAIR[0] };
const DEV = { shirt: UNIFORM.deck[0], legs: UNIFORM.deck[1], skin: SKIN[1], hair: HAIR[2] };
const ROSA = { shirt: UNIFORM.interior[0], legs: UNIFORM.interior[1], skin: SKIN[4], hair: HAIR[3], long: true };
const ALEX = { shirt: UNIFORM.engineer[0], legs: UNIFORM.engineer[1], skin: SKIN[0], hair: HAIR[1], long: true };

const FLOOR = 660;
const fig = (x, o, name, s = 1.3) => g(x, FLOOR - 240 * s, s, person(o)) + txt(x + 50 * s, FLOOR + 36, name, { size: 24, weight: 600, fill: C.muted, anchor: "middle" });
const dayPill = (s) => rect(80, 60, 190, 56, 28, C.gold) + txt(175, 98, s, { size: 28, weight: 800, fill: C.bg, anchor: "middle", spacing: 2 });
function mess(portholes = [360, 800, 1240]) {
  // crew mess wall, portholes, floor
  return rect(0, 0, W, FLOOR, 0, "#15306a") + rect(0, FLOOR, W, H - FLOOR, 0, "#0a1a3c") +
    portholes.map((x) => circle(x, 170, 46, "#0f2552", "#8e98ab", 8) + circle(x - 12, 158, 10, "#2c4a86")).join("");
}

function banterToBullying(t) {
  let b = backdrop(W, H);
  b += titleCard(t, 3.5, "Harassment and bullying", "From banter to bullying", "The same joke. A different story.");

  // Scene 1 — Day 1 (3.5 – 11): everyone laughs, Kit too
  const o1 = vis(t, 3.5, 11, 0.5);
  if (o1 > 0) {
    let s = mess() + dayPill("DAY 1");
    s += fig(250, { ...KIT, mood: "happy" }, "Kit") + fig(560, { ...DEV, mood: "happy", arm: "point" }, "Dev") + fig(930, { ...ROSA, mood: "happy" }, "Rosa") + fig(1200, { ...ALEX, mood: "happy" }, "Alex");
    s += op(ramp(t, 4.6, 5), bubble(520, 250, 360, 96, "Nice one, Captain Clumsy!", { size: 26 }));
    s += op(ramp(t, 7.6, 8), bubble(120, 250, 300, 96, "Ha! Fair enough.", { size: 26 }));
    b += op(o1, s);
    b += captions(t, [
      [3.8, 7.5, "Day 1. Kit trips over a mooring line. Dev makes a joke."],
      [7.5, 11, "Everyone laughs, Kit too. Between equals, that can be fine."],
    ]);
  }

  // Scene 2 — Day 9 (11 – 18): the same nickname, every meal; Kit has stopped laughing
  const o2 = vis(t, 11, 18, 0.5);
  if (o2 > 0) {
    let s = mess() + dayPill("DAY 9");
    s += fig(250, { ...KIT, mood: ramp(t, 13.5, 14) > 0.5 ? "sad" : "" }, "Kit") + fig(560, { ...DEV, mood: "happy", arm: "point" }, "Dev") + fig(930, { ...ROSA, mood: "happy" }, "Rosa") + fig(1200, { ...ALEX }, "Alex");
    s += op(ramp(t, 11.8, 12.2), bubble(520, 250, 470, 96, "Careful, Captain Clumsy's carrying plates!", { size: 26 }));
    b += op(o2, s);
    b += captions(t, [
      [11.3, 14.6, "Day 9. Still \"Captain Clumsy\", every meal, in front of the new crew."],
      [14.6, 18, "Kit has stopped laughing. Nobody seems to notice."],
    ]);
  }

  // Scene 3 — Day 20 (18 – 25.5): it moves into the crew group chat
  const o3 = vis(t, 18, 25.5, 0.5);
  if (o3 > 0) {
    let s = mess([360]) + dayPill("DAY 20");
    s += fig(250, { ...KIT, mood: "sad", arm: "phone" }, "Kit");
    // phone with the chat
    const px = 760, py = 120;
    s += rect(px, py, 520, 520, 40, "#1c2230", "#4a5a78", 3) + rect(px + 20, py + 50, 480, 440, 10, "#ece5dd");
    s += rect(px + 20, py + 50, 480, 70, 10, "#1f5c4f") + rect(px + 20, py + 100, 480, 20, 0, "#1f5c4f") + txt(px + 44, py + 96, "Crew chat", { size: 26, weight: 700, fill: C.white });
    const msgs = [[18.8, "Dev", "Captain Clumsy strikes again!"], [20, "Rosa", "Hide the glasses, lol"], [21.2, "Dev", "Someone get a helmet for Kit"]];
    msgs.forEach(([t0, who, m], i) => {
      const o = ramp(t, t0, t0 + 0.35);
      const y = py + 140 + i * 110;
      s += op(o, rect(px + 40, y, 430, 92, 14, C.white) + txt(px + 60, y + 34, who, { size: 21, weight: 700, fill: "#b5552b" }) + txt(px + 60, y + 72, m, { size: 25, fill: C.ink }));
    });
    b += op(o3, s);
    b += captions(t, [
      [18.3, 21.8, "Day 20. Now it's in the crew group chat, and others join in."],
      [21.8, 25.5, "Kit dreads every meal. The joke has turned into bullying."],
    ]);
  }

  // Scene 4 — a bystander steps in (25.5 – 34)
  const o4 = vis(t, 25.5, 34, 0.5);
  if (o4 > 0) {
    let s = mess();
    const later = ramp(t, 29.6, 30.2);
    if (later < 0.5) {
      s += fig(250, { ...KIT, mood: "sad" }, "Kit") + fig(560, { ...DEV, mood: ramp(t, 27.4, 27.8) > 0.5 ? "" : "happy" }, "Dev") + fig(930, { ...ROSA }, "Rosa") + fig(1200, { ...ALEX, arm: "cross" }, "Alex");
      s += op(ramp(t, 26, 26.4), bubble(960, 250, 430, 96, "Leave it now. It's not funny any more.", { size: 26, tail: "right" }));
    } else {
      s += fig(420, { ...KIT, mood: ramp(t, 31.8, 32.2) > 0.5 ? "happy" : "" }, "Kit") + fig(640, { ...ALEX, mood: "happy" }, "Alex");
      s += op(ramp(t, 30.4, 30.8), bubble(700, 250, 520, 96, "You OK? I'll come with you to talk to the Bosun.", { size: 26 }));
    }
    b += op(o4, s);
    b += captions(t, [
      [25.8, 29.6, "Alex steps in: \"Leave it now. It's not funny any more.\""],
      [29.7, 34, "Later, Alex checks in, and offers to go with Kit to the Bosun."],
    ]);
  }
  b += endCard(t, 34, "It's how it lands, not what you meant.", "If you see it, say something, or tell someone who can.", prop.speech(C.gold));
  return b;
}

export const ANIMATIONS = {
  "rb-a1-rest-hours.mp4": { seconds: 34, frame: restHours },
  "rb-a2-banter-to-bullying.mp4": { seconds: 38, frame: banterToBullying },
};
