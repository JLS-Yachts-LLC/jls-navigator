// Pictures and animation for the technical courses C1 (yacht network basics), C4 (internet at sea)
// and C6 (UPS, power and the safe power-cycling order). Example addresses only (RFC 1918 / RFC 5737).
import { C, SERIF, txt, para, svg, g, rect, circle, line, backdrop, icon, titleBlock, captionBar } from "../academy-cyber/art.mjs";

const W = 1600, H = 900, TALL = 1000;
const pct = (v) => +(v / W * 100).toFixed(2);
const spot = (x, y, r) => ({ x: pct(x), y: pct(y), r: pct(r) });
const MONO = "Consolas, monospace";

// ── C1-1 Anatomy of an address ──────────────────────────────────────────────
function addressAnatomy() {
  let b = backdrop(W, H) + titleBlock(80, 90, "IP addresses", "Every device needs four things to get online");
  const rows = [
    ["IP address", "192.168.20.57", "This device's own address on the network — like a cabin number.", C.teal],
    ["Subnet mask", "255.255.255.0  (/24)", "Which addresses are \"on the same network\" — here 192.168.20.1 to .254.", C.gold],
    ["Default gateway", "192.168.20.1", "The way out — usually the firewall. Anything not local goes here.", C.green],
    ["DNS server", "192.168.20.1", "Turns names (polaris.jlsyachts.com) into addresses.", C.amber],
  ];
  rows.forEach(([t, v, d, col], i) => {
    const y = 220 + i * 150;
    b += rect(80, y, 1440, 128, 16, C.panel, col, 2);
    b += txt(120, y + 54, t, { size: 30, weight: 700, fill: C.white });
    b += txt(120, y + 98, v, { size: 28, fill: col, family: MONO });
    b += para(700, y + 52, d, { size: 24, width: 56, fill: C.text, lh: 1.4 });
  });
  b += txt(W / 2, 860, "On board, a device normally gets all four automatically from DHCP when it joins the network.", { size: 23, fill: C.muted, anchor: "middle" });
  return svg(W, H, b);
}

// ── C1-2 VLANs on one switch ────────────────────────────────────────────────
function vlans() {
  let b = backdrop(W, H) + titleBlock(80, 90, "VLANs", "One switch, several separate networks");
  const zones = [["VLAN 10 — Crew", C.teal], ["VLAN 20 — Guest", "#8f7cf0"], ["VLAN 30 — Office", C.gold], ["VLAN 40 — AV", C.green], ["VLAN 50 — CCTV", C.amber]];
  // switch
  b += rect(200, 300, 1200, 130, 14, "#2a3446", "#4a5a78", 3) + txt(230, 340, "Core switch", { size: 22, weight: 700, fill: C.white });
  for (let p = 0; p < 20; p++) {
    const col = zones[Math.min(4, Math.floor(p / 4))][1];
    const x = 240 + p * 56;
    b += rect(x, 360, 42, 34, 4, "#121722", col, 3);
  }
  b += rect(1340, 360, 42, 34, 4, "#121722", C.white, 3) + txt(1361, 420, "trunk", { size: 16, fill: C.white, anchor: "middle" });
  b += line(1361, 300, 1361, 230, C.white, 5) + rect(1260, 170, 200, 60, 10, "#5a1f1c", C.red, 2) + txt(1360, 208, "Firewall", { size: 22, weight: 700, fill: C.white, anchor: "middle" });
  zones.forEach(([t, col], i) => {
    const x = 120 + i * 300;
    b += rect(x, 520, 270, 200, 14, C.panel, col, 3) + txt(x + 20, 560, t, { size: 22, weight: 700, fill: C.white });
    b += para(x + 20, 600, ["Crew phones & laptops", "Guests only", "Ship's PCs, printers", "Apple TVs, matrix, control", "Cameras and recorder"][i], { size: 20, width: 22, fill: C.muted });
    b += line(x + 135, 520, 240 + i * 4 * 56 + 80, 394, col, 3, 'opacity="0.7"');
  });
  b += txt(W / 2, 800, "Access ports carry one VLAN to one device. The trunk carries all of them to the firewall,", { size: 22, fill: C.text, anchor: "middle" });
  b += txt(W / 2, 832, "which decides what may talk to what.", { size: 22, fill: C.text, anchor: "middle" });
  return svg(W, H, b);
}

// ── C1-3 ipconfig output (hotspot picture, 1600 × 1000) ─────────────────────
function ipconfig() {
  let b = rect(0, 0, W, TALL, 0, "#e9edf3");
  b += rect(120, 60, 1360, 880, 14, "#0c0c0c", "#3a3a3a", 2) + rect(120, 60, 1360, 50, 14, "#1f1f1f") + rect(120, 96, 1360, 14, 0, "#1f1f1f");
  b += txt(150, 94, "Command Prompt", { size: 20, fill: "#cccccc" });
  const lines = [
    "C:\\Users\\crew> ipconfig",
    "",
    "Windows IP Configuration",
    "",
    "Wireless LAN adapter Wi-Fi:",
    "",
    "   Connection-specific DNS Suffix  . : vessel.lan",
    "   IPv4 Address. . . . . . . . . . . : 192.168.10.57",
    "   Subnet Mask . . . . . . . . . . . : 255.255.255.0",
    "   Default Gateway . . . . . . . . . : 192.168.10.1",
    "",
    "Ethernet adapter Ethernet:",
    "",
    "   Media State . . . . . . . . . . . : Media disconnected",
  ];
  lines.forEach((l, i) => { b += txt(160, 160 + i * 52, l, { size: 28, fill: "#d9d9d9", family: MONO }); });
  return svg(W, TALL, b, null);
}
export const IPCONFIG_SPOTS = {
  gateway: Array.from({ length: 10 }, (_, i) => spot(200 + i * 80, 160 + 9 * 52 - 10, 32)),
};

// ── C4-1 Three ways to the internet ─────────────────────────────────────────
function links() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Internet at sea", "Three ways off the yacht");
  const cards = [
    ["Starlink", "Low Earth orbit, ~550 km up", "Low delay (tens of ms)", "Fast and widely available, but needs a clear view of the sky; rules differ by country and territorial waters.", C.teal],
    ["VSAT", "Geostationary, ~36,000 km up", "Long delay (~600 ms round trip)", "Stabilised dome tracks one satellite; the mast, radar arch or funnel can block it as the yacht turns.", C.gold],
    ["4G / 5G", "Mobile network from shore", "Low delay near the coast", "Cheap and quick in port and close to land; fades a few miles offshore. Needs local or roaming SIMs.", C.green],
  ];
  cards.forEach(([t, a, l, d, col], i) => {
    const x = 80 + i * 490, y = 220;
    b += rect(x, y, 460, 560, 18, C.panel, col, 3);
    b += g(x + 30, y + 30, 0.9, i === 2 ? icon.phone() : icon.satellite(col));
    b += txt(x + 150, y + 90, t, { size: 34, weight: 700, fill: C.white });
    b += txt(x + 30, y + 190, a, { size: 22, fill: col });
    b += txt(x + 30, y + 228, l, { size: 22, fill: col });
    b += para(x + 30, y + 290, d, { size: 22, width: 36, fill: C.text, lh: 1.45 });
  });
  b += txt(W / 2, 840, "Most yachts carry two or three, and the firewall switches between them automatically (failover).", { size: 23, fill: C.gold, anchor: "middle" });
  return svg(W, H, b);
}

// ── C4-2 VSAT blockage zone ─────────────────────────────────────────────────
function blockage() {
  let b = backdrop(W, H) + titleBlock(80, 90, "VSAT blockage", "Why the link drops when the yacht turns");
  // top-down yacht
  const cx = 620, cy = 520;
  b += `<path d="M${cx} ${cy - 260} C${cx + 110} ${cy - 160} ${cx + 110} ${cy + 180} ${cx + 80} ${cy + 260} L${cx - 80} ${cy + 260} C${cx - 110} ${cy + 180} ${cx - 110} ${cy - 160} ${cx} ${cy - 260} Z" fill="#e8ecf2" stroke="#9aa3b2" stroke-width="3"/>`;
  b += circle(cx, cy - 20, 34, "#ffffff", "#9aa3b2", 3) + txt(cx, cy - 12, "dome", { size: 16, fill: "#5b6476", anchor: "middle" });
  b += rect(cx - 16, cy + 60, 32, 32, 6, "#5b6476") + txt(cx + 30, cy + 84, "mast", { size: 18, fill: "#e8ecf2" });
  // blockage wedge from dome through mast
  const ang = Math.PI / 2, spread = 0.32, R = 300;
  const p1 = [cx + R * Math.cos(ang - spread), cy - 20 + R * Math.sin(ang - spread)], p2 = [cx + R * Math.cos(ang + spread), cy - 20 + R * Math.sin(ang + spread)];
  b += `<path d="M${cx} ${cy - 20} L${p1[0]} ${p1[1]} A${R} ${R} 0 0 1 ${p2[0]} ${p2[1]} Z" fill="${C.red}" opacity="0.28"/>`;
  b += txt(cx, cy + 315, "blocked zone", { size: 22, weight: 700, fill: "#ffb3ae", anchor: "middle" });
  // satellite direction arrows
  b += line(cx, cy - 20, cx + 360, cy - 260, C.green, 4, 'stroke-dasharray="12 8"') + txt(cx + 370, cy - 270, "satellite — clear", { size: 22, fill: C.green });
  b += rect(1060, 260, 460, 460, 18, C.panel, C.gold, 2);
  b += para(1090, 310, "The dome must \"see\" one satellite. When the yacht turns so that the mast, radar arch or funnel sits between the dome and the satellite, the signal is blocked until the heading changes.", { size: 22, width: 36, fill: C.white, lh: 1.45 });
  b += para(1090, 560, "Yachts with two domes, or Starlink as well, switch over automatically. Note the heading and time when it happens — it helps the ETO.", { size: 21, width: 36, fill: C.muted, lh: 1.45 });
  return svg(W, H, b);
}

// ── C4-3 Failover ───────────────────────────────────────────────────────────
function failover() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Failover", "The firewall picks the best working link");
  const ins = [["Starlink", C.teal, "primary"], ["VSAT", C.gold, "backup"], ["4G / 5G", C.green, "in port"]];
  ins.forEach(([t, col, role], i) => {
    const y = 250 + i * 170;
    b += rect(100, y, 300, 120, 14, C.panel, col, 3) + txt(130, y + 52, t, { size: 30, weight: 700, fill: C.white }) + txt(130, y + 90, role, { size: 20, fill: col });
    b += line(400, y + 60, 700, 470, col, 5, i === 0 ? 'stroke-dasharray="14 10" opacity="0.5"' : "");
  });
  b += g(370, 270, 0.6, icon.cross());
  b += rect(700, 400, 280, 140, 16, "#5a1f1c", C.red, 3) + g(715, 420, 0.8, icon.firewall()) + txt(890, 485, "Firewall", { size: 28, weight: 700, fill: C.white, anchor: "middle" }) + txt(890, 515, "health checks", { size: 18, fill: "#ffb3ae", anchor: "middle" });
  b += line(980, 470, 1140, 470, C.white, 5) + rect(1140, 400, 360, 140, 16, C.panel, C.line, 2) + txt(1170, 455, "Everyone on board", { size: 26, weight: 700, fill: C.white }) + txt(1170, 495, "guests, crew, office", { size: 20, fill: C.muted });
  b += para(120, 800, "The firewall tests each link every few seconds. If Starlink stops answering, traffic moves to VSAT within moments — calls may drop once, then carry on.", { size: 23, width: 110, fill: C.text, lh: 1.4 });
  return svg(W, H, b);
}

// ── C6-1 UPS front panel (hotspot picture, 1600 × 1000) ─────────────────────
function upsPanel() {
  let b = backdrop(W, TALL) + titleBlock(80, 90, "UPS", "Read the front panel");
  b += rect(360, 220, 880, 640, 20, "#2a2f38", "#4a5a78", 3);
  b += rect(420, 280, 520, 220, 12, "#0f2a1f", "#3a5a4a", 2);
  b += txt(450, 330, "ON BATTERY", { size: 30, weight: 700, fill: C.amber, family: MONO });
  b += txt(450, 380, "Load      42%", { size: 26, fill: "#b9f0d0", family: MONO });
  b += txt(450, 420, "Runtime   18 min", { size: 26, fill: "#b9f0d0", family: MONO });
  b += txt(450, 460, "Input     0 V", { size: 26, fill: "#b9f0d0", family: MONO });
  const led = (x, y, col, on, t) => circle(x, y, 16, on ? col : "#3a404b", "#1c2230", 2) + txt(x + 32, y + 8, t, { size: 22, fill: C.text });
  b += led(1000, 300, C.green, false, "Online");
  b += led(1000, 360, C.amber, true, "On battery");
  b += led(1000, 420, C.red, false, "Replace battery");
  b += led(1000, 480, C.red, false, "Overload");
  b += rect(420, 560, 140, 60, 10, "#3a404b") + txt(490, 598, "Mute", { size: 22, fill: "#e8ebf0", anchor: "middle" });
  b += circle(1140, 760, 40, "#3a404b", "#5a6578", 3) + txt(1140, 768, "⏻", { size: 30, fill: "#e8ebf0", anchor: "middle" });
  b += txt(1140, 830, "Power — don't", { size: 18, fill: "#ffb3ae", anchor: "middle" });
  b += rect(420, 660, 520, 160, 10, "#20252d", "#3a404b", 2) + para(445, 705, "Beeping every few seconds = running on battery. A constant tone = battery nearly flat or overload.", { size: 20, width: 46, fill: C.muted, lh: 1.4 });
  return svg(W, TALL, b);
}
export const UPS_SPOTS = { onbattery: [spot(1000, 360, 40), spot(560, 322, 120)] };

// ── C6-2 Start-up order ─────────────────────────────────────────────────────
function startup() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Power-cycling order", "Start up from the outside in");
  const steps = [
    ["Internet terminals", "Starlink, VSAT modem, 4G router"],
    ["Firewall", "Wait until it's fully up"],
    ["Core switch", "Then the other switches"],
    ["Wi-Fi & PoE devices", "Access points, cameras, phones"],
    ["Servers & storage", "NAS, recorders, servers"],
    ["AV & control", "Control processor, matrix, sources"],
  ];
  steps.forEach(([t, d], i) => {
    const x = 80 + i * 245, y = 300;
    b += rect(x, y, 225, 300, 16, C.panel, C.gold, 2);
    b += circle(x + 40, y + 44, 26, C.gold) + txt(x + 40, y + 54, String(i + 1), { size: 26, weight: 700, fill: C.bg, anchor: "middle" });
    b += para(x + 20, y + 120, t, { size: 25, width: 16, weight: 700, fill: C.white, lh: 1.25 });
    b += para(x + 20, y + 200, d, { size: 19, width: 20, fill: C.muted, lh: 1.35 });
    if (i < 5) b += `<path d="M${x + 228} ${y + 150} l14 0 m-7 -7 l7 7 l-7 7" fill="none" stroke="${C.gold}" stroke-width="3"/>`;
  });
  b += rect(80, 660, 1440, 120, 16, "#3a1414", C.red, 2);
  b += txt(110, 712, "Shutting down? The same list in reverse: AV and control first, the internet terminals last.", { size: 24, weight: 600, fill: C.white });
  b += txt(110, 752, "Never switch the whole rack off at once — and wait for each step to finish booting before the next.", { size: 22, fill: "#ffb3ae" });
  return svg(W, H, b);
}

// ── Animation: how a phone gets online (C1) ─────────────────────────────────
const clamp = (v, a = 0, b2 = 1) => Math.min(b2, Math.max(a, v));
const smooth = (x) => x * x * (3 - 2 * x);
const ramp = (t, t0, t1) => smooth(clamp((t - t0) / (t1 - t0)));
const vis = (t, t0, t1, d = 0.4) => Math.min(ramp(t, t0, t0 + d), 1 - ramp(t, t1 - d, t1));
const op = (o, s) => (o <= 0.001 ? "" : `<g opacity="${o.toFixed(3)}">${s}</g>`);
const captions = (t, list) => list.map(([t0, t1, s, sub]) => { const o = vis(t, t0, t1, 0.35); return o > 0 ? captionBar(W, H, s, { opacity: o, sub }) : ""; }).join("");

function getsOnline(t) {
  let b = backdrop(W, H);
  const tt = vis(t, 0, 3.2, 0.5);
  if (tt > 0) return b + op(tt, txt(W / 2, 360, "NETWORK BASICS", { size: 24, weight: 700, fill: C.gold, anchor: "middle", spacing: 4 }) +
    txt(W / 2, 450, "How a phone gets online", { size: 72, family: SERIF, fill: C.white, anchor: "middle" }) + txt(W / 2, 520, "in four quick steps", { size: 30, fill: C.muted, anchor: "middle" }));
  const P = [200, 470], AP = [520, 470], FW = [860, 470], DNS = [860, 230], WEB = [1360, 470];
  // static pieces
  b += g(P[0] - 60, P[1] - 70, 1.3, icon.phone()) + txt(P[0], P[1] + 100, "Phone", { size: 22, fill: C.white, anchor: "middle" });
  b += circle(AP[0], AP[1], 50, C.panel, C.teal, 3) + `<path d="M${AP[0] - 24} ${AP[1] - 4} a34 34 0 0 1 48 0 M${AP[0] - 12} ${AP[1] + 8} a17 17 0 0 1 24 0" fill="none" stroke="${C.teal}" stroke-width="5" stroke-linecap="round"/>` + txt(AP[0], AP[1] + 90, "Wi-Fi access point", { size: 20, fill: C.muted, anchor: "middle" });
  b += rect(FW[0] - 90, FW[1] - 50, 180, 100, 14, "#5a1f1c", C.red, 3) + txt(FW[0], FW[1] + 8, "Firewall", { size: 24, weight: 700, fill: C.white, anchor: "middle" }) + txt(FW[0], FW[1] + 90, "gateway + DHCP", { size: 20, fill: C.muted, anchor: "middle" });
  b += rect(DNS[0] - 90, DNS[1] - 45, 180, 90, 14, C.panel, C.amber, 3) + txt(DNS[0], DNS[1] + 8, "DNS", { size: 26, weight: 700, fill: C.white, anchor: "middle" });
  b += rect(WEB[0] - 120, WEB[1] - 60, 240, 120, 14, C.panel, C.green, 3) + txt(WEB[0], WEB[1] - 5, "polaris.", { size: 22, fill: C.white, anchor: "middle" }) + txt(WEB[0], WEB[1] + 25, "jlsyachts.com", { size: 22, fill: C.white, anchor: "middle" });
  b += line(P[0] + 60, P[1], AP[0] - 50, AP[1], C.line, 3, 'stroke-dasharray="6 8"') + line(AP[0] + 50, AP[1], FW[0] - 90, FW[1], C.line, 4) + line(FW[0], FW[1] - 50, DNS[0], DNS[1] + 45, C.line, 4) + line(FW[0] + 90, FW[1], WEB[0] - 120, WEB[1], C.line, 4);
  const dot = (a, z, t0, t1, col, label) => {
    if (t < t0 || t > t1) return "";
    const p = ramp(t, t0, t1), x = a[0] + (z[0] - a[0]) * p, y = a[1] + (z[1] - a[1]) * p;
    return circle(x, y, 13, col) + txt(x, y - 70, label, { size: 18, weight: 700, fill: col, anchor: "middle" });
  };
  b += dot(P, FW, 3.6, 5.6, C.gold, "Can I have an address?");
  b += dot(FW, P, 5.8, 7.8, C.gold, "192.168.10.57");
  b += op(ramp(t, 7.8, 8.2), rect(P[0] - 120, P[1] + 130, 240, 74, 10, C.deep, C.gold, 2) + txt(P[0], P[1] + 160, "IP 192.168.10.57", { size: 17, fill: C.white, anchor: "middle", family: MONO }) + txt(P[0], P[1] + 188, "GW .1  DNS .1", { size: 17, fill: C.white, anchor: "middle", family: MONO }));
  b += dot(P, DNS, 10.4, 12.2, C.amber, "Where is polaris…?");
  b += dot(DNS, P, 12.4, 14.0, C.amber, "it's 203.0.113.80");
  b += dot(P, WEB, 16.6, 19.0, C.green, "page please");
  b += dot(WEB, P, 19.2, 21.4, C.green, "here you go");
  b += captions(t, [
    [3.4, 8.6, "1. DHCP: the phone joins the Wi-Fi and asks for an address.", "The firewall hands out an IP address, the gateway and the DNS server."],
    [8.8, 14.6, "2. DNS: the phone asks where polaris.jlsyachts.com is.", "DNS answers with the website's address."],
    [14.8, 22.2, "3–4. The phone sends the request out through the gateway — and the page comes back.", "No address, no gateway or no DNS = no internet, even with full Wi-Fi bars."],
  ]);
  const e = ramp(t, 22.6, 23.2);
  if (e > 0) b += op(e, rect(0, 0, W, H, 0, C.bg) + backdrop(W, H) + g(W / 2 - 60, 230, 1.2, icon.shield()) +
    txt(W / 2, 480, "Address, gateway, DNS.", { size: 54, family: SERIF, fill: C.white, anchor: "middle" }) +
    txt(W / 2, 550, "Check those three first when a device \"has no internet\".", { size: 30, fill: C.muted, anchor: "middle" }));
  return b;
}

export const PICTURES = {
  "n1-address-anatomy.png": addressAnatomy,
  "n2-vlans.png": vlans,
  "n3-ipconfig.png": ipconfig,
  "s1-three-links.png": links,
  "s2-vsat-blockage.png": blockage,
  "s3-failover.png": failover,
  "u1-ups-panel.png": upsPanel,
  "u2-startup-order.png": startup,
};
export const ANIMATIONS = {
  "n4-how-a-phone-gets-online.mp4": { seconds: 26, frame: getsOnline },
};
