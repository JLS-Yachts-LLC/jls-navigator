// Still pictures for "Cisco switch essentials". Each entry: file name → () => SVG.
// Terminal pictures show command output in Cisco's layout (checked against Cisco's
// IOS-XE command references — see the course notes in course.mjs) with example data:
// invented names, private addresses, documentation MACs, masked serials.
// Hotspot exercises read SPOTS (percentages of the picture's WIDTH).
import { C, SERIF, txt, para, svg, g, rect, circle, line, backdrop, icon, titleBlock } from "../../academy-cyber/art.mjs";
import { terminal, fitSize, switchPanel, T, MONO, termHeight, wrapLines } from "../kit.mjs";
import { spotsFor } from "../blocks.mjs";
import { VLANS, vlan, mac } from "./net.mjs";

const W = 1600, H = 900;
const spot = spotsFor(W);

/** A full-picture terminal sized to its lines; returns { svg, t } (t = terminal geometry). */
function termPic(title, lines, o = {}) {
  const size = o.size ?? fitSize(lines, W - 120, 26);
  if (o.wrap) lines = wrapLines(lines, Math.floor((W - 120 - 56) / (size * 0.55)));
  const h = Math.max(o.minH ?? 0, Math.ceil(termHeight(lines.length, size) + 80));
  const t = terminal(60, 40, W - 120, h - 80, title, lines, { size, ...o });
  const b = rect(0, 0, W, h, 0, "#0a1328") + t.svg + (o.extra ? o.extra(t) : "");
  return { svg: svg(W, h, b, null), t };
}

/** Spots along one terminal row, from column c0 to c1 (max 10: the player's limit). */
function lineSpots(t, row, c0, c1) {
  const n = Math.min(10, Math.ceil((c1 - c0) / 5) + 1), step = (c1 - c0) / (n - 1);
  const r = Math.max(34, step * t.size * 0.55 * 0.55);
  return [...Array(n)].map((_, i) => spot(t.colX(c0 + i * step), t.rowY(row) - t.size * 0.35, r));
}

// ── The example switch ports (shared by several pictures and the course text) ──
// [port, description, status, vlan, duplex, speed, type]
const TX = "10/100/1000BaseTX";
export const PORTS = [
  ["Gi1/0/1", "AP-MAIN-SALOON", "connected", "trunk", "a-full", "a-1000", TX],
  ["Gi1/0/2", "AP-MAIN-AFT", "connected", "trunk", "a-full", "a-1000", TX],
  ["Gi1/0/3", "OFFICE-PC-1", "connected", "10", "a-full", "a-1000", TX],
  ["Gi1/0/4", "OFFICE-PRINTER", "connected", "10", "a-full", "a-100", TX],
  ["Gi1/0/5", "CCTV-AFT-DECK", "err-disabled", "50", "auto", "auto", TX],
  ["Gi1/0/6", "CCTV-BOW", "connected", "50", "a-full", "a-100", TX],
  ["Gi1/0/7", "APPLETV-SALOON", "connected", "40", "a-full", "a-1000", TX],
  ["Gi1/0/8", "SONOS-SALOON", "connected", "40", "a-full", "a-100", TX],
  ["Gi1/0/9", "PHONE-BRIDGE-DESK", "connected", "60", "a-full", "a-1000", TX],
  ["Gi1/0/10", "CREW-MESS-SPARE", "notconnect", "20", "auto", "auto", TX],
  ["Gi1/0/11", "", "disabled", "1", "auto", "auto", TX],
  ...[...Array(13)].map((_, i) => [`Gi1/0/${12 + i}`, "", "notconnect", "1", "auto", "auto", TX]),
  ["Gi1/1/1", "UPLINK-SW-CORE-01", "connected", "trunk", "full", "1000", "1000BaseSX SFP"],
  ...[2, 3, 4].map((n) => [`Gi1/1/${n}`, "", "notconnect", "1", "full", "1000", "Not Present"]),
];
const statusRow = ([p, n, s, v, d, sp, ty]) => p.padEnd(13) + n.padEnd(19) + s.padEnd(13) + v.padEnd(11) + d.padStart(6) + " " + sp.padStart(6) + " " + ty;
const STATUS_HEAD = "Port         Name               Status       Vlan       Duplex  Speed Type";

// ── 1. Cover ────────────────────────────────────────────────────────────────
function cover() {
  let b = backdrop(W, H);
  const sp = switchPanel(200, 300, 1200, { ports: { 1: "up", 2: "up", 3: "up", 4: "up", 5: "err", 6: "poe", 7: "up", 8: "up", 9: "poe", 13: "up", 14: "up" }, uplinks: { 1: "up", 2: "up" }, label: "" });
  // cables fanning out to devices below
  const devs = [[260, icon.laptop()], [470, icon.phone()], [680, icon.satellite(C.muted)], [890, icon.server()], [1100, icon.laptop("#1b3f6e", C.gold)], [1310, icon.ecdis()]];
  const cols = [C.gold, C.teal, C.amber, C.gold, "#e98ad0", C.green];
  devs.forEach(([x, ic], i) => {
    const port = sp.geo.port[[3, 7, 6, 4, 8, 9][i]];
    b += `<path d="M${port.cx} ${port.cy + 30} C ${port.cx} ${port.cy + 160}, ${x + 50} ${560}, ${x + 50} ${640}" fill="none" stroke="${cols[i]}" stroke-width="5" opacity="0.85"/>`;
    b += circle(x + 50, 690, 62, C.deep, cols[i], 3) + g(x + 10, 650, 0.8, ic);
  });
  b += sp.svg;
  b += txt(W / 2, 110, "CREW ACADEMY · ETO / AV-IT", { size: 22, weight: 700, fill: C.gold, anchor: "middle", spacing: 4 });
  b += txt(W / 2, 200, "Cisco switch essentials", { size: 76, family: SERIF, fill: C.white, anchor: "middle" });
  b += txt(W / 2, 850, "Look first. Change only with IT. Always save what you change.", { size: 28, fill: C.muted, anchor: "middle" });
  return svg(W, H, b);
}

// ── 2. Switch front panel (hotspot picture, 1600 × 760) ─────────────────────
const FP = { x: 100, y: 230, w: 1400 };
function frontPanelGeo() {
  return switchPanel(FP.x, FP.y, FP.w, {
    ports: { 1: "up", 2: "up", 3: "up", 4: "up", 5: "err", 6: "poe", 7: "up", 8: "up", 9: "poe" },
    uplinks: { 1: "up" }, label: "",
  });
}
function frontPanel() {
  const sp = frontPanelGeo();
  let b = backdrop(W, 760) + titleBlock(100, 90, "The switch", "A 24-port PoE access switch, front view");
  b += sp.svg;
  // legend
  const ly = 640;
  [[C.green, "Green — link up (blinking: traffic)"], [C.amber, "Amber — held by spanning tree; normal for about 30 seconds after plugging in"], ["#3c4454", "Off — no link: unplugged, switched off, or shut down by the switch (err-disabled)"]]
    .forEach(([c, t], i) => { b += circle(130, ly + i * 40, 10, c) + txt(155, ly + 8 + i * 40, t, { size: 24, fill: C.text }); });
  b += txt(1500, 560, "The RJ-45 console and the MGMT port are on the back", { size: 22, fill: C.muted, anchor: "end" });
  return svg(W, 760, b);
}
const fp = frontPanelGeo().geo;
export const SPOTS = {
  console: [spot(fp.console.cx, fp.console.cy, fp.console.r)],
  uplink: [spot(fp.uplink[1].cx, fp.uplink[1].cy, fp.uplink[1].r)],
};

// ── 3. Two ways in: console cable and SSH ───────────────────────────────────
function connect() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Getting in", "Two ways to reach the command line");
  // left: console
  b += rect(80, 190, 690, 640, 22, C.panel, C.line, 2);
  b += txt(120, 250, "1 · Console cable", { size: 34, weight: 700, fill: C.white });
  b += txt(120, 290, "Plug straight into the switch. Works even when the network doesn't.", { size: 21, fill: C.muted });
  b += g(120, 330, 2, icon.laptop());
  const small = switchPanel(430, 380, 300, { label: "" });
  const con = small.geo.console;
  b += `<path d="M300 440 C 360 480, 380 540, 460 520 S ${con.cx} 520, ${con.cx} ${con.cy}" fill="none" stroke="#6fa8dc" stroke-width="7"/>` + small.svg + circle(con.cx, con.cy, 14, "none", C.gold, 3);
  b += para(120, 560, "A USB mini-B cable into the CONSOLE port on the front, or a USB-to-RJ-45 console cable into the console port on the back.", { size: 20, width: 62, fill: C.text });
  b += rect(120, 600, 610, 200, 14, C.deep, C.gold, 2);
  b += txt(145, 640, "Terminal settings (PuTTY, Tera Term, SecureCRT)", { size: 22, weight: 700, fill: C.gold });
  [["Speed (baud)", "9600"], ["Data bits", "8"], ["Parity", "None"], ["Stop bits", "1"], ["Flow control", "None"]].forEach(([k, v], i) => {
    b += txt(145, 680 + i * 25, k, { size: 20, fill: C.text, family: MONO }) + txt(420, 680 + i * 25, v, { size: 20, weight: 700, fill: C.white, family: MONO });
  });
  // right: SSH
  b += rect(830, 190, 690, 640, 22, C.panel, C.line, 2);
  b += txt(870, 250, "2 · SSH over the network", { size: 34, weight: 700, fill: C.white });
  b += txt(870, 290, "From a laptop on the management network (or VPN).", { size: 21, fill: C.muted });
  b += g(870, 330, 2, icon.laptop());
  b += circle(1260, 430, 70, C.deep, "#9fb0d4", 3) + txt(1260, 425, "MGMT", { size: 20, weight: 700, fill: C.white, anchor: "middle" }) + txt(1260, 452, "VLAN 99", { size: 18, fill: C.muted, anchor: "middle" });
  b += line(1080, 430, 1190, 430, "#9fb0d4", 5, 'stroke-dasharray="12 10"');
  b += switchPanel(1360, 400, 140, { label: "" }).svg;
  b += line(1330, 430, 1360, 420, "#9fb0d4", 5, 'stroke-dasharray="12 10"');
  const tt = terminal(870, 580, 610, 220, "Windows Terminal", ["C:\\> ssh netadmin@10.10.99.2", "(netadmin@10.10.99.2) Password:", "", "SW-CORE-01>"], { size: 22, prompts: false });
  b += tt.svg;
  b += txt(W / 2, 870, "Your login comes from IT and is yours alone. Never share it, never use someone else's.", { size: 23, fill: C.text, anchor: "middle" });
  return svg(W, H, b);
}

// ── 4. The modes (prompt ladder) ────────────────────────────────────────────
function modes() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Modes", "The prompt tells you where you are");
  const steps = [
    ["SW-CORE-01>", "User EXEC", "Look at a few things. Can't change anything.", C.green, null],
    ["SW-CORE-01#", "Privileged EXEC", "All the show commands. Also reload and erase — careful.", C.teal, "enable"],
    ["SW-CORE-01(config)#", "Global configuration", "Changes the switch, live, the moment you press Enter.", C.amber, "configure terminal"],
    ["SW-CORE-01(config-if)#", "Interface configuration", "Changes one port (here, after: interface Gi1/0/5).", C.red, "interface gi1/0/5"],
  ];
  b += `<defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${C.gold}"/></marker></defs>`;
  steps.forEach(([p, name, d, col, cmd], i) => {
    const x = 80 + i * 40, y = 190 + i * 172, w = 1000 - i * 40;
    if (cmd) {
      b += `<path d="M${x + 20} ${y - 44} L${x + 20} ${y - 6}" stroke="${C.gold}" stroke-width="4" fill="none" marker-end="url(#ar)"/>`;
      b += txt(x + 44, y - 16, cmd, { size: 24, weight: 700, fill: C.gold, family: MONO });
    }
    b += rect(x, y, w, 120, 16, C.panel, col, 3);
    b += txt(x + 26, y + 50, p, { size: 30, weight: 700, fill: col, family: MONO });
    b += txt(x + 26, y + 95, name, { size: 25, weight: 700, fill: C.white });
    b += txt(x + 420, y + 95, d, { size: 21, fill: C.muted });
  });
  b += rect(1140, 190, 380, 260, 16, C.deep, C.line, 2);
  b += txt(1165, 235, "Going back", { size: 26, weight: 700, fill: C.white });
  b += txt(1165, 285, "exit", { size: 24, weight: 700, fill: C.gold, family: MONO }) + txt(1250, 285, "one level up", { size: 21, fill: C.text });
  b += txt(1165, 330, "end", { size: 24, weight: 700, fill: C.gold, family: MONO }) + txt(1250, 330, "back to the # prompt", { size: 21, fill: C.text });
  b += txt(1165, 375, "?", { size: 24, weight: 700, fill: C.gold, family: MONO }) + txt(1250, 375, "what can I type here?", { size: 21, fill: C.text });
  b += txt(1165, 420, "Ctrl+Z", { size: 22, weight: 700, fill: C.gold, family: MONO }) + txt(1270, 420, "same as end", { size: 21, fill: C.text });
  b += rect(1140, 480, 380, 200, 16, "#3a1c1c", C.red, 2);
  b += txt(1165, 525, "In config mode", { size: 26, weight: 700, fill: "#ffb3ae" });
  b += para(1165, 565, "every command changes the switch the moment you press Enter. There's no Undo.", { size: 21, width: 32, fill: C.text });
  return svg(W, H, b);
}

// ── 5. The yacht's VLANs ────────────────────────────────────────────────────
function yachtVlans() {
  let b = backdrop(W, 1000) + titleBlock(80, 90, "VLANs", "One set of switches, many separate networks");
  // firewall + internet
  b += g(330, 270, 1, icon.satellite()) + txt(380, 395, "Starlink · VSAT · 4G", { size: 22, fill: C.muted, anchor: "middle" });
  b += line(440, 330, 600, 330, C.teal, 4);
  b += rect(600, 290, 380, 80, 14, "#5a1f1c", C.red, 3) + txt(790, 340, "Firewall (FortiGate)", { size: 28, weight: 700, fill: C.white, anchor: "middle" });
  // trunk to core
  b += line(790, 370, 790, 450, C.white, 10) + txt(810, 420, "trunk: VLANs 10 20 30 40 50 60 99", { size: 20, weight: 700, fill: C.white });
  b += rect(560, 450, 460, 70, 12, "#2b3240", "#8e98ab", 2) + txt(790, 495, "SW-CORE-01  (main rack)", { size: 24, weight: 700, fill: C.white, anchor: "middle" });
  // trunks to edge switches
  const edges = [[250, "SW-LOWER-02"], [1330, "SW-UPPER-03"]];
  for (const [x, n] of edges) {
    b += line(790, 520, x, 600, C.white, 7);
    b += rect(x - 170, 600, 340, 60, 12, "#2b3240", "#8e98ab", 2) + txt(x, 638, n, { size: 22, weight: 700, fill: C.white, anchor: "middle" });
  }
  b += txt(520, 580, "trunk", { size: 18, fill: C.muted }) + txt(1040, 580, "trunk", { size: 18, fill: C.muted });
  // every switch carries every VLAN: a bundle of coloured lines under the switches
  const cw = 196, gap = 12, x0 = (W - (cw * 7 + gap * 6)) / 2;
  VLANS.forEach((v, i) => { b += line(x0, 690 + i * 4, W - x0, 690 + i * 4, v.color, 3); });
  for (const x of [250, 1330]) b += line(x, 660, x, 690, C.white, 5);
  b += line(790, 520, 790, 690, C.white, 5);
  VLANS.forEach((v, i) => {
    const x = x0 + i * (cw + gap), y = 740;
    b += line(x + cw / 2, 690 + i * 4, x + cw / 2, y, v.color, 4);
    b += rect(x, y, cw, 220, 14, C.panel, v.color, 3);
    b += txt(x + 16, y + 40, `VLAN ${v.id}`, { size: 26, weight: 700, fill: v.color });
    b += para(x + 16, y + 76, v.label, { size: 21, width: 16, weight: 700, fill: C.white });
    b += para(x + 16, y + 140, v.eg, { size: 17, width: 20, fill: C.muted });
    b += txt(x + 16, y + 200, v.net, { size: 15, fill: C.text, family: MONO });
  });
  b += txt(W / 2, 985, "Bridge and engine systems (ECDIS, radar, alarms) normally have their own switches. Leave them to the ETO and the vendor.", { size: 21, fill: C.muted, anchor: "middle" });
  return svg(W, 1000, b);
}

// ── 6. Access port vs trunk port ────────────────────────────────────────────
function accessTrunk() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Port types", "Access ports and trunk ports");
  // access
  b += rect(80, 190, 690, 600, 22, C.panel, C.line, 2);
  b += txt(120, 250, "Access port — one VLAN", { size: 32, weight: 700, fill: C.white });
  b += para(120, 290, "For one device: a PC, printer, camera, Apple TV. The device doesn't know VLANs exist.", { size: 21, width: 56, fill: C.muted });
  b += rect(130, 420, 160, 60, 10, "#2b3240", "#8e98ab", 2) + txt(210, 458, "Switch", { size: 22, weight: 700, fill: C.white, anchor: "middle" });
  b += line(290, 450, 540, 450, C.amber, 10) + txt(415, 430, "VLAN 50 only", { size: 20, weight: 700, fill: C.amber, anchor: "middle" });
  b += circle(600, 450, 60, C.deep, C.amber, 3) + g(560, 410, 0.8, icon.satellite(C.muted)) + txt(600, 545, "CCTV camera", { size: 20, fill: C.text, anchor: "middle" });
  b += rect(120, 600, 610, 160, 12, "#0b1220", "#2b3a55", 2);
  [" interface GigabitEthernet1/0/5", "  description CCTV-AFT-DECK", "  switchport mode access", "  switchport access vlan 50"].forEach((l, i) => {
    b += `<text x="140" y="${640 + i * 30}" font-family="${MONO}" font-size="21" fill="${T.text}" xml:space="preserve">${l}</text>`;
  });
  // trunk
  b += rect(830, 190, 690, 600, 22, C.panel, C.line, 2);
  b += txt(870, 250, "Trunk port — many VLANs", { size: 32, weight: 700, fill: C.white });
  b += para(870, 290, "Between switches, to the firewall, and to Wi-Fi access points that carry crew and guest networks.", { size: 21, width: 56, fill: C.muted });
  b += rect(880, 420, 160, 60, 10, "#2b3240", "#8e98ab", 2) + txt(960, 458, "Switch", { size: 22, weight: 700, fill: C.white, anchor: "middle" });
  [C.gold, C.teal, "#8f7cf0", "#e98ad0", "#9fb0d4"].forEach((c, i) => { b += line(1040, 432 + i * 6, 1290, 432 + i * 6, c, 5); });
  b += txt(1165, 412, "VLANs 20, 30, 99 … tagged", { size: 20, weight: 700, fill: C.white, anchor: "middle" });
  b += circle(1350, 450, 60, C.deep, C.teal, 3) + txt(1350, 458, "AP", { size: 30, weight: 700, fill: C.white, anchor: "middle" }) + txt(1350, 545, "Wi-Fi access point", { size: 20, fill: C.text, anchor: "middle" });
  b += rect(870, 600, 610, 160, 12, "#0b1220", "#2b3a55", 2);
  [" interface GigabitEthernet1/0/1", "  description AP-MAIN-SALOON", "  switchport mode trunk", "  switchport trunk allowed vlan 20,30,99"].forEach((l, i) => {
    b += `<text x="890" y="${640 + i * 30}" font-family="${MONO}" font-size="21" fill="${T.text}" xml:space="preserve">${l}</text>`;
  });
  b += txt(W / 2, 850, "Changing a port's VLAN or trunk list moves devices between networks. That's a job for IT.", { size: 24, fill: C.text, anchor: "middle" });
  return svg(W, H, b);
}

// ── Terminal pictures ───────────────────────────────────────────────────────
const P = "SW-CORE-01#";
const E = "SW-LOWER-02#";

// t1: show interfaces status — hotspot: the err-disabled port, the uplink
function intStatusGeo() {
  const lines = [`${E}show interfaces status`, "", STATUS_HEAD, ...PORTS.map(statusRow), E];
  return termPic("SW-LOWER-02 — SSH", lines, { size: 24 });
}
const tIntStatus = () => intStatusGeo().svg;
{
  const { t } = intStatusGeo();
  SPOTS.errLine = lineSpots(t, 7, 0, 45);
  SPOTS.trunkUplink = lineSpots(t, 3 + PORTS.findIndex((p) => p[0] === "Gi1/1/1"), 0, 52);
}

// t2: show interfaces (one port, with CRC errors)
function tIntDetail() {
  const lines = [
    `${E}show interfaces gigabitEthernet 1/0/7`,
    "GigabitEthernet1/0/7 is up, line protocol is up (connected)",
    `  Hardware is Gigabit Ethernet, address is ${mac(0xa7)} (bia ${mac(0xa7)})`,
    "  Description: APPLETV-SALOON",
    "  MTU 1500 bytes, BW 1000000 Kbit/sec, DLY 10 usec,",
    "     reliability 251/255, txload 1/255, rxload 1/255",
    "  Encapsulation ARPA, loopback not set",
    "  Keepalive set (10 sec)",
    { t: "  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX", hi: true },
    "  input flow-control is on, output flow-control is unsupported",
    "  Last input 00:00:00, output 00:00:00, output hang never",
    "  Last clearing of \"show interface\" counters never",
    "  5 minute input rate 248000 bits/sec, 41 packets/sec",
    "  5 minute output rate 6412000 bits/sec, 560 packets/sec",
    "     8340211 packets input, 2210344018 bytes, 0 no buffer",
    "     Received 120344 broadcasts (98211 multicasts)",
    "     0 runts, 0 giants, 0 throttles",
    { t: "     1532 input errors, 1532 CRC, 0 frame, 0 overrun, 0 ignored", hi: true },
    "     12844120 packets output, 9871233411 bytes, 0 underruns",
    "     0 output errors, 0 collisions, 1 interface resets",
    E,
  ];
  return termPic("SW-LOWER-02 — SSH", lines, { size: 23 }).svg;
}

// t3: show vlan brief
function tVlanBrief() {
  const row = (id, name, st, ports) => String(id).padEnd(5) + name.padEnd(33) + st.padEnd(10) + ports;
  const lines = [
    `${E}show vlan brief`, "",
    "VLAN Name                             Status    Ports",
    "---- -------------------------------- --------- -------------------------------",
    row(1, "default", "active", "Gi1/0/11, Gi1/0/12, Gi1/0/13"),
    ...[[14, 15, 16], [17, 18, 19], [20, 21, 22]].map((r) => row("", "", "", r.map((n) => `Gi1/0/${n}`).join(", "))),
    row("", "", "", "Gi1/0/23, Gi1/0/24, Gi1/1/2"),
    row("", "", "", "Gi1/1/3, Gi1/1/4"),
    row(10, "BUSINESS", "active", "Gi1/0/3, Gi1/0/4"),
    row(20, "CREW", "active", "Gi1/0/10"),
    row(30, "GUEST", "active", ""),
    row(40, "AV", "active", "Gi1/0/7, Gi1/0/8"),
    { t: row(50, "CCTV", "active", "Gi1/0/5, Gi1/0/6"), hi: true },
    row(60, "VOIP", "active", "Gi1/0/9"),
    row(99, "MGMT", "active", ""),
    row(1002, "fddi-default", "act/unsup", ""),
    row(1003, "token-ring-default", "act/unsup", ""),
    row(1004, "fddinet-default", "act/unsup", ""),
    row(1005, "trnet-default", "act/unsup", ""),
    E,
  ];
  return termPic("SW-LOWER-02 — SSH", lines, { size: 24 }).svg;
}

// t4: show interfaces trunk
function tTrunk() {
  const lines = [
    `${E}show interfaces trunk`, "",
    "Port        Mode             Encapsulation  Status        Native vlan",
    "Gi1/0/1     on               802.1q         trunking      1",
    "Gi1/0/2     on               802.1q         trunking      1",
    "Gi1/1/1     on               802.1q         trunking      1",
    "",
    "Port        Vlans allowed on trunk",
    "Gi1/0/1     20,30,99",
    "Gi1/0/2     20,30,99",
    { t: "Gi1/1/1     10,20,30,40,50,60,99", hi: true },
    "",
    "Port        Vlans allowed and active in management domain",
    "Gi1/0/1     20,30,99",
    "Gi1/0/2     20,30,99",
    "Gi1/1/1     10,20,30,40,50,60,99",
    "",
    "Port        Vlans in spanning tree forwarding state and not pruned",
    "Gi1/0/1     20,30,99",
    "Gi1/0/2     20,30,99",
    "Gi1/1/1     10,20,30,40,50,60,99",
    E,
  ];
  return termPic("SW-LOWER-02 — SSH", lines, { size: 23 }).svg;
}

// t5: finding a MAC — core first, then the edge switch
const CAM_MAC = mac(0x21);
function tMac() {
  const head = ["          Mac Address Table", "-------------------------------------------", "", "Vlan    Mac Address       Type        Ports", "----    -----------       --------    -----"];
  const core = [`${P}show mac address-table address ${CAM_MAC}`, ...head,
    { t: `  50    ${CAM_MAC}    DYNAMIC     Gi1/0/24`, hi: true }, "Total Mac Addresses for this criterion: 1", P];
  const edge = [`${E}show mac address-table address ${CAM_MAC}`, ...head,
    { t: `  50    ${CAM_MAC}    DYNAMIC     Gi1/0/6`, hi: true }, "Total Mac Addresses for this criterion: 1", E];
  const t1 = terminal(60, 40, W - 120, 420, "1 · SW-CORE-01 (main rack)", core, { size: 23 });
  const t2 = terminal(60, 500, W - 120, 420, "2 · SW-LOWER-02 (the switch on Gi1/0/24's far end)", edge, { size: 23 });
  return svg(W, 960, rect(0, 0, W, 960, 0, "#0a1328") + t1.svg + t2.svg, null);
}

// t6: CDP and LLDP neighbours on the core
function tNeighbors() {
  const lines = [
    `${P}show cdp neighbors`,
    "Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge",
    "                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone,",
    "                  D - Remote, C - CVTA, M - Two-port Mac Relay",
    "",
    "Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID",
    { t: "SW-LOWER-02      Gig 1/0/24        152             S I   C9200L-24 Gig 1/1/1", hi: true },
    "SW-UPPER-03      Gig 1/0/23        138             S I   C9200L-24 Gig 1/1/1",
    "SEP00005E005340  Gig 1/0/9         171            H P M  IP Phone  Port 1",
    "",
    "Total cdp entries displayed : 3",
    `${P}show lldp neighbors`,
    "Capability codes:",
    "    (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device",
    "    (W) WLAN Access Point, (P) Repeater, (S) Station, (O) Other",
    "",
    "Device ID           Local Intf     Hold-time  Capability      Port ID",
    "FGT-YACHT-01        Gi1/0/48       120        R               internal5",
    "AP-MAIN-BRIDGE      Gi1/0/2        120        B,W             eth0",
    "",
    "Total entries displayed: 2",
    P,
  ];
  return termPic("SW-CORE-01 — SSH", lines, { size: 22 }).svg;
}

// t7: show power inline
function tPower() {
  const row = (i, a, o, p, d, c, m) => i.padEnd(10) + a.padEnd(6) + o.padEnd(11) + p.padStart(5) + " " + d.padEnd(20) + c.padEnd(6) + m.padStart(4);
  const lines = [
    `${E}show power inline`, "",
    "Module   Available     Used     Remaining",
    "          (Watts)     (Watts)    (Watts)",
    "------   ---------   --------   ---------",
    "1           370.0       42.6       327.4",
    "Interface Admin  Oper       Power   Device              Class Max",
    "                            (Watts)",
    "--------- ------ ---------- ------- ------------------- ----- ----",
    row("Gi1/0/1", "auto", "on", "13.2", "Ieee PD", "4", "30.0"),
    row("Gi1/0/2", "auto", "on", "12.8", "Ieee PD", "4", "30.0"),
    row("Gi1/0/3", "auto", "off", "0.0", "n/a", "n/a", "30.0"),
    row("Gi1/0/4", "auto", "off", "0.0", "n/a", "n/a", "30.0"),
    { t: row("Gi1/0/5", "auto", "off", "0.0", "n/a", "n/a", "30.0"), hi: true },
    row("Gi1/0/6", "auto", "on", "6.2", "Ieee PD", "0", "30.0"),
    row("Gi1/0/7", "auto", "off", "0.0", "n/a", "n/a", "30.0"),
    row("Gi1/0/8", "auto", "off", "0.0", "n/a", "n/a", "30.0"),
    row("Gi1/0/9", "auto", "on", "4.9", "IP Phone 8841", "2", "30.0"),
    E,
  ];
  return termPic("SW-LOWER-02 — SSH", lines, { size: 24 }).svg;
}

// t8: show logging (the tail)
function tLogging() {
  const lines = [
    `${E}show logging | include 1/0/5`,
    "Oct 19 06:41:12.114: %LINK-3-UPDOWN: Interface GigabitEthernet1/0/5, changed state to up",
    "Oct 19 06:41:13.115: %LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet1/0/5, changed state to up",
    { t: "Oct 19 06:52:40.201: %PORT_SECURITY-2-PSECURE_VIOLATION: Security violation occurred, caused by MAC address 0000.5e00.5399 on port GigabitEthernet1/0/5.", hi: true },
    { t: "Oct 19 06:52:40.203: %PM-4-ERR_DISABLE: psecure-violation error detected on Gi1/0/5, putting Gi1/0/5 in err-disable state", hi: true },
    "Oct 19 06:52:41.203: %LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet1/0/5, changed state to down",
    "Oct 19 06:52:42.199: %LINK-3-UPDOWN: Interface GigabitEthernet1/0/5, changed state to down",
    E,
  ];
  return termPic("SW-LOWER-02 — SSH", lines, { size: 25, wrap: true }).svg;
}

// t9: show version (the useful lines)
function tVersion() {
  const lines = [
    `${E}show version`,
    "Cisco IOS XE Software, Version 17.15.06",
    { t: "  …", c: T.dim },
    { t: "SW-LOWER-02 uptime is 3 days, 7 hours, 12 minutes", hi: true },
    "Uptime for this control processor is 3 days, 7 hours, 14 minutes",
    "System returned to ROM by Reload Command",
    "System image file is \"flash:packages.conf\"",
    { t: "Last reload reason: Reload Command", hi: true },
    { t: "  …", c: T.dim },
    "Model Number                       : C9200L-24P-4G",
    "System Serial Number               : JAEXXXXXXXX",
    { t: "  …", c: T.dim },
    "Switch Ports Model              SW Version        SW Image              Mode",
    "------ ----- -----              ----------        ----------            ----",
    "*    1 28    C9200L-24P-4G      17.15.6           CAT9K_LITE_IOSXE      INSTALL",
    E,
  ];
  return termPic("SW-LOWER-02 — SSH", lines, { size: 25, wrap: true }).svg;
}

// t10: err-disabled and port security
function portSecurityGeo() {
  const lines = [
    `${E}show interfaces status err-disabled`, "",
    "Port         Name               Status       Reason",
    "Gi1/0/5      CCTV-AFT-DECK      err-disabled psecure-violation",
    `${E}show port-security interface gigabitEthernet 1/0/5`,
    "Port Security              : Enabled",
    "Port Status                : Secure-shutdown",
    "Violation Mode             : Shutdown",
    "Aging Time                 : 0 mins",
    "Aging Type                 : Absolute",
    "SecureStatic Address Aging : Disabled",
    "Maximum MAC Addresses      : 1",
    "Total MAC Addresses        : 1",
    "Configured MAC Addresses   : 0",
    "Sticky MAC Addresses       : 1",
    "Last Source Address:Vlan   : 0000.5e00.5399:50",
    "Security Violation Count   : 1",
    E,
  ];
  return termPic("SW-LOWER-02 — SSH", lines, { size: 24 });
}
const tPortSecurity = () => portSecurityGeo().svg;
{
  const { t } = portSecurityGeo();
  SPOTS.lastMac = lineSpots(t, 15, 1, 45);
  SPOTS.reason = lineSpots(t, 3, 1, 50);
}

// t11: saving
function tSave() {
  const lines = [
    `${E}copy running-config startup-config`,
    "Destination filename [startup-config]?",
    "Building configuration...",
    "[OK]",
    E,
    `${E}write memory`,
    "Building configuration...",
    "[OK]",
    E,
  ];
  return termPic("SW-LOWER-02 — SSH", lines, { size: 30 }).svg;
}

// ── 7. Look vs touch poster ─────────────────────────────────────────────────
function safeVsIt() {
  let b = backdrop(W, H) + titleBlock(80, 90, "The rule", "Look as much as you like. Change only with IT.");
  const cols = [
    ["Safe — just looking", C.green, ["show interfaces status", "show interfaces …", "show vlan brief", "show mac address-table", "show cdp / lldp neighbors", "show power inline", "show logging", "show version", "show running-config"]],
    ["Agreed with IT first", C.amber, ["shutdown / no shutdown on a camera or AP port", "clearing an err-disabled port", "copy running-config startup-config"]],
    ["IT only — never alone", C.red, ["reload", "write erase / erase startup-config", "delete / format flash", "changing VLANs or trunks", "shutting an uplink", "spanning-tree changes", "passwords, AAA, SSH keys", "software upgrades"]],
  ];
  cols.forEach(([t, col, items], i) => {
    const x = 80 + i * 490, y = 200;
    b += rect(x, y, 460, 640, 20, C.panel, col, 3);
    b += txt(x + 28, y + 56, t, { size: 30, weight: 700, fill: col });
    let iy = y + 118;
    items.forEach((it) => {
      const n = Math.ceil(it.length / 30);
      b += circle(x + 36, iy - 8, 7, col) + para(x + 56, iy, it, { size: 21, width: 30, fill: C.text, family: MONO });
      iy += 30 * n + 26;
    });
  });
  return svg(W, H, b);
}

export const PICTURES = {
  "c01-cover.png": cover,
  "c02-front-panel.png": frontPanel,
  "c03-connect.png": connect,
  "c04-modes.png": modes,
  "c05-yacht-vlans.png": yachtVlans,
  "c06-access-trunk.png": accessTrunk,
  "c07-look-vs-change.png": safeVsIt,
  "t01-interfaces-status.png": tIntStatus,
  "t02-show-interface.png": tIntDetail,
  "t03-vlan-brief.png": tVlanBrief,
  "t04-interfaces-trunk.png": tTrunk,
  "t05-mac-address-table.png": tMac,
  "t06-cdp-lldp.png": tNeighbors,
  "t07-power-inline.png": tPower,
  "t08-logging.png": tLogging,
  "t09-version.png": tVersion,
  "t10-port-security.png": tPortSecurity,
  "t11-save-config.png": tSave,
};
export { CAM_MAC };
