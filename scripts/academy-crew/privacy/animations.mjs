// Silent, captioned animation for "Guest privacy, confidentiality and social media".
// gp-a1: how one harmless crew selfie, plus an older post, lets a stranger work out where
// the yacht is and when the owner will be aboard. All names are invented.
import { C, txt, rect, circle, line, g, backdrop, icon, yacht } from "../../academy-cyber/art.mjs";
import { W, H, ramp, vis, op, titleCard, endCard, captions, frameSvg } from "../../academy-avit/anim.mjs";
import { bust, phoneFrame, prop, UNIFORM, SKIN, HAIR } from "../people.mjs";
import { pin } from "./pictures.mjs";

export { frameSvg };

// The phone sits on the left; its screen is 272 × 480 at (14, 40) inside the 300 × 560 frame.
const PX = 110, PY = 60, PS = 1.15;
const P = (sx, sy) => [PX + (14 + sx) * PS, PY + (40 + sy) * PS];
const LENS = [180 - 20, 226]; // left sunglasses lens, screen coordinates

/** A highlight ring around a point on the phone screen. */
const ringAt = (sx, sy, r, o) => { const [x, y] = P(sx, sy); return op(o, circle(x, y, r * PS, "none", C.gold, 5)); };

function lifeRing(cx, cy, r, sw) {
  let s = circle(cx, cy, r, "none", "#f4f6fa", sw);
  for (let a = 0; a < 4; a++) {
    const a0 = a * Math.PI / 2 + 0.35, a1 = a0 + 0.6;
    s += `<path d="M${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}" fill="none" stroke="${C.red}" stroke-width="${sw}"/>`;
  }
  return s;
}

/** The post on the phone's screen (272 × 480). */
function postScreen() {
  let s = rect(0, 0, 272, 480, 0, C.white);
  s += circle(26, 28, 16, "#c79a2c") + g(12, 14, 0.28, bust({ shirt: UNIFORM.deck[0], skin: SKIN[3], hair: HAIR[0] }));
  s += txt(50, 26, "sunny_deckdays", { size: 15, weight: 700, fill: C.ink });
  s += g(48, 32, 0.16, pin("#e5534b")) + txt(66, 46, "Porto Verde Marina", { size: 13, fill: "#4a5568" });
  // the photo
  let p = rect(0, 60, 272, 300, 0, "#8fc3e8");
  p += `<path d="M0 200 L60 182 L130 192 L200 176 L272 188 L272 236 L0 236 Z" fill="#8aa37a"/>` + rect(0, 232, 272, 60, 0, "#2f6ea8") + rect(0, 290, 272, 70, 0, "#c79a63");
  p += rect(34, 150, 16, 84, 1, C.white) + rect(34, 168, 16, 10, 0, C.red) + rect(34, 192, 16, 10, 0, C.red) + rect(31, 140, 22, 10, 2, "#3a465e");
  p += rect(150, 74, 112, 40, 4, "#1f4f7a", C.white, 2) + txt(206, 92, "PORTO VERDE", { size: 12, weight: 800, fill: C.white, anchor: "middle" }) + txt(206, 107, "MARINA", { size: 10, fill: "#cfe3f5", anchor: "middle" });
  p += g(70, 150, 2.2, bust({ shirt: UNIFORM.deck[0], skin: SKIN[3], hair: HAIR[0] }) +
    `<path d="M40 46 Q50 54 60 46" fill="none" stroke="#0b1730" stroke-width="2.5" stroke-linecap="round"/>`);
  // sunglasses (two lenses and a bridge)
  p += `<ellipse cx="${LENS[0]}" cy="${LENS[1]}" rx="17" ry="11" fill="#1d2633"/><ellipse cx="${LENS[0] + 40}" cy="${LENS[1]}" rx="17" ry="11" fill="#1d2633"/>` + line(LENS[0] + 17, LENS[1] - 3, LENS[0] + 23, LENS[1] - 3, "#1d2633", 3);
  p += circle(LENS[0] - 5, LENS[1] - 3, 3, "#f4f6fa") + circle(LENS[0] + 4, LENS[1] + 3, 2, C.red);
  s += `<clipPath id="ph"><rect x="0" y="60" width="272" height="300"/></clipPath><g clip-path="url(#ph)">${p}</g>`;
  s += g(12, 368, 0.24, prop.heart("#e5534b")) + g(44, 369, 0.24, prop.speech("#3a465e"));
  s += txt(14, 412, "sunny_deckdays", { size: 13, weight: 700, fill: C.ink }) + txt(126, 412, "Day off at last!", { size: 13, fill: C.ink });
  s += txt(14, 434, "#crewlife #dayoff", { size: 13, fill: "#2b5fb8" });
  s += txt(14, 462, "JUST NOW", { size: 11, weight: 700, fill: "#8a93a3" });
  return s;
}

/** A clue card in the middle column. */
function clue(t, i, t0, title, sub) {
  const o = Math.min(ramp(t, t0, t0 + 0.5), 1 - ramp(t, 29.2, 29.7));
  if (o <= 0) return "";
  const x = 540, y = 100 + i * 128;
  return op(o, rect(x, y, 450, 112, 14, C.panel, C.gold, 2) + circle(x + 44, y + 56, 24, C.gold) +
    txt(x + 44, y + 65, String(i + 1), { size: 24, weight: 700, fill: C.bg, anchor: "middle" }) +
    txt(x + 86, y + 48, title, { size: 25, weight: 700, fill: C.white }) +
    txt(x + 86, y + 84, sub, { size: 21, fill: C.gold }));
}

function onePost(t) {
  let b = backdrop(W, H);
  b += titleCard(t, 3.5, "Social media", "How one harmless post finds the yacht", "Small clues add up");
  const main = vis(t, 3.5, 34, 0.5);
  if (main > 0) {
    let s = "";
    // the phone, sliding up into place
    const rise = (1 - ramp(t, 3.5, 4.5)) * 60;
    s += `<g transform="translate(${PX} ${PY + rise}) scale(${PS})">${phoneFrame(postScreen())}</g>`;
    // highlights on the phone
    s += ringAt(LENS[0] + 20, LENS[1], 46, vis(t, 9, 14.5, 0.3));
    s += ringAt(42, 188, 54, vis(t, 14.5, 19.5, 0.3)) + ringAt(206, 94, 66, vis(t, 14.5, 19.5, 0.3));
    s += ringAt(110, 40, 64, vis(t, 19.5, 24, 0.3)) + ringAt(44, 457, 40, vis(t, 19.5, 24, 0.3));

    // clue cards
    s += clue(t, 0, 9.3, "A reflection", "Gives away: the yacht's name");
    s += clue(t, 1, 14.8, "Lighthouse and sign", "Gives away: which marina");
    s += clue(t, 2, 19.8, "Location tag, posted live", "Gives away: she's there now");
    s += clue(t, 3, 24.3, "An older post", "Gives away: when the owner arrives");

    // right panel 1: the magnified lens
    const mag = vis(t, 9, 14.5, 0.4);
    if (mag > 0) {
      const [lx, ly] = P(LENS[0], LENS[1]);
      const cx = 1270, cy = 330, R = 190;
      let m = line(lx + 16, ly, cx - R, cy, C.gold, 3, 'stroke-dasharray="8 8"');
      m += `<clipPath id="lens"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>`;
      m += `<g clip-path="url(#lens)">` + rect(cx - R, cy - R, 2 * R, 2 * R, 0, "#1d2633") +
        rect(cx - R, cy + 40, 2 * R, R, 0, "#25313f") + line(cx - R, cy + 40, cx + R, cy + 40, "#3c4a5c", 6) +
        lifeRing(cx - 10, cy - 30, 80, 34) + rect(cx - 110, cy + 54, 200, 44, 8, C.white) +
        txt(cx - 10, cy + 86, "LUMEN SEVEN", { size: 26, weight: 800, fill: "#1d3d6e", anchor: "middle", spacing: 1 }) +
        `<path d="M${cx - 150} ${cy - 120} Q${cx - 60} ${cy - 175} ${cx + 40} ${cy - 160}" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity="0.18"/>` + `</g>`;
      m += circle(cx, cy, R, "none", "#8e98ab", 10) + `<path d="M${cx + R * 0.72} ${cy + R * 0.72} L${cx + R * 1.12} ${cy + R * 1.12}" stroke="#8e98ab" stroke-width="26" stroke-linecap="round"/>`;
      m += txt(cx, cy - R - 20, "Zoomed in on the sunglasses", { size: 22, fill: C.muted, anchor: "middle" });
      s += op(mag, m);
    }

    // right panel 2: the stranger reads the same profile
    const prof = vis(t, 24, 29.5, 0.4);
    if (prof > 0) {
      const x = 1030, y = 100, w = 520, h = 470;
      let m = rect(x, y, w, h, 16, C.paper, "#4a5a78", 3) + rect(x, y, w, 44, 16, "#dfe4ee") + rect(x, y + 28, w, 16, 0, "#dfe4ee");
      m += circle(x + 24, y + 22, 7, "#e5534b") + circle(x + 46, y + 22, 7, "#f0b030") + circle(x + 68, y + 22, 7, "#3fb27f");
      m += txt(x + w / 2, y + 30, "sunny_deckdays · profile", { size: 18, fill: "#5b6476", anchor: "middle" });
      m += circle(x + 60, y + 100, 34, "#c79a2c") + g(x + 32, y + 72, 0.56, bust({ shirt: UNIFORM.deck[0], skin: SKIN[3], hair: HAIR[0] }));
      m += txt(x + 112, y + 96, "sunny_deckdays", { size: 24, weight: 700, fill: C.ink }) + txt(x + 112, y + 124, "Deckhand · living the dream", { size: 18, fill: "#5b6476" });
      // three older posts
      const thumbs = ["#8fc3e8", "#2f6ea8", "#c79a63"];
      thumbs.forEach((c, i) => { m += rect(x + 24 + i * 162, y + 160, 148, 110, 6, c); });
      m += g(x + 30, y + 175, 0.5, yacht()) + g(x + 220, y + 180, 0.7, prop.bottle("#3fb27f")) + g(x + 370, y + 180, 0.7, prop.clock(9, 0));
      // the older post, opened
      const open = ramp(t, 25.5, 26.3);
      m += op(open, rect(x + 24, y + 290, w - 48, 150, 12, C.white, C.red, 3) +
        txt(x + 46, y + 326, "3 DAYS AGO", { size: 16, weight: 700, fill: "#8a93a3" }) +
        txt(x + 46, y + 368, "\"Owner arrives Friday!", { size: 26, weight: 700, fill: C.ink }) +
        txt(x + 46, y + 404, "Busy week ahead #crewlife\"", { size: 26, weight: 700, fill: C.ink }));
      // the stranger
      m += circle(x + w - 10, y + h + 70, 62, C.deep, C.line, 2) + g(x + w - 60, y + h + 22, 1.0, bust({ shirt: "#2d3646", skin: SKIN[1], hair: HAIR[4] }));
      m += txt(x + w - 90, y + h + 80, "A stranger, anywhere", { size: 21, fill: C.muted, anchor: "end" });
      s += op(prof, m);
    }

    // right panel 3: everything put together
    const map = vis(t, 29.5, 34, 0.5);
    if (map > 0) {
      const x = 540, y = 100, w = 1010, h = 560;
      let m = rect(x, y, w, h, 18, "#2f6ea8", C.line, 3);
      m += `<clipPath id="map"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18"/></clipPath><g clip-path="url(#map)">` +
        `<path d="M${x} ${y} L${x + w} ${y} L${x + w} ${y + 150} C${x + 820} ${y + 210} ${x + 700} ${y + 160} ${x + 560} ${y + 230} C${x + 430} ${y + 300} ${x + 330} ${y + 220} ${x + 200} ${y + 270} C${x + 120} ${y + 300} ${x + 60} ${y + 260} ${x} ${y + 290} Z" fill="#8aa37a"/>` +
        rect(x + 520, y + 228, 140, 18, 4, "#c7ced9") + rect(x + 600, y + 230, 18, 90, 4, "#c7ced9") + `</g>`;
      m += txt(x + 470, y + 130, "PORTO VERDE", { size: 22, weight: 700, fill: "#24361d", spacing: 2, anchor: "middle" });
      const drop = ramp(t, 30, 30.8);
      m += g(x + 548, y + 268, 0.12, yacht());
      m += g(x + 560, y + 160 + drop * 60, 0.9, pin(C.red));
      m += op(ramp(t, 30.8, 31.4), rect(x + 680, y + 300, 300, 200, 14, C.deep, C.gold, 3) +
        txt(x + 704, y + 344, "LUMEN SEVEN", { size: 28, weight: 800, fill: C.white }) +
        txt(x + 704, y + 384, "Porto Verde Marina", { size: 22, fill: C.text }) +
        txt(x + 704, y + 416, "There right now", { size: 22, fill: C.text }) +
        txt(x + 704, y + 462, "Owner aboard: Friday", { size: 24, weight: 700, fill: C.gold }));
      s += op(map, m);
    }
    b += op(main, s);
  }
  b += captions(t, [
    [3.8, 9, "A crew member posts a quick selfie on a day off", "No guests in it, and no yacht name. Harmless?"],
    [9, 14.5, "Clue 1: the sunglasses reflect a life ring", "And the life ring carries the yacht's name"],
    [14.5, 19.5, "Clue 2: the lighthouse and the sign show which marina"],
    [19.5, 24, "Clue 3: a location tag, and it was posted just now", "So the yacht is there right now"],
    [24, 29.5, "Clue 4: an older post on the same profile", "\"Owner arrives Friday!\""],
    [29.5, 34, "Put together, a stranger knows where the yacht is", "and when the owner will be on board"],
  ]);
  b += endCard(t, 34, "Post later. Check the background. No tags.", "If in doubt, don't post.", icon.shield(C.gold));
  return b;
}

export const ANIMATIONS = {
  "gp-a1-one-post.mp4": { seconds: 38, frame: onePost },
};
