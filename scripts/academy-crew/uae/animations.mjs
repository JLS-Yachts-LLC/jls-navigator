// Short silent, captioned animations for "Living and working in the UAE".
// Crew watch with the sound off, so the captions carry the story.
import { C, txt, rect, circle, line, g, backdrop, icon } from "../../academy-cyber/art.mjs";
import { W, H, ramp, vis, lerp, op, titleCard, endCard, captions, frameSvg } from "../../academy-avit/anim.mjs";
import { person, bust, prop, UNIFORM, SKIN, HAIR } from "../people.mjs";
import { docIcon, plane, fingerprint, idCard, skyline } from "./pictures.mjs";

export { frameSvg };

const CREW = { shirt: UNIFORM.deck[0], legs: UNIFORM.deck[1], skin: SKIN[3], hair: HAIR[0] };

// ── a1: from the airport to your Emirates ID ────────────────────────────────
const STOPS = [
  { t0: 3.5, label: "Entry permit", ic: docIcon() },
  { t0: 9.5, label: "Arrival", ic: g(0, 25, 1, plane()) },
  { t0: 15.5, label: "Medical test", ic: rect(20, 34, 60, 60, 10, C.paper) + rect(44, 44, 12, 40, 2, C.red) + rect(30, 58, 40, 12, 2, C.red) + rect(36, 14, 28, 24, 6, "none", "#9fb0d4", 6) },
  { t0: 21, label: "Biometrics", ic: fingerprint() },
  { t0: 26.5, label: "Emirates ID", ic: g(0, 20, 0.33, idCard()) },
];
const END1 = 32.5;
const stopX = (i) => 240 + i * 280, TRACK = 572;

function scene1(t, i) {
  // the big picture above the track for stop i, centred on x = 800
  const o = vis(t, STOPS[i].t0, i < 4 ? STOPS[i + 1].t0 : END1, 0.4);
  if (o <= 0) return "";
  let s = "";
  if (i === 0) {
    // a phone with an email and two attachments
    s += rect(640, 130, 320, 400, 36, "#1c2433", "#4a5a78", 3) + rect(656, 168, 288, 330, 8, C.paper);
    s += txt(676, 204, "From: JLS", { size: 20, weight: 700, fill: C.ink }) + txt(676, 232, "Your UAE entry permit", { size: 19, fill: "#4a5568" });
    const a = ramp(t, 4.5, 5.2), b2 = ramp(t, 5.4, 6.1);
    s += op(a, rect(676, 262, 248, 84, 10, "#e8eefc") + g(680, 266, 0.76, docIcon()) + txt(758, 300, "Entry permit", { size: 20, weight: 700, fill: C.ink }) + txt(758, 326, "PDF", { size: 17, fill: "#4a5568" }));
    s += op(b2, rect(676, 362, 248, 84, 10, "#fdf3d8", C.gold, 2) + g(680, 366, 0.76, docIcon(C.paper, C.red)) + txt(758, 396, "Arrival", { size: 20, weight: 700, fill: C.ink }) + txt(758, 422, "Instructions", { size: 20, weight: 700, fill: C.ink }));
  }
  if (i === 1) {
    // a plane landing behind an immigration desk; the crew member hands over three things
    const p = ramp(t, 9.5, 12);
    s += line(1290, 300, 1570, 300, "#4a5a78", 4) + g(lerp(1300, 1420, p), lerp(130, 250, p), 1.2, plane());
    s += g(1050, 170, 0.9, person({ shirt: "#3b4a63", legs: "#3b4a63", skin: SKIN[1], hair: HAIR[3] }));
    s += rect(950, 330, 300, 160, 12, "#2b3a5c", C.line, 2) + txt(1100, 372, "IMMIGRATION", { size: 22, weight: 700, fill: C.gold, anchor: "middle", spacing: 2 });
    s += g(360, 220, 1.1, person({ ...CREW, arm: "point" }));
    const items = [[prop.passport(), "Passport"], [docIcon(), "Entry permit"], [docIcon(C.paper, C.red), "Arrival Instructions"]];
    items.forEach(([ic, lab], k) => {
      const q = ramp(t, 10.5 + k * 0.8, 11.2 + k * 0.8);
      s += op(q, g(540 + k * 140, 340, 0.9, ic) + txt(585 + k * 140, 450, lab, { size: 17, fill: C.text, anchor: "middle" }));
    });
  }
  if (i === 2) {
    s += rect(560, 140, 480, 380, 20, C.panel, C.line, 2) + txt(800, 186, "Medical fitness test", { size: 28, weight: 700, fill: C.white, anchor: "middle" });
    // blood test tube
    s += rect(640, 240, 44, 170, 20, C.paper, "#9fb0d4", 3) + rect(646, 320, 32, 84, 14, C.red) + rect(632, 228, 60, 20, 6, "#4a7fd0");
    s += txt(662, 460, "Blood test", { size: 22, fill: C.text, anchor: "middle" });
    // chest X-ray film
    s += rect(780, 230, 190, 190, 10, "#0b1220", "#9fb0d4", 3);
    s += `<path d="M875 250 V400" stroke="#cfd8e8" stroke-width="8"/>` + [0, 1, 2, 3, 4].map((k) => `<path d="M875 ${270 + k * 26} q -60 6 -70 26 M875 ${270 + k * 26} q 60 6 70 26" fill="none" stroke="#cfd8e8" stroke-width="5" opacity="0.8"/>`).join("");
    s += txt(875, 460, "Chest X-ray", { size: 22, fill: C.text, anchor: "middle" });
  }
  if (i === 3) {
    s += rect(560, 140, 480, 380, 20, C.panel, C.line, 2) + txt(800, 186, "Biometrics", { size: 28, weight: 700, fill: C.white, anchor: "middle" });
    s += rect(620, 300, 200, 150, 14, "#2b3240", "#8e98ab", 2) + rect(650, 330, 140, 90, 8, "#0f3550");
    const scan = ramp(t, 22, 24.5);
    s += g(670, 320, 1, fingerprint(scan > 0.99 ? C.green : C.teal)) + line(650, 330 + scan * 90, 790, 330 + scan * 90, C.teal, 3, 'opacity="0.8"');
    // camera for the photo
    s += g(880, 250, 1.1, prop.camera()) + txt(935, 400, "Photo", { size: 22, fill: C.text, anchor: "middle" });
    s += txt(720, 480, "Fingerprints", { size: 22, fill: C.text, anchor: "middle" });
    s += op(ramp(t, 24.6, 25), g(800, 268, 0.5, icon.tick()));
  }
  if (i === 4) {
    const q = ramp(t, 26.8, 27.8);
    s += g(650, lerp(240, 170, q), 1, idCard({ skin: CREW.skin, hair: CREW.hair }));
    s += op(ramp(t, 28.2, 28.8), g(560, 400, 1, prop.passport()) + rect(660, 420, 330, 80, 12, C.deep, C.line, 2) +
      txt(825, 452, "No visa sticker in your passport:", { size: 20, fill: C.text, anchor: "middle" }) + txt(825, 482, "the visa is electronic", { size: 20, weight: 700, fill: C.gold, anchor: "middle" }));
  }
  return op(o, g(0, -40, 1, s));
}

function arrival(t) {
  let b = backdrop(W, H);
  b += titleCard(t, 3.5, "Arriving and your visa", "From the airport to your Emirates ID", "The usual steps. JLS will tell you what happens when.");
  const o = vis(t, 3.5, END1, 0.5);
  if (o > 0) {
    let s = "";
    // track and stops
    s += line(stopX(0), TRACK, stopX(4), TRACK, C.line, 6);
    const cur = STOPS.reduce((k, st, i) => (t >= st.t0 ? i : k), 0);
    const prog = STOPS.reduce((x, st, i) => (i ? lerp(x, stopX(i), ramp(t, st.t0 - 1, st.t0)) : stopX(0)), stopX(0));
    s += line(stopX(0), TRACK, prog, TRACK, C.gold, 6);
    STOPS.forEach((st, i) => {
      const done = i < cur, now = i === cur;
      s += circle(stopX(i), TRACK, 46, now ? C.gold : done ? C.panel2 : C.deep, now ? C.gold : C.line, 3);
      s += g(stopX(i) - 30, TRACK - 30, 0.6, st.ic);
      s += txt(stopX(i), TRACK + 78, st.label, { size: 22, weight: now ? 700 : 400, fill: now ? C.white : C.muted, anchor: "middle" });
      if (done) s += g(stopX(i) + 22, TRACK - 52, 0.3, icon.tick());
    });
    s += STOPS.map((_, i) => scene1(t, i)).join("");
    b += op(o, s);
  }
  b += captions(t, [
    [3.7, 9.5, "1 · JLS applies for your entry permit", "It comes to you with your Arrival Instructions"],
    [9.5, 15.5, "2 · Fly in with your passport, entry permit and Arrival Instructions", "Show the Arrival Instructions at immigration if you're asked"],
    [15.5, 21, "3 · Medical fitness test", "Usually a blood test and a chest X-ray at an approved centre"],
    [21, 26.5, "4 · Biometrics: fingerprints and a photo", "Steps 3 and 4 can come in either order. JLS books them"],
    [26.5, END1, "5 · Your residence visa is issued electronically", "It's linked to your Emirates ID. Carry the card with you"],
  ]);
  b += endCard(t, END1, "Passport valid. Emirates ID with you.", "Not sure what's next? Ask JLS.", g(-40, 10, 0.6, idCard()));
  return b;
}

// ── a2: one message, one big problem ────────────────────────────────────────
const END2 = 33;
/** A phone screen at (x, y), 340 × 560, with chat bubbles drawn by `inner(sx, sy)`. */
function phone(x, y, title, inner) {
  return rect(x, y, 340, 560, 40, "#1c2433", "#4a5a78", 3) + rect(x + 16, y + 50, 308, 470, 10, "#e9e3da") +
    rect(x + 16, y + 50, 308, 70, 10, "#1f5c4f") + rect(x + 16, y + 100, 308, 20, 0, "#1f5c4f") +
    circle(x + 56, y + 85, 22, "#c5ccd6") + g(x + 40, y + 69, 0.32, icon.user("#7a8394")) +
    txt(x + 90, y + 93, title, { size: 21, weight: 700, fill: C.white }) + inner(x + 16, y + 120);
}
const chat = (x, y, w, lines, mine, fill) => {
  const h = lines.length * 30 + 24, bx = mine ? x + 296 - w : x + 12;
  return rect(bx, y, w, h, 14, fill ?? (mine ? "#d6f5c8" : C.white)) + lines.map((l, i) => txt(bx + 14, y + 34 + i * 30, l, { size: 20, fill: C.ink })).join("");
};
function policeStation(x, y) {
  return rect(x, y + 60, 300, 200, 6, "#e8eefc", "#9fb0d4", 2) + `<path d="M${x - 16} ${y + 64} L${x + 150} ${y} L${x + 316} ${y + 64} Z" fill="#c7ced9"/>` +
    rect(x + 60, y + 76, 180, 40, 6, "#1b2a4a") + txt(x + 150, y + 104, "POLICE", { size: 24, weight: 700, fill: C.white, anchor: "middle", spacing: 3 }) +
    [0, 1, 2].map((k) => rect(x + 30 + k * 90, y + 140, 60, 50, 4, "#5a7fa8")).join("") + rect(x + 120, y + 200, 60, 60, 4, "#3b4a63");
}
function message(t) {
  let b = backdrop(W, H);
  b += titleCard(t, 3.5, "Online is real life", "One message, one big problem", "Swearing and insults are a crime in the UAE, on WhatsApp too");
  const o = vis(t, 3.5, END2, 0.5);
  if (o > 0) {
    let s = "";
    // Scene A (3.5–9): on the quay, the wrong delivery again
    const a = vis(t, 3.5, 9.2, 0.4);
    if (a > 0) {
      let q = `<svg x="0" y="0" width="${W}" height="620" viewBox="0 0 ${W} 620" overflow="hidden">${skyline(100, 1500, 620, { fill: "#16264a", scale: 0.8 })}</svg>`;
      q += rect(0, 620, W, 280, 0, "#1a2c52");
      q += g(520, 290, 1.4, person({ ...CREW, arm: "cross", mood: "sad" }));
      [0, 1, 2].forEach((k) => { q += rect(760 + k * 110, 470 + (k % 2) * 30, 100, 90, 6, "#b08a5a", "#7a5a3a", 2) + line(760 + k * 110, 515 + (k % 2) * 30, 860 + k * 110, 515 + (k % 2) * 30, "#7a5a3a", 2); });
      q += rect(760, 420, 330, 40, 8, C.paper) + txt(925, 448, "Order 2214: WRONG ITEMS", { size: 20, weight: 700, fill: C.red, anchor: "middle" });
      s += op(a, q);
    }
    // Scene B (9–15.5): typing an angry message
    const bOp = vis(t, 9, 15.8, 0.4);
    if (bOp > 0) {
      const typed = "You're an idiot and a liar. Useless!";
      const n = Math.floor(ramp(t, 10.2, 12.6) * typed.length);
      const sent = t >= 13.2;
      s += op(bOp, phone(630, 120, "Supplier", (x, y) =>
        chat(x, y + 20, 250, ["Delivered to the quay,", "all as ordered."], false) +
        (sent ? chat(x, y + 120, 270, ["You're an idiot and a liar.", "Useless!"], true, "#f6c9c4") : "") +
        rect(x + 8, y + 340, 292, 50, 25, C.white) + txt(x + 24, y + 373, sent ? "" : typed.slice(0, n).slice(-24), { size: 19, fill: C.ink }) +
        circle(x + 276, y + 365, 20, sent ? "#1f5c4f" : "#3fb27f") + `<path d="M${x + 268} ${y + 356} l18 9 l-18 9 z" fill="#fff"/>`));
      if (t > 13.2 && t < 15.8) s += op(ramp(t, 13.2, 13.6), txt(800, 712, "Sent", { size: 24, weight: 700, fill: C.gold, anchor: "middle" }));
    }
    // Scene C (15.5–21): screenshot → police complaint
    const cOp = vis(t, 15.5, 21.4, 0.4);
    if (cOp > 0) {
      let q = phone(220, 120, "Supplier", (x, y) => chat(x, y + 40, 270, ["You're an idiot and a liar.", "Useless!"], false, "#f6c9c4"));
      const flash = vis(t, 16.2, 16.8, 0.2);
      q += op(flash * 0.8, rect(236, 170, 308, 470, 10, C.white));
      q += op(ramp(t, 16.8, 17.3), rect(260, 560, 260, 44, 22, "#1b2433") + txt(390, 589, "Screenshot saved", { size: 19, fill: C.white, anchor: "middle" }));
      // the screenshot flies to the police station
      const f = ramp(t, 17.6, 19.2);
      if (f > 0) q += g(lerp(300, 1010, f), lerp(260, 300, f), lerp(0.5, 0.3, f), rect(0, 0, 308, 300, 8, C.white, "#9fb0d4", 3) + chat(0, 40, 270, ["You're an idiot and a liar.", "Useless!"], false, "#f6c9c4"));
      q += policeStation(980, 220);
      q += op(ramp(t, 19.4, 19.9), rect(940, 520, 380, 54, 10, C.deep, C.gold, 2) + txt(1130, 556, "Complaint filed", { size: 24, weight: 700, fill: C.gold, anchor: "middle" }));
      s += op(cOp, q);
    }
    // Scene D (21–26.5): what it can cost
    const dOp = vis(t, 21, 26.8, 0.4);
    if (dOp > 0) {
      const tiles = [["Prison", icon.lock(C.red)], ["Fine", g(0, 0, 1, rect(10, 24, 80, 52, 8, "#3fb27f") + circle(50, 50, 16, "#2b7a55") + txt(50, 58, "AED", { size: 14, weight: 700, fill: C.white, anchor: "middle" }))], ["Deportation", g(0, 22, 1, plane())]];
      let q = "";
      tiles.forEach(([lab, ic], k) => {
        const p = ramp(t, 21.6 + k * 0.8, 22.2 + k * 0.8);
        q += op(p, rect(310 + k * 340, 220, 300, 320, 20, C.panel, C.red, 3) + g(310 + k * 340 + 80, 270, 1.4, ic) + txt(310 + k * 340 + 150, 480, lab, { size: 34, weight: 700, fill: C.white, anchor: "middle" }));
      });
      s += op(dOp, q);
    }
    // Scene E (26.5–33): the better way
    const eOp = vis(t, 26.5, END2, 0.4);
    if (eOp > 0) {
      let q = phone(260, 120, "Supplier", (x, y) =>
        chat(x, y + 20, 250, ["Delivered to the quay,", "all as ordered."], false) +
        op(ramp(t, 27.3, 27.9), chat(x, y + 120, 280, ["The order is wrong again.", "Please call me so we can", "sort it out today."], true)));
      q += g(760, 230, 1.3, person({ ...CREW, arm: "phone", mood: "happy" }));
      q += op(ramp(t, 28.6, 29.2), rect(960, 250, 520, 250, 18, C.deep, C.green, 3) + g(980, 270, 0.7, icon.tick()) +
        txt(1070, 312, "Stay polite. Stick to facts.", { size: 26, weight: 700, fill: C.white }) +
        txt(990, 380, "Still angry? Put the phone down.", { size: 23, fill: C.text }) +
        txt(990, 418, "Let the Captain or your Head of", { size: 23, fill: C.text }) + txt(990, 452, "Department deal with it.", { size: 23, fill: C.text }));
      s += op(eOp, q);
    }
    b += op(o, s);
  }
  b += captions(t, [
    [3.7, 9.2, "The supplier has sent the wrong order. Again.", "You're hot, tired and the guests arrive tomorrow"],
    [9.2, 15.5, "So you send a quick, angry message", "It feels private. It isn't."],
    [15.5, 21.2, "A screenshot is all the police need", "Insulting someone by message or online is a crime under UAE law"],
    [21.2, 26.6, "It can mean prison, a fine of AED 250,000 to 500,000, or both", "And deportation. Posting photos of people without their consent is a crime too"],
    [26.6, END2, "The better way: polite, factual, and no insults", "If it's getting heated, hand it to the Captain or your Head of Department"],
  ]);
  b += endCard(t, END2, "Think before you send.", "Polite in person, polite online.", icon.phone());
  return b;
}

export const ANIMATIONS = {
  "uae-a1-airport-to-emirates-id.mp4": { seconds: 36, frame: arrival },
  "uae-a2-one-message.mp4": { seconds: 36.5, frame: message },
};
