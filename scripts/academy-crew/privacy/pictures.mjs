// Still pictures for "Guest privacy, confidentiality and social media".
// Each entry: file name → () => SVG (1600 × 900; the hotspot post is 1600 × 1000).
// People are the shared faceless figures from ../people.mjs. Every name in the
// pictures (yacht, marina, handles) is invented. Hotspot exercises read POST_SPOTS
// (percentages of the picture's WIDTH, as the player expects).
import { C, SERIF, txt, para, svg, g, rect, circle, line, backdrop, icon, yacht, waves, titleBlock } from "../../academy-cyber/art.mjs";
import { person, bust, bubble, prop, UNIFORM, SKIN, HAIR } from "../people.mjs";
import { spotsFor } from "../blocks.mjs";

const W = 1600, H = 900;
const spot = spotsFor(W);

/** A map pin in a 100 × 100 box. */
export const pin = (fill = C.red) =>
  `<path d="M50 96 C30 66 18 52 18 34 A32 32 0 0 1 82 34 C82 52 70 66 50 96 Z" fill="${fill}"/>` + circle(50, 34, 12, "#ffffff");
/** A red "no" slash over a 100 × 100 box. */
const noSign = (col = C.red) => circle(50, 50, 46, "none", col, 8) + line(18, 82, 82, 18, col, 8);
/** A paper shredder in a 100 × 100 box. */
const shredder = () =>
  rect(26, 6, 48, 30, 3, C.paper, "#9fb0d4", 2) + rect(10, 34, 80, 26, 6, "#3a465e", "#4a5a78", 2) + rect(22, 44, 56, 5, 2, "#121722") +
  [0, 1, 2, 3, 4, 5].map((i) => rect(24 + i * 9, 62, 5, 20 + (i % 3) * 7, 1, C.paper)).join("");
/** A smile drawn on a bust's face (bust head centre is 50, 36 in its own box). */
const smile = `<path d="M40 44 Q50 53 60 44" fill="none" stroke="#0b1730" stroke-width="2.5" stroke-linecap="round"/>`;

// ── 1. Cover ────────────────────────────────────────────────────────────────
function cover() {
  let b = backdrop(W, H);
  b += waves(W, 690, 0, C.sea) + waves(W, 725, 1.5, "#0f3160");
  b += g(500, 515, 1, yacht());
  // a closed speech bubble with a lock: what's said on board stays on board
  b += g(665, 120, 2.7, prop.speech("#24468c")) + g(745, 168, 1.1, icon.lock(C.gold));
  // no camera, no location pin
  b += circle(370, 290, 96, C.deep, C.line, 2) + g(310, 230, 1.2, prop.camera()) + g(300, 220, 1.4, noSign());
  b += circle(1230, 290, 96, C.deep, C.line, 2) + g(1180, 236, 1.0, pin(C.teal)) + g(1160, 220, 1.4, noSign());
  b += txt(W / 2, 64, "CREW ACADEMY", { size: 22, weight: 700, fill: C.gold, anchor: "middle", spacing: 4 });
  b += txt(W / 2, 800, "Guest privacy", { size: 66, family: SERIF, fill: C.white, anchor: "middle" });
  b += txt(W / 2, 856, "Confidentiality and social media", { size: 32, fill: C.text, anchor: "middle" });
  return svg(W, H, b);
}

// ── 2. Who wants to know ────────────────────────────────────────────────────
function whoWantsToKnow() {
  let b = backdrop(W, H) + titleBlock(80, 80, "Why it matters", "Who wants to know where the yacht is, and who's on board?", { size: 44 });
  const cards = [
    ["Press and photographers", "A photo or story about a well-known owner or guest can sell for a lot of money.", prop.camera()],
    ["Criminals", "A known schedule tells them when a home is empty, or where someone can be found.", icon.warn()],
    ["Stalkers and obsessive fans", "Some people will travel to wherever a well-known person is staying.", icon.user(C.red)],
    ["Business rivals", "Who the owner meets, and where, can be worth money in a deal.", icon.envelope()],
    ["Brokers and recruiters", "Some fish for who owns or charters a yacht, to win business.", prop.speech(C.teal)],
    ["Friends and other crew", "Not out to harm anyone, but gossip travels and screenshots last for ever.", icon.phone()],
  ];
  const cx = 800, cy = 510;
  cards.forEach(([t, d, ic], i) => {
    const col = i < 3 ? 0 : 1, row = i % 3;
    const x = col ? 1060 : 70, y = 205 + row * 200, w = 470, h = 180;
    b += line(col ? x : x + w, y + h / 2, cx + (col ? 150 : -150), cy, C.line, 2, 'stroke-dasharray="6 8"');
    b += rect(x, y, w, h, 18, C.panel, C.line, 2);
    b += circle(x + 62, y + 70, 44, C.deep) + g(x + 30, y + 38, 0.64, ic);
    b += txt(x + 124, y + 52, t, { size: 26, weight: 700, fill: C.white });
    b += para(x + 124, y + 90, d, { size: 21, width: 30, fill: C.text, lh: 1.35 });
  });
  b += circle(cx, cy, 175, C.deep, C.gold, 3);
  b += g(cx - 135, cy - 40, 0.45, yacht());
  b += txt(cx, cy + 90, "The yacht", { size: 26, weight: 700, fill: C.gold, anchor: "middle" });
  b += txt(W / 2, 868, "Privacy is a big part of what owners and guests are paying for.", { size: 28, weight: 600, fill: C.gold, anchor: "middle" });
  return svg(W, H, b);
}

// ── 3. What a confidentiality agreement usually covers ─────────────────────
function agreement() {
  let b = backdrop(W, H) + titleBlock(80, 80, "Your confidentiality agreement", "What it usually covers", { size: 50 });
  const items = [
    ["Who is on board", "Owners and guests: names, faces, families, friends.", icon.user(C.gold)],
    ["Where and when", "Where the yacht is, where it goes next, and when.", pin(C.teal)],
    ["What happens on board", "Conversations, behaviour, visitors, parties.", prop.speech(C.teal)],
    ["Photos and recordings", "Pictures, videos and voice notes from on board.", prop.camera()],
    ["The yacht itself", "Layout, security, systems, alarm and door codes.", icon.lock(C.gold)],
    ["Business and money", "The owner's business, deals, costs, what you overhear.", icon.envelope()],
    ["Guest information", "Passports, preference sheets, health notes, guest lists.", prop.passport()],
    ["Charters", "Charter guests often sign for privacy too, in the charter contract.", icon.shield(C.gold)],
  ];
  const cw = 350, gap = 20, x0 = (W - (cw * 4 + gap * 3)) / 2;
  items.forEach(([t, d, ic], i) => {
    const x = x0 + (i % 4) * (cw + gap), y = 200 + Math.floor(i / 4) * 255;
    b += rect(x, y, cw, 235, 16, C.panel, C.line, 2);
    b += circle(x + 56, y + 56, 38, C.deep) + g(x + 28, y + 28, 0.56, ic);
    b += para(x + 108, y + 50, t, { size: 25, weight: 700, fill: C.white, width: 16, lh: 1.2 });
    b += para(x + 26, y + 140, d, { size: 21, width: 29, fill: C.text, lh: 1.4 });
  });
  // the two things to remember
  b += rect(x0, 730, 710, 120, 16, C.panel2, C.amber, 3) + g(x0 + 24, 755, 0.7, icon.warn());
  b += para(x0 + 120, 780, "It usually lasts after you leave the yacht, often with no end date.", { size: 25, weight: 600, width: 44, fill: C.white, lh: 1.35 });
  b += rect(x0 + 750, 730, 710, 120, 16, C.panel2, C.green, 3) + g(x0 + 774, 755, 0.7, icon.tick());
  b += para(x0 + 870, 780, "It doesn't stop you reporting a crime, a safety problem or abuse.", { size: 25, weight: 600, width: 44, fill: C.white, lh: 1.35 });
  return svg(W, H, b);
}

// ── 4. The post (hotspot picture, 1600 × 1000) ─────────────────────────────
const PH = 1000;
const POST = { x: 380, w: 840, photoY: 130, photoH: 640 };
function post() {
  const { x, w, photoY, photoH } = POST;
  let b = rect(0, 0, W, PH, 0, "#e6eaf1");
  b += rect(x, 20, w, 960, 18, C.white, "#cfd6e2", 2);
  // header: avatar, handle and location tag
  b += circle(x + 52, 74, 30, "#c79a2c") + g(x + 27, 49, 0.5, bust({ shirt: UNIFORM.deck[0], skin: SKIN[2], hair: HAIR[1] }));
  b += txt(x + 100, 66, "sunny_deckdays", { size: 25, weight: 700, fill: C.ink });
  b += g(x + 98, 76, 0.3, pin("#e5534b")) + txt(x + 130, 103, "Porto Verde Marina", { size: 22, fill: "#4a5568" });
  b += txt(x + w - 30, 74, "•••", { size: 26, weight: 700, fill: "#4a5568", anchor: "end" });
  // ── the photo ──
  let p = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb6e3"/><stop offset="1" stop-color="#cfe6f5"/></linearGradient></defs>`;
  p += rect(x, photoY, w, photoH, 0, "url(#sky)");
  // far shore and the marina sign
  p += `<path d="M${x} 360 L${x + 120} 330 L${x + 260} 345 L${x + 420} 320 L${x + 600} 340 L${x + w} 325 L${x + w} 400 L${x} 400 Z" fill="#8aa37a"/>`;
  p += rect(x, 392, w, 130, 0, "#2f6ea8");
  // lighthouse on the breakwater
  p += rect(x + 180, 300, 26, 92, 2, C.white) + rect(x + 180, 322, 26, 14, 0, C.red) + rect(x + 180, 352, 26, 14, 0, C.red) + rect(x + 176, 288, 34, 14, 3, "#3a465e");
  // marina sign on two posts
  const sx = x + 560, sy = 238;
  p += rect(sx + 30, sy + 74, 10, 90, 2, "#5a6578") + rect(sx + 220, sy + 74, 10, 90, 2, "#5a6578");
  p += rect(sx, sy, 260, 80, 8, "#1f4f7a", C.white, 4);
  p += txt(sx + 130, sy + 34, "PORTO VERDE", { size: 25, weight: 800, fill: C.white, anchor: "middle", spacing: 2 });
  p += txt(sx + 130, sy + 63, "MARINA  ·  BERTH C14", { size: 18, weight: 600, fill: "#cfe3f5", anchor: "middle" });
  // aft deck: rail, teak, a lounger
  p += rect(x, 520, w, 250, 0, "#c79a63");
  for (let i = 0; i < 9; i++) p += line(x, 540 + i * 26, x + w, 540 + i * 26, "#b2864f", 2);
  p += line(x, 470, x + w, 470, "#d8dee8", 6);
  for (let i = 0; i < 8; i++) p += line(x + 40 + i * 110, 470, x + 40 + i * 110, 522, "#d8dee8", 5);
  // the life ring with the yacht's name
  const rx = x + 120, ry = 470;
  p += circle(rx, ry, 64, "none", "#f4f6fa", 30);
  for (let a = 0; a < 4; a++) p += `<path d="M${rx + 64 * Math.cos(a * Math.PI / 2 + 0.35)} ${ry + 64 * Math.sin(a * Math.PI / 2 + 0.35)} A64 64 0 0 1 ${rx + 64 * Math.cos(a * Math.PI / 2 + 0.95)} ${ry + 64 * Math.sin(a * Math.PI / 2 + 0.95)}" fill="none" stroke="${C.red}" stroke-width="30"/>`;
  p += rect(rx - 78, ry + 50, 156, 34, 6, C.white, "#9aa5b8", 1.5) + txt(rx, ry + 74, "LUMEN SEVEN", { size: 19, weight: 800, fill: "#1d3d6e", anchor: "middle", spacing: 1 });
  // a guest relaxing in the background
  p += g(x + 660, 380, 1.0, person({ shirt: UNIFORM.guest[0], legs: UNIFORM.guest[1], skin: SKIN[0], hair: HAIR[2], long: true, arm: "phone" }));
  p += rect(x + 620, 590, 190, 40, 10, C.white, "#9aa5b8", 2) + rect(x + 640, 630, 8, 40, 2, "#9aa5b8") + rect(x + 780, 630, 8, 40, 2, "#9aa5b8");
  // the crew member's selfie, big in the foreground
  p += g(x + 250, 420, 3.5, bust({ shirt: UNIFORM.deck[0], skin: SKIN[2], hair: HAIR[1] }) + smile);
  b += `<clipPath id="photo"><rect x="${x}" y="${photoY}" width="${w}" height="${photoH}"/></clipPath><g clip-path="url(#photo)">${p}</g>`;
  // ── below the photo ──
  b += g(x + 26, 786, 0.42, prop.heart("#e5534b")) + g(x + 84, 788, 0.42, prop.speech("#3a465e"));
  b += txt(x + 30, 870, "248 likes", { size: 22, weight: 700, fill: C.ink });
  b += txt(x + 30, 910, "sunny_deckdays", { size: 23, weight: 700, fill: C.ink }) + txt(x + 210, 910, "Best office in the world. Day off at last!", { size: 23, fill: C.ink });
  b += txt(x + 30, 946, "#yachtlife #crewlife", { size: 23, fill: "#2b5fb8" }) + txt(x + 258, 946, "#LumenSeven", { size: 23, weight: 700, fill: "#2b5fb8" });
  b += txt(x + w - 30, 870, "JUST NOW", { size: 16, fill: "#8a93a3", anchor: "end" });
  return svg(W, PH, b, null);
}
export const POST_SPOTS = {
  // the guest in the background (figure at x+660, scale 1: 100 × 240 box from y 380)
  guest: [spot(POST.x + 710, 450, 70), spot(POST.x + 710, 560, 70)],
  // where the yacht is: the marina sign and the location tag
  where: [spot(POST.x + 690, 278, 120), spot(POST.x + 210, 96, 105)],
  // the yacht's name: the life ring and the hashtag
  name: [spot(POST.x + 120, 480, 100), spot(POST.x + 330, 940, 85)],
};

// ── 5. When a guest asks for a photo with you ──────────────────────────────
function guestPhoto() {
  let b = backdrop(W, H) + titleBlock(80, 80, "Guests and photos", "When a guest asks for a photo with you", { size: 50 });
  b += rect(80, 200, 600, 640, 20, C.panel, C.line, 2);
  b += bubble(110, 225, 420, 100, "Come and be in our photo!", { size: 26 });
  b += g(170, 380, 1.75, person({ shirt: UNIFORM.guest[0], legs: UNIFORM.guest[1], skin: SKIN[3], hair: HAIR[0], arm: "wave", mood: "happy" }));
  b += g(400, 380, 1.75, person({ shirt: UNIFORM.interior[0], legs: UNIFORM.interior[1], skin: SKIN[0], hair: HAIR[2], long: true, mood: "happy" }));
  b += txt(255, 820, "Guest", { size: 22, weight: 600, fill: C.muted, anchor: "middle" }) + txt(487, 820, "You", { size: 22, weight: 600, fill: C.muted, anchor: "middle" });
  const rows = [
    [true, "Follow your yacht's policy. Where it's allowed, it's their photo, on their phone, not yours."],
    [true, "Not sure? Smile and say you'll just check with your Head of Department."],
    [false, "Don't post it, share it or tag the yacht, even if they post it first."],
    [false, "Never ask guests for a photo or a selfie, however famous they are."],
    [true, "If a guest's post shows more than it should, tell your HoD. Don't comment on it."],
  ];
  rows.forEach(([ok, s], i) => {
    const y = 205 + i * 128;
    b += rect(730, y, 790, 112, 14, C.panel, ok ? C.green : C.red, 2);
    b += g(752, y + 24, 0.64, ok ? icon.tick() : icon.cross());
    b += para(838, y + 46, s, { size: 24, width: 52, fill: C.white, lh: 1.35 });
  });
  return svg(W, H, b);
}

// ── 6. People ashore ───────────────────────────────────────────────────────
function ashore() {
  let b = backdrop(W, H) + titleBlock(80, 80, "People ashore", "Friendly questions, fishing for answers", { size: 50 });
  const askers = [
    ["A friend from home", "So who've you got on board? Anyone famous?", { shirt: UNIFORM.shore[0], legs: UNIFORM.shore[1], skin: SKIN[1], hair: HAIR[0] }],
    ["Crew from another yacht", "Is that your boat at the end of the dock? Who owns her?", { shirt: "#3f7d5c", legs: "#2d3646", skin: SKIN[4], hair: HAIR[3], long: true }],
    ["A \"journalist\"", "I'm writing about yachting. Just background: where's she going next?", { shirt: "#7a5a9a", legs: "#2d3646", skin: SKIN[0], hair: HAIR[4] }],
    ["A recruiter or broker", "Before I put you forward, tell me who your owner is.", { shirt: "#2d3646", legs: "#2d3646", skin: SKIN[2], hair: HAIR[1], long: true }],
  ];
  const cw = 350, gap = 20, x0 = (W - (cw * 4 + gap * 3)) / 2;
  askers.forEach(([who, says, look], i) => {
    const x = x0 + i * (cw + gap);
    b += bubble(x, 195, cw, 160, says, { size: 24 });
    b += g(x + 110, 410, 1.15, person({ ...look, arm: i === 3 ? "phone" : "down" }));
    b += txt(x + 168, 715, who, { size: 24, weight: 700, fill: C.white, anchor: "middle" });
  });
  // the answer
  b += rect(80, 750, 1440, 110, 18, C.deep, C.gold, 3);
  b += circle(150, 805, 40, C.panel2) + g(112, 767, 0.76, bust({ shirt: UNIFORM.deck[0], skin: SKIN[3], hair: HAIR[0] }));
  b += txt(220, 800, "Your answer, every time:", { size: 22, fill: C.muted });
  b += txt(220, 840, "\"Sorry, I can't talk about the boat or who's on it.\"", { size: 34, weight: 700, fill: C.gold });
  return svg(W, H, b);
}

// ── 7. Guest data: five rules ──────────────────────────────────────────────
function guestData() {
  let b = backdrop(W, H) + titleBlock(80, 80, "Guest data on board", "Five rules for guest information", { size: 50 });
  // what counts
  const kinds = [["Passports and visas", prop.passport()], ["Preference sheets", icon.envelope()], ["Health and diet notes", prop.pills()], ["Guest lists", icon.user(C.gold)]];
  kinds.forEach(([t, ic], i) => {
    const x = 80 + i * 365;
    b += rect(x, 190, 345, 76, 38, C.panel2, C.line, 2) + g(x + 14, 196, 0.64, ic) + txt(x + 90, 238, t, { size: 23, weight: 600, fill: C.white });
  });
  const rules = [
    ["Only who needs it", "Share it only with crew who need it to do their job.", icon.user(C.teal)],
    ["The yacht's channels", "Use the yacht's own systems and the people the Captain names.", icon.shield(C.gold)],
    ["Never personal apps", "No personal email, WhatsApp or photos on your own phone.", icon.phone()],
    ["Lock it away", "Paper in a locked drawer. Lock the screen when you step away.", icon.lock(C.gold)],
    ["Shred it", "When it's no longer needed, shred or delete it as your yacht's policy says.", shredder()],
  ];
  const cw = 280, gap = 15, x0 = (W - (cw * 5 + gap * 4)) / 2;
  rules.forEach(([t, d, ic], i) => {
    const x = x0 + i * (cw + gap), y = 300;
    b += rect(x, y, cw, 500, 18, C.panel, C.line, 2);
    b += circle(x + cw / 2, y + 100, 66, C.deep) + g(x + cw / 2 - 45, y + 55, 0.9, ic);
    if (i === 2) b += g(x + cw / 2 - 45, y + 55, 0.9, noSign());
    b += txt(x + 24, y + 215, `${i + 1}`, { size: 22, weight: 700, fill: C.gold });
    b += txt(x + 24, y + 252, t, { size: 24, weight: 700, fill: C.white });
    b += para(x + 24, y + 298, d, { size: 22, width: 21, fill: C.text, lh: 1.4 });
  });
  b += txt(W / 2, 860, "Health information is extra sensitive under data protection law: keep it tighter still.", { size: 25, weight: 600, fill: C.gold, anchor: "middle" });
  return svg(W, H, b);
}

// ── 8. CVs: describe the role, not the people ──────────────────────────────
function cv() {
  let b = backdrop(W, H) + titleBlock(80, 80, "After you leave", "Describe the role, not the people", { size: 50 });
  const card = (x, ok, head, lines) => {
    const col = ok ? C.green : C.red;
    let s = rect(x, 200, 700, 590, 18, C.paper, col, 4);
    s += rect(x, 200, 700, 70, 18, col) + rect(x, 250, 700, 20, 0, col);
    s += txt(x + 30, 248, head, { size: 28, weight: 700, fill: C.white });
    s += g(x + 610, 208, 0.56, ok ? icon.tick(C.white) : icon.cross(C.white));
    s += g(x + 621, 219, 0.34, ok ? `<path d="M28 51 L44 66 L73 36" fill="none" stroke="${C.green}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>` : line(33, 33, 67, 67, C.red, 12) + line(67, 33, 33, 67, C.red, 12));
    s += txt(x + 30, 320, "EXPERIENCE", { size: 18, weight: 700, fill: "#7a8394", spacing: 2 });
    lines.forEach(([l, bad], i) => {
      const y = 380 + i * 78;
      if (bad) s += rect(x + 20, y - 34, 660, 50, 8, "#fde3e1", C.red, 2);
      s += txt(x + 34, y, l, { size: 24, fill: C.ink, weight: i === 0 ? 700 : 400 });
    });
    return s;
  };
  b += card(80, false, "Gives too much away", [
    ["Chief Stew, 60 m motor yacht, 2023–2026", false],
    ["Private family of [the owner's full name]", true],
    ["Looked after [a famous guest] for a week", true],
    ["Owner's usual summer: [places and dates]", true],
    ["Photos of the guest cabins on my website", true],
  ]);
  b += card(820, true, "Professional and discreet", [
    ["Chief Stew, 60 m motor yacht, 2023–2026", false],
    ["Private use and charter, Med and Caribbean", false],
    ["Led an interior team of 6, up to 12 guests", false],
    ["Silver service, wine service, events", false],
    ["References available on request", false],
  ]);
  b += txt(W / 2, 852, "Naming the yacht itself? Some agreements allow it, some don't: check yours.", { size: 26, weight: 600, fill: C.gold, anchor: "middle" });
  return svg(W, H, b);
}

export const PICTURES = {
  "gp-01-cover.png": cover,
  "gp-02-who-wants-to-know.png": whoWantsToKnow,
  "gp-03-agreement.png": agreement,
  "gp-04-post.png": post,
  "gp-05-guest-photo.png": guestPhoto,
  "gp-06-ashore.png": ashore,
  "gp-07-guest-data.png": guestData,
  "gp-08-cv.png": cv,
};
