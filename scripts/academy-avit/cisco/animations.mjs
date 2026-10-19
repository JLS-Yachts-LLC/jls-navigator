// Short silent, captioned animations for "Cisco switch essentials".
import { C, txt, rect, circle, line, g, backdrop, icon } from "../../academy-cyber/art.mjs";
import { W, H, ramp, vis, pt, op, titleCard, endCard, captions, liveTerminal, camera, frameSvg } from "../anim.mjs";
import { switchPanel, T } from "../kit.mjs";
import { CAM_MAC } from "./pictures.mjs";

export { frameSvg };

const swBox = (x, y, name, glow = 0, sub = "") =>
  (glow > 0 ? rect(x - 8, y - 8, 316, 96, 16, "none", C.gold, 4, `opacity="${glow.toFixed(2)}"`) : "") +
  rect(x, y, 300, 80, 12, "#2b3240", "#8e98ab", 2) + txt(x + 150, y + 38, name, { size: 24, weight: 700, fill: C.white, anchor: "middle" }) +
  (sub ? txt(x + 150, y + 64, sub, { size: 17, fill: C.muted, anchor: "middle" }) : "");

// ── ca1: find the port from a MAC address ───────────────────────────────────
function findPort(t) {
  let b = backdrop(W, H);
  b += titleCard(t, 3.5, "Who is plugged in where", "Find the port", "Follow a MAC address from switch to switch");
  const o = vis(t, 3.5, 31.5, 0.5);
  if (o > 0) {
    let s = "";
    // map on the left
    const core = [230, 150], lower = [60, 400], upper = [400, 400];
    const gCore = vis(t, 6, 18, 0.3), gLower = vis(t, 18, 31.5, 0.3);
    s += line(core[0] + 150, core[1] + 80, lower[0] + 150, lower[1], C.white, 6) + line(core[0] + 150, core[1] + 80, upper[0] + 150, upper[1], C.white, 6);
    s += txt(205, 330, "Gi1/0/24", { size: 18, weight: 700, fill: C.gold, anchor: "end", opacity: ramp(t, 9, 9.5) });
    s += swBox(...core, "SW-CORE-01", gCore, "main rack") + swBox(...lower, "SW-LOWER-02", gLower, "lower deck") + swBox(...upper, "SW-UPPER-03", 0, "upper deck");
    // a pulse travelling core → lower
    const p = ramp(t, 16.5, 18.5);
    if (p > 0 && p < 1) { const [x, y] = pt([core[0] + 150, core[1] + 80], [lower[0] + 150, lower[1]], p); s += circle(x, y, 12, C.gold) + circle(x, y, 24, "none", C.gold, 3, 'opacity="0.5"'); }
    // camera under the lower switch, cable from port 6
    const found = ramp(t, 26, 27);
    s += line(lower[0] + 150, lower[1] + 80, 210, 520, found > 0 ? C.amber : C.line, 5);
    s += circle(210, 580, 62, C.deep, found > 0 ? C.amber : C.line, 3) + g(165, 535, 0.9, camera());
    s += txt(210, 672, "Bow camera", { size: 20, fill: C.text, anchor: "middle" });
    const lab = vis(t, 3.8, 31.5, 0.4);
    s += op(lab, rect(300, 545, 300, 74, 10, C.paper) + txt(316, 573, "MAC address", { size: 16, fill: "#5b6476" }) +
      txt(316, 603, CAM_MAC, { size: 22, weight: 700, fill: C.ink, family: "Consolas, monospace" }));
    s += op(found, txt(225, 515, "Gi1/0/6", { size: 22, weight: 700, fill: C.amber }));
    // terminal on the right
    const script = [
      [6, `SW-CORE-01#show mac address-table address ${CAM_MAC}`],
      [8.2, "Vlan    Mac Address       Type        Ports"],
      [8.2, "----    -----------       --------    -----"],
      [8.4, { t: `  50    ${CAM_MAC}    DYNAMIC     Gi1/0/24`, hi: true }],
      [12, "SW-CORE-01#show cdp neighbors"],
      [13.2, "Device ID      Local Intrfce   Holdtme   Platform  Port ID"],
      [13.4, { t: "SW-LOWER-02    Gig 1/0/24      152       C9200L-24 Gig 1/1/1", hi: true }],
      [13.4, "SW-UPPER-03    Gig 1/0/23      138       C9200L-24 Gig 1/1/1"],
    ];
    const script2 = [
      [19, `SW-LOWER-02#show mac address-table address ${CAM_MAC}`],
      [21.2, "Vlan    Mac Address       Type        Ports"],
      [21.2, "----    -----------       --------    -----"],
      [21.4, { t: `  50    ${CAM_MAC}    DYNAMIC     Gi1/0/6`, hi: true }],
      [24, "SW-LOWER-02#show interfaces status | include 1/0/6"],
      [25.4, { t: "Gi1/0/6   CCTV-BOW    connected    50    a-full  a-100", hi: true }],
    ];
    if (t < 18.5) s += op(vis(t, 5.5, 18.5, 0.3), liveTerminal(t, 720, 120, 840, 520, "SSH — SW-CORE-01", script, { size: 21 }));
    else s += op(vis(t, 18.5, 31.5, 0.3), liveTerminal(t, 720, 120, 840, 520, "SSH — SW-LOWER-02", script2, { size: 21 }));
    b += op(o, s);
  }
  b += captions(t, [
    [3.8, 6, "1 · Read the MAC address off the camera's label"],
    [6, 12, "2 · Look it up on the main switch: it's behind Gi1/0/24", "Gi1/0/24 is an uplink, so the camera is further along"],
    [12, 18.5, "3 · show cdp neighbors: SW-LOWER-02 is on the other end"],
    [18.5, 24, "4 · Look it up again on SW-LOWER-02: Gi1/0/6", "Not an uplink this time, so this is the camera's own port"],
    [24, 31.5, "5 · Found it: Gi1/0/6, CCTV-BOW, VLAN 50"],
  ]);
  b += endCard(t, 31.5, "Follow the MAC, switch by switch.", "Uplink? Look on the next switch. Access port? You've found it.", icon.key());
  return b;
}

// ── ca2: restart a frozen PoE camera ────────────────────────────────────────
function poeReset(t) {
  let b = backdrop(W, H);
  b += titleCard(t, 3.5, "Small fixes, done safely", "Restart a frozen camera", "From the switch, without a ladder");
  const o = vis(t, 3.5, 30, 0.5);
  if (o > 0) {
    let s = "";
    const off = t >= 12 && t < 19.5;          // PoE off between shutdown and no shutdown
    const booting = t >= 19.5 && t < 24;
    const live = t >= 24;
    // camera on a mast
    s += rect(198, 230, 10, 120, 4, "#8e98ab") + rect(160, 345, 86, 12, 6, "#8e98ab");
    s += g(150, 140, 1.1, camera(!off));
    s += txt(205, 120, "Bow camera, on the mast", { size: 20, fill: C.muted, anchor: "middle" });
    // monitor
    s += rect(60, 420, 300, 190, 10, "#1d222b", "#4a5468", 2);
    const scr = off ? "#05070a" : "#2c5a7a";
    s += rect(72, 432, 276, 150, 4, scr);
    if (!off) s += `<path d="M72 532 C 130 510, 190 550, 250 520 S 330 510, 348 520 V582 H72 Z" fill="#1d3f58"/>` + rect(180, 470, 70, 26, 4, "#e4e8ef");
    const clock = live ? `06:5${Math.floor(4 + (t - 24) / 6)}:${String(Math.floor(((t - 24) * 1) % 60)).padStart(2, "0")}` : "06:52:11";
    s += txt(336, 452, off ? "" : clock, { size: 16, fill: "#ffffff", anchor: "end", family: "Consolas, monospace" });
    s += txt(210, 512, off ? "NO SIGNAL" : booting ? "CONNECTING…" : live ? "" : "FROZEN", { size: 26, weight: 700, fill: off ? "#9aa5b8" : C.amber, anchor: "middle" });
    s += txt(210, 640, "CCTV monitor", { size: 18, fill: C.muted, anchor: "middle" });
    // cable from switch port to camera, with power bolts when PoE is on
    const sp = switchPanel(470, 120, 560, { ports: { 1: "up", 2: "up", 3: "up", 4: "up", 6: off ? "down" : "up", 7: "up", 8: "up", 9: "poe" }, uplinks: { 1: "up" }, label: "" });
    const p6 = sp.geo.port[6];
    s += `<path d="M${p6.cx} ${p6.cy + 20} C ${p6.cx} 320, 300 260, 230 230" fill="none" stroke="${off ? C.line : C.amber}" stroke-width="6"/>`;
    if (!off) for (let i = 0; i < 3; i++) {
      const q = ((t * 0.5 + i / 3) % 1);
      const bx = (1 - q) ** 3 * p6.cx + 3 * (1 - q) ** 2 * q * p6.cx + 3 * (1 - q) * q * q * 300 + q ** 3 * 230;
      const by = (1 - q) ** 3 * (p6.cy + 20) + 3 * (1 - q) ** 2 * q * 320 + 3 * (1 - q) * q * q * 260 + q ** 3 * 230;
      s += circle(bx, by, 9, C.gold) + circle(bx, by, 16, "none", C.gold, 2, 'opacity="0.5"');
    }
    s += sp.svg + circle(p6.cx, p6.cy, 34, "none", C.gold, 3);
    s += txt(p6.cx, 108, "Gi1/0/6", { size: 18, weight: 700, fill: C.gold, anchor: "middle" });
    // 10-second wait ring
    const wait = vis(t, 13, 19, 0.3);
    if (wait > 0) {
      const p = ramp(t, 13, 19);
      const a = 2 * Math.PI * p, R = 40;
      s += op(wait, circle(500, 470, R, "none", C.line, 8) +
        `<path d="M500 ${470 - R} A ${R} ${R} 0 ${p > 0.5 ? 1 : 0} 1 ${500 + R * Math.sin(a)} ${470 - R * Math.cos(a)}" fill="none" stroke="${C.gold}" stroke-width="8" stroke-linecap="round"/>` +
        txt(500, 480, `${Math.max(0, Math.ceil(10 - p * 10))}s`, { size: 26, weight: 700, fill: C.white, anchor: "middle" }));
    }
    const script = [
      [7, "SW-LOWER-02#configure terminal"],
      [8, "Enter configuration commands, one per line.  End with CNTL/Z."],
      [8.6, "SW-LOWER-02(config)#interface gigabitEthernet 1/0/6"],
      [11, "SW-LOWER-02(config-if)#shutdown"],
      [12.2, { t: "%LINK-5-CHANGED: Interface GigabitEthernet1/0/6, changed", c: T.dim }],
      [12.2, { t: "  state to administratively down", c: T.dim }],
      [12.6, { t: "%ILPOWER-5-IEEE_DISCONNECT: Interface Gi1/0/6: PD removed", c: T.amber }],
      [18.5, "SW-LOWER-02(config-if)#no shutdown"],
      [19.6, { t: "%ILPOWER-7-DETECT: Interface Gi1/0/6: Power Device detected: IEEE PD", c: T.dim }],
      [20, { t: "%ILPOWER-5-POWER_GRANTED: Interface Gi1/0/6: Power granted", c: T.green }],
      [22.5, "SW-LOWER-02(config-if)#end"],
      [23.4, { t: "%LINK-3-UPDOWN: Interface GigabitEthernet1/0/6, changed state to up", c: T.green }],
      [23.8, "SW-LOWER-02#"],
    ];
    s += op(vis(t, 6.5, 30, 0.3), liveTerminal(t, 620, 300, 940, 420, "Console — SW-LOWER-02", script, { size: 20, cps: 26, keep: 10 }));
    b += op(o, s);
  }
  b += captions(t, [
    [3.8, 7, "The bow camera's picture has frozen, and it's up a mast", "Agree with IT first, and check it's the camera's own access port"],
    [7, 11, "Go to that one port: interface gigabitEthernet 1/0/6"],
    [11, 13, "shutdown: the port goes down and the PoE power stops"],
    [13, 18.5, "Wait about 10 seconds"],
    [18.5, 23, "no shutdown: power comes back and the camera starts up"],
    [23, 30, "end, then check the picture is back, and write it in the IT log", "No need to save: the port is exactly as it was before"],
  ]);
  b += endCard(t, 30, "One port, one device. Never an uplink.", "If it doesn't come back, stop and call IT.", camera());
  return b;
}

export const ANIMATIONS = {
  "ca1-find-the-port.mp4": { seconds: 35, frame: findPort },
  "ca2-poe-reset.mp4": { seconds: 33.5, frame: poeReset },
};
