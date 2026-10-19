// Short silent, captioned animations for "FortiGate essentials".
import { C, txt, rect, circle, line, g, backdrop, icon } from "../../academy-cyber/art.mjs";
import { W, H, ramp, vis, pt, op, clamp, titleCard, endCard, captions, frameSvg } from "../anim.mjs";
import { POLICIES } from "./pictures.mjs";

export { frameSvg };

const tick = (x, y, ok) => circle(x, y, 18, ok ? C.green : C.red) +
  (ok ? `<path d="M${x - 8} ${y} l6 6 l11 -12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
    : line(x - 7, y - 7, x + 7, y + 7, "#fff", 4) + line(x + 7, y - 7, x - 7, y + 7, "#fff", 4));

// ── fa1: a packet walks down the policy list ────────────────────────────────
// Each run: [start, packet label, sub, the row it stops at, why each row did / didn't match]
const RUNS = [
  [3.5, "Crew phone → website", "from CREW · 10.10.20.15 · HTTPS", 2, ["From BUSINESS? No", "Source Lost-Laptop? No", "CREW → Internet, all, ALL: yes"]],
  [13.5, "Lost laptop → website", "from CREW · Lost-Laptop · HTTPS", 1, ["From BUSINESS? No", "CREW, Lost-Laptop: yes"]],
  [21.5, "Guest phone → CCTV recorder", "from GUEST · to 10.10.50.10 · HTTPS", 5, ["From BUSINESS? No", "To Internet? No", "To Internet? No", "To Internet? No", "From BUSINESS? No", "Nothing matched"]],
];
const ROW0 = 205, RH = 76, LX = 440, LW = 720;
function policyOrder(t) {
  let b = backdrop(W, H);
  b += titleCard(t, 3.5, "Firewall policies", "Top to bottom. First match wins.", "Watch three connections walk down the list");
  const o = vis(t, 3.5, 30.5, 0.5);
  if (o > 0) {
    let s = txt(LX + 22, 185, "#", { size: 18, weight: 700, fill: C.muted }) + txt(LX + 70, 185, "Policy", { size: 18, weight: 700, fill: C.muted }) + txt(LX + 330, 185, "From → To", { size: 18, weight: 700, fill: C.muted }) + txt(LX + LW - 68, 185, "Action", { size: 18, weight: 700, fill: C.muted, anchor: "middle" });
    const run = RUNS.findLast((r) => t >= r[0]) ?? RUNS[0];
    const [t0, label, sub, stop, why] = run;
    const step = stop > 2 ? 0.9 : 1.25; // seconds per row
    const pos = clamp((t - t0 - 0.8) / step, 0, stop);
    POLICIES.forEach((p, i) => {
      const y = ROW0 + i * RH;
      const checked = pos >= i - 0.001 && t > t0 + 0.8;
      const isStop = i === stop && pos >= stop;
      const dim = pos >= stop && i > stop;
      const fill = isStop ? (p.act === "ACCEPT" ? "#173d2c" : "#4a1a1a") : C.panel;
      s += op(dim ? 0.35 : 1, rect(LX, y, LW, RH - 12, 12, fill, isStop ? (p.act === "ACCEPT" ? C.green : C.red) : C.line, isStop ? 4 : 2) +
        txt(LX + 22, y + 41, p.id === 0 ? "—" : String(i + 1), { size: 24, weight: 700, fill: C.gold }) +
        txt(LX + 70, y + 41, p.name, { size: 21, weight: 700, fill: C.white }) +
        txt(LX + 330, y + 41, `${p.src} → ${p.dst}`, { size: 18, fill: C.text }) +
        rect(LX + LW - 120, y + 13, 104, 38, 19, p.act === "ACCEPT" ? C.green : C.red) + txt(LX + LW - 68, y + 39, p.act, { size: 18, weight: 700, fill: "#fff", anchor: "middle" }));
      if (checked && i <= Math.floor(pos + 0.001) && why[i]) {
        const ok = i === stop && stop !== POLICIES.length - 1;
        s += tick(LX + LW + 40, y + 32, ok) + txt(LX + LW + 70, y + 39, why[i], { size: 19, fill: ok ? "#bff0d5" : "#ffc9c5" });
      }
    });
    if (pos >= stop && stop < POLICIES.length - 1) s += op(ramp(t, t0 + 0.8 + stop * step + 0.3, t0 + 0.8 + stop * step + 0.8), txt(LX + LW / 2, ROW0 + POLICIES.length * RH + 10, "Policies below the match are never checked", { size: 22, fill: C.muted, anchor: "middle" }));
    // the packet
    const py = ROW0 + pos * RH + 32;
    const outcome = pos >= stop ? (POLICIES[stop].act === "ACCEPT" ? C.green : C.red) : C.gold;
    s += rect(40, py - 52, 360, 104, 16, C.deep, outcome, 3) + txt(58, py - 12, label, { size: 22, weight: 700, fill: C.white }) + txt(58, py + 22, sub, { size: 16, fill: C.muted });
    s += line(400, py, LX - 6, py, outcome, 4) + circle(LX - 6, py, 8, outcome);
    b += op(o, s);
  }
  b += captions(t, [
    [4, 9, "A crew phone opens a website: the firewall starts at the top"],
    [9, 13.3, "#3 Crew-to-Internet is the first match, so it's ACCEPTED", "Nothing below #3 is even looked at"],
    [13.8, 21.3, "The lost laptop: #2 Block-Lost-Laptop matches first, so DENIED", "That's why the specific block sits above the general allow"],
    [21.8, 26.5, "A guest phone tries the CCTV recorder"],
    [26.5, 30.5, "Nothing matches, so the Implicit Deny (policy 0) drops it", "And by default that drop isn't logged"],
  ]);
  b += endCard(t, 30.5, "Top to bottom. First match wins.", "Moving a policy changes who gets in. That's a job for IT.", icon.firewall());
  return b;
}

// ── fa2: SD-WAN failover from Starlink to 4G ────────────────────────────────
function failover(t) {
  let b = backdrop(W, H);
  b += titleCard(t, 3.5, "SD-WAN", "When Starlink drops out", "How the FortiGate moves traffic to 4G, and back");
  const o = vis(t, 3.5, 30, 0.5);
  if (o > 0) {
    let s = "";
    // Starlink loss: 0 → 100% from 10 to 13.5 s, dead 13.5 → 25, back from 25 → 27
    const loss = t < 10 ? 0 : t < 13.5 ? (t - 10) / 3.5 * 100 : t < 25 ? 100 : t < 26.5 ? 100 - (t - 25) / 1.5 * 100 : 0;
    const dead = t >= 13.5 && t < 26.5;
    const on4g = t >= 15 && t < 27.2;
    // links
    const sl = [300, 230], g4 = [300, 560], fw = [760, 395];
    s += g(sl[0] - 70, sl[1] - 80, 1.4, icon.satellite(dead ? "#6b7280" : C.muted)) + txt(sl[0], sl[1] + 80, "Starlink · wan1", { size: 24, weight: 700, fill: C.white, anchor: "middle" });
    s += g(g4[0] - 50, g4[1] - 70, 1.2, icon.phone()) + txt(g4[0], g4[1] + 80, "4G router · wan2", { size: 24, weight: 700, fill: C.white, anchor: "middle" });
    if (t > 9 && t < 14) s += op(vis(t, 9, 14), g(sl[0] + 40, sl[1] - 120, 0.7, icon.warn()) + txt(sl[0] + 75, sl[1] - 130, "obstruction", { size: 18, fill: C.amber, anchor: "middle" }));
    s += line(sl[0] + 60, sl[1], fw[0] - 120, fw[1] - 20, dead ? C.red : C.teal, 6, dead ? 'stroke-dasharray="14 12"' : "");
    s += line(g4[0] + 60, g4[1], fw[0] - 120, fw[1] + 20, C.amber, 6);
    s += rect(fw[0] - 120, fw[1] - 70, 240, 140, 18, "#5a1f1c", C.red, 3) + txt(fw[0], fw[1] - 5, "FortiGate", { size: 30, weight: 700, fill: C.white, anchor: "middle" }) + txt(fw[0], fw[1] + 30, "SD-WAN", { size: 20, fill: "#ffd2cf", anchor: "middle" });
    // the yacht's traffic: dots flowing from the firewall out of the active link
    const via = on4g ? g4 : sl;
    for (let i = 0; i < 6; i++) {
      const q = ((t * 0.7 + i / 6) % 1);
      const [x, y] = pt([fw[0] - 120, fw[1] + (on4g ? 20 : -20)], [via[0] + 60, via[1]], q);
      s += circle(x, y, 8, on4g ? C.amber : C.teal);
    }
    s += txt(fw[0], fw[1] + 120, "Crew · guests · office · AV", { size: 20, fill: C.muted, anchor: "middle" });
    // health-check probes on the Starlink link
    if (t > 4 && t < 27) {
      const q = (t * 2) % 1, [x, y] = pt([fw[0] - 120, fw[1] - 20], [sl[0] + 60, sl[1]], q);
      s += circle(x, y, 5, "#ffffff");
      if (dead && q > 0.6) s += tick(sl[0] + 120, sl[1] + 10, false);
    }
    // SLA panel
    const px = 1000, py = 170;
    s += rect(px, py, 540, 420, 16, C.deep, C.line, 2) + txt(px + 24, py + 44, "Performance SLA: Internet-Check", { size: 22, weight: 700, fill: C.white });
    const row = (y, name, state, l, lat, col) => {
      let r = txt(px + 24, y, name, { size: 21, weight: 700, fill: C.white }) +
        rect(px + 250, y - 24, 100, 34, 17, state === "alive" ? C.green : C.red) + txt(px + 300, y - 1, state, { size: 17, weight: 700, fill: "#fff", anchor: "middle" });
      r += txt(px + 24, y + 40, `loss ${l.toFixed(0)}%`, { size: 19, fill: C.text }) + txt(px + 200, y + 40, lat, { size: 19, fill: C.text });
      r += rect(px + 24, y + 56, 490, 14, 7, C.panel) + rect(px + 24, y + 56, 490 * l / 100, 14, 7, col);
      return r;
    };
    s += row(py + 110, "wan1 Starlink", dead ? "dead" : "alive", loss, dead ? "latency —" : `latency ${(38 + Math.sin(t * 3) * 4).toFixed(0)} ms`, C.red);
    s += row(py + 240, "wan2 4G", "alive", 0, `latency ${(61 + Math.sin(t * 2) * 6).toFixed(0)} ms`, C.red);
    s += txt(px + 24, py + 380, on4g ? "Traffic now: wan2 (4G) — metered" : "Traffic now: wan1 (Starlink)", { size: 21, weight: 700, fill: on4g ? C.amber : C.teal });
    b += op(o, s);
  }
  b += captions(t, [
    [4, 9.5, "Normally the yacht's traffic goes out on Starlink (wan1)", "The health check pings out of each link every half second"],
    [9.5, 13.5, "Something blocks the dish, and the replies stop coming back"],
    [13.5, 19, "Starlink is marked dead, and traffic moves to 4G within seconds", "Calls and VPNs may drop and reconnect"],
    [19, 25, "4G is slower and costs money per gigabyte: tell the Captain", "Check the Starlink app for obstructions or an outage"],
    [25, 30, "When Starlink answers again, traffic usually moves back on its own"],
  ]);
  b += endCard(t, 30, "Internet slow or down? Check SD-WAN first.", "Network › SD-WAN, or diagnose sys sdwan health-check", icon.satellite());
  return b;
}

export const ANIMATIONS = {
  "fa1-policy-order.mp4": { seconds: 34, frame: policyOrder },
  "fa2-sdwan-failover.mp4": { seconds: 33.5, frame: failover },
};
