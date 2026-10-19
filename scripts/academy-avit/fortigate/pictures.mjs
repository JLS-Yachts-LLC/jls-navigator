// Still pictures for "FortiGate essentials" (FortiOS 7.4 / 7.6). Each entry: file name → () => SVG.
// CLI output follows the layouts in Fortinet's admin guides and technical tips (see the notes
// in course.mjs); GUI screens are simplified drawings of the FortiOS 7.x layout, not
// screenshots. Example data only: private / CGNAT / documentation addresses, invented names,
// masked serials and build numbers.
import { C, SERIF, txt, para, svg, g, rect, circle, line, backdrop, icon, titleBlock } from "../../academy-cyber/art.mjs";
import { terminal, fitSize, firewallPanel, guiFrame, guiTable, T, MONO, termHeight, wrapLines } from "../kit.mjs";
import { spotsFor } from "../blocks.mjs";

const W = 1600, H = 900;
const spot = spotsFor(W);
export const SPOTS = {};
export const HOST = "FGT-YACHT-01";
const P = `${HOST} # `;
const FORTI_PROMPT = /^([A-Za-z0-9_.-]+(?: \([A-Za-z0-9_-]+\))? # )(.*)$/;

function termPic(title, lines, o = {}) {
  const size = o.size ?? fitSize(lines, W - 120, 26);
  if (o.wrap) lines = wrapLines(lines, Math.floor((W - 120 - 56) / (size * 0.55)));
  const h = Math.max(o.minH ?? 0, Math.ceil(termHeight(lines.length, size) + 80));
  const t = terminal(60, 40, W - 120, h - 80, title, lines, { size, promptRe: FORTI_PROMPT, ...o });
  return { svg: svg(W, h, rect(0, 0, W, h, 0, "#0a1328") + t.svg, null), t, lines };
}
function lineSpots(t, row, c0, c1) {
  const n = Math.min(10, Math.ceil((c1 - c0) / 5) + 1), step = (c1 - c0) / (n - 1);
  const r = Math.max(34, step * t.size * 0.55 * 0.55);
  return [...Array(n)].map((_, i) => spot(t.colX(c0 + i * step), t.rowY(row) - t.size * 0.35, r));
}

// ── The example yacht firewall ───────────────────────────────────────────────
// wan1 = Starlink (DHCP, carrier-grade NAT address), wan2 = 4G router, internal5 = trunk to SW-CORE-01.
export const IF = [
  ["BUSINESS", 10, "10.10.10.1/24"], ["CREW", 20, "10.10.20.1/24"], ["GUEST", 30, "10.10.30.1/24"], ["AV", 40, "10.10.40.1/24"],
  ["CCTV", 50, "10.10.50.1/24"], ["VOIP", 60, "10.10.60.1/24"], ["MGMT", 99, "10.10.99.1/24"],
];
/** The policy list, in sequence (top to bottom). */
export const POLICIES = [
  { id: 7, name: "Business-to-Internet", src: "BUSINESS", dst: "Internet", sa: "all", da: "all", svc: "ALL", act: "ACCEPT", nat: true },
  { id: 11, name: "Block-Lost-Laptop", src: "CREW", dst: "Internet", sa: "Lost-Laptop", da: "all", svc: "ALL", act: "DENY", nat: false },
  { id: 3, name: "Crew-to-Internet", src: "CREW", dst: "Internet", sa: "all", da: "all", svc: "ALL", act: "ACCEPT", nat: true },
  { id: 4, name: "Guest-to-Internet", src: "GUEST", dst: "Internet", sa: "all", da: "all", svc: "ALL", act: "ACCEPT", nat: true },
  { id: 5, name: "Office-view-CCTV", src: "BUSINESS", dst: "CCTV", sa: "all", da: "NVR", svc: "HTTPS", act: "ACCEPT", nat: false },
  { id: 0, name: "Implicit Deny", src: "any", dst: "any", sa: "all", da: "all", svc: "ALL", act: "DENY", nat: false },
];

// ── 1. Cover ────────────────────────────────────────────────────────────────
function cover() {
  let b = backdrop(W, H);
  const fp = firewallPanel(250, 330, 1100, { links: { wan1: true, wan2: true, 5: true } });
  // internet links above, networks below
  [[420, "Starlink"], [800, "VSAT"], [1180, "4G / 5G"]].forEach(([x, n]) => {
    b += g(x - 50, 175, 0.9, icon.satellite()) + txt(x, 300, n, { size: 22, fill: C.muted, anchor: "middle" }) + line(x, 305, x, 330, C.teal, 3, 'opacity="0.6"');
  });
  const nets = [["Business", C.gold], ["Crew", C.teal], ["Guest", "#8f7cf0"], ["AV", "#e98ad0"], ["CCTV", C.amber], ["Phones", C.green]];
  nets.forEach(([n, col], i) => {
    const x = 300 + i * 200;
    b += line(800, 520, x, 640, col, 4, 'opacity="0.8"') + rect(x - 80, 640, 160, 56, 12, C.panel, col, 3) + txt(x, 676, n, { size: 22, weight: 700, fill: C.white, anchor: "middle" });
  });
  b += fp.svg;
  b += txt(W / 2, 80, "CREW ACADEMY · ETO / AV-IT", { size: 22, weight: 700, fill: C.gold, anchor: "middle", spacing: 4 });
  b += txt(W / 2, 150, "FortiGate essentials", { size: 72, family: SERIF, fill: C.white, anchor: "middle" });
  b += txt(W / 2, 800, "Read the firewall, find why traffic is blocked, check the internet links — and change nothing without IT.", { size: 26, fill: C.muted, anchor: "middle" });
  return svg(W, H, b);
}

// ── 2. Ports (hotspot picture, 1600 × 640) ──────────────────────────────────
const FPX = { x: 100, y: 230, w: 1400 };
const fpGeo = () => firewallPanel(FPX.x, FPX.y, FPX.w, { links: { wan1: true, wan2: true, 5: true } });
function ports() {
  let b = backdrop(W, 640) + titleBlock(100, 90, "The firewall", "A 60F-style desktop FortiGate: the ports");
  b += fpGeo().svg;
  b += para(100, 520, "Simplified drawing: the port order and position differ between models (40F, 60F, 70F, 90G, 100F). The labels are what matter: WAN ports face the internet links, the numbered ports face the ship.", { size: 22, width: 120, fill: C.muted });
  return svg(W, 640, b);
}
{
  const g0 = fpGeo().geo;
  SPOTS.wan1 = [spot(g0.port.wan1.cx, g0.port.wan1.cy, g0.port.wan1.r)];
  SPOTS.console = [spot(g0.console.cx, g0.console.cy, g0.console.r)];
}

// ── 3. The firewall's job on board ──────────────────────────────────────────
function role() {
  let b = backdrop(W, 1000) + titleBlock(80, 90, "Where it sits", "Every link to shore, every network on board, one firewall");
  // WAN side
  b += g(170, 200, 1, icon.satellite()) + txt(220, 330, "Starlink", { size: 24, weight: 700, fill: C.white, anchor: "middle" }) + txt(220, 358, "wan1", { size: 20, fill: C.gold, anchor: "middle", family: MONO });
  b += g(470, 200, 1, icon.phone()) + txt(520, 330, "4G router", { size: 24, weight: 700, fill: C.white, anchor: "middle" }) + txt(520, 358, "wan2", { size: 20, fill: C.gold, anchor: "middle", family: MONO });
  b += line(220, 370, 640, 470, C.teal, 5) + line(520, 370, 680, 470, C.teal, 5);
  b += rect(150, 390, 160, 40, 20, C.deep, C.teal, 2) + txt(230, 417, "SD-WAN zone", { size: 18, fill: C.teal, anchor: "middle" });
  // the firewall
  b += rect(560, 470, 480, 120, 18, "#5a1f1c", C.red, 3) + txt(800, 520, "FortiGate", { size: 34, weight: 700, fill: C.white, anchor: "middle" }) +
    txt(800, 558, "policies · NAT · DHCP · VPN · logs", { size: 20, fill: "#ffd2cf", anchor: "middle" });
  // shore VPN
  b += line(1040, 520, 1260, 330, C.gold, 4, 'stroke-dasharray="12 10"');
  b += g(1250, 200, 1, icon.server()) + txt(1300, 330, "Shore office / IT", { size: 22, weight: 700, fill: C.white, anchor: "middle" }) + txt(1300, 358, "IPsec VPN", { size: 20, fill: C.gold, anchor: "middle" });
  // trunk to core
  b += line(800, 590, 800, 660, C.white, 8) + txt(820, 635, "internal5 → trunk to SW-CORE-01", { size: 20, weight: 700, fill: C.white });
  // VLAN interfaces
  const cw = 196, gap = 12, x0 = (W - (cw * 7 + gap * 6)) / 2;
  const cols = [C.gold, C.teal, "#8f7cf0", "#e98ad0", C.amber, C.green, "#9fb0d4"];
  IF.forEach(([n, v, ip], i) => {
    const x = x0 + i * (cw + gap);
    b += line(800, 660, x + cw / 2, 720, cols[i], 4);
    b += rect(x, 720, cw, 170, 14, C.panel, cols[i], 3);
    b += txt(x + 16, 760, n, { size: 24, weight: 700, fill: cols[i] });
    b += txt(x + 16, 795, `VLAN ${v}`, { size: 19, fill: C.text });
    b += txt(x + 16, 830, ip, { size: 17, fill: C.text, family: MONO });
    b += txt(x + 16, 865, "gateway + DHCP", { size: 16, fill: C.muted });
  });
  b += txt(W / 2, 960, "Each VLAN has its own interface on the firewall. Traffic between them, or out to the internet, needs a policy.", { size: 23, fill: C.text, anchor: "middle" });
  return svg(W, 1000, b);
}

// ── GUI menu ────────────────────────────────────────────────────────────────
const MENU = ["Dashboard", "Network", "Policy & Objects", "Security Profiles", "VPN", "User & Authentication", "WiFi & Switch Controller", "System", "Security Fabric", "Log & Report"];
const gui = (h, active, url) => guiFrame(40, 30, W - 80, h - 60, { menu: MENU, active, url: url ?? "https://10.10.99.1", host: HOST });

// g1: Dashboard → Status (hotspot: the firmware version; the uptime)
function dashGeo() {
  const h = 900, f = gui(h, "Dashboard");
  const { x, y, w } = f.box;
  let s = f.svg + txt(x + 30, y + 46, "Dashboard  ›  Status", { size: 24, weight: 700, fill: "#1b2433" });
  // System Information widget
  const card = (cx, cy, cw, ch, title) => rect(cx, cy, cw, ch, 8, "#ffffff", "#d3d9e4", 1.5) + rect(cx, cy, cw, 40, 8, "#f1f4f8") + txt(cx + 16, cy + 27, title, { size: 18, weight: 700, fill: "#3b4252" });
  const sx = x + 30, sy = y + 80;
  s += card(sx, sy, 560, 420, "System Information");
  const rows = [["Hostname", HOST], ["Serial Number", "FGT60FTKXXXXXXXX"], ["Firmware", "v7.6.6 build3xxx (Mature)"], ["Mode", "NAT"], ["System Time", "2026/10/19 10:56:23"], ["Uptime", "12d 04h 37m"], ["WAN IP", "100.64.0.10"]];
  const geo = {};
  rows.forEach(([k, v], i) => {
    const ry = sy + 80 + i * 48;
    s += txt(sx + 20, ry, k, { size: 18, fill: "#5b6476" }) + txt(sx + 210, ry, v, { size: 18, weight: 600, fill: "#1b2433" });
    geo[k] = { cx: sx + 210 + v.length * 4.4, cy: ry - 6, w: v.length * 8.8 };
  });
  // CPU / Memory / Sessions
  const gauge = (gx, gy, title, pct, label) => {
    let o = card(gx, gy, 300, 200, title);
    const R = 60, a = Math.PI * pct / 100;
    o += `<path d="M${gx + 90} ${gy + 160} A ${R} ${R} 0 0 1 ${gx + 210} ${gy + 160}" fill="none" stroke="#e6eaf0" stroke-width="18"/>`;
    o += `<path d="M${gx + 90} ${gy + 160} A ${R} ${R} 0 0 1 ${gx + 150 - R * Math.cos(a)} ${gy + 160 - R * Math.sin(a)}" fill="none" stroke="#3fb27f" stroke-width="18"/>`;
    o += txt(gx + 150, gy + 150, label, { size: 24, weight: 700, fill: "#1b2433", anchor: "middle" });
    return o;
  };
  s += gauge(sx + 590, sy, "CPU", 12, "12%") + gauge(sx + 910, sy, "Memory", 48, "48%");
  s += card(sx + 590, sy + 220, 620, 200, "Sessions") + txt(sx + 610, sy + 330, "1,284", { size: 44, weight: 700, fill: "#1b2433" }) + txt(sx + 780, sy + 330, "active sessions", { size: 18, fill: "#5b6476" });
  s += card(sx, sy + 450, 1210, 230, "Licenses");
  [["FortiCare Support", "Registered", "#3fb27f"], ["Firmware & General Updates", "Licensed", "#3fb27f"], ["IPS", "Licensed", "#3fb27f"], ["Web Filtering", "Licensed", "#3fb27f"]].forEach(([n, v, c], i) => {
    s += circle(sx + 30, sy + 515 + i * 40, 8, c) + txt(sx + 50, sy + 521 + i * 40, n, { size: 18, fill: "#1b2433" }) + txt(sx + 420, sy + 521 + i * 40, v, { size: 18, fill: "#5b6476" });
  });
  return { svg: svg(W, h, rect(0, 0, W, h, 0, "#dfe4ee") + s, null), geo };
}
const dashboard = () => dashGeo().svg;
{
  const { geo } = dashGeo();
  const f = geo.Firmware, u = geo.Uptime;
  SPOTS.firmware = [-1, 0, 1].map((i) => spot(f.cx + i * f.w / 3, f.cy, 40));
  SPOTS.uptime = [-1, 0, 1].map((i) => spot(u.cx + i * u.w / 3, u.cy, 34));
}

// g2: Network → Interfaces
function interfaces() {
  const h = 820, f = gui(h, "Network");
  const { x, y } = f.box;
  let s = f.svg + txt(x + 30, y + 46, "Network  ›  Interfaces", { size: 24, weight: 700, fill: "#1b2433" });
  const up = { t: "Up", pill: "#3fb27f" }, down = { t: "Down", pill: "#e5534b" };
  const rows = [
    [{ t: "wan1 (Starlink)", b: true }, "Physical", up, "100.64.0.10/10 (DHCP)", "PING"],
    [{ t: "wan2 (4G)", b: true }, "Physical", up, "192.168.8.2/24", "PING"],
    [{ t: "internal5", b: true }, "Physical", up, "0.0.0.0/0", ""],
    ...IF.map(([n, v, ip]) => [`    ${n}`, `VLAN ${v}`, up, ip, n === "MGMT" ? "PING HTTPS SSH" : "PING"]),
    [{ t: "internal (ports 1–4)", b: true }, "Hardware switch", down, "192.168.1.99/24", "PING HTTPS"],
  ];
  s += guiTable(x + 30, y + 80, [["Name", 290], ["Type", 190], ["Status", 120], ["IP/Netmask", 280], ["Administrative Access", 300]], rows, { rh: 46 }).svg;
  s += txt(x + 30, y + 650, "The VLAN interfaces sit under internal5, the trunk to the main switch. Admin access only on MGMT, never on WAN.", { size: 18, fill: "#5b6476" });
  return svg(W, h, rect(0, 0, W, h, 0, "#dfe4ee") + s, null);
}

// g3: Policy & Objects → Firewall Policy (By Sequence)
function policyList() {
  const h = 760, f = gui(h, "Policy & Objects");
  const { x, y } = f.box;
  let s = f.svg + txt(x + 30, y + 46, "Policy & Objects  ›  Firewall Policy", { size: 24, weight: 700, fill: "#1b2433" });
  s += rect(x + 30, y + 70, 150, 36, 6, "#2b5fb8") + txt(x + 105, y + 94, "+ Create New", { size: 16, weight: 700, fill: "#fff", anchor: "middle" });
  s += rect(x + 195, y + 70, 150, 36, 6, "#ffffff", "#c3cad8", 1.5) + txt(x + 270, y + 94, "Policy Match", { size: 16, fill: "#1b2433", anchor: "middle" });
  s += rect(x + 1000, y + 70, 270, 36, 6, "#ffffff", "#c3cad8", 1.5) + txt(x + 1135, y + 94, "Interface Pair View | By Sequence", { size: 15, fill: "#1b2433", anchor: "middle" });
  const rows = POLICIES.map((p, i) => [
    { t: p.id === 0 ? "" : String(i + 1), c: "#5b6476" },
    { t: p.name, b: true },
    p.id === 0 ? "—" : String(p.id),
    p.src, p.dst, p.sa, p.da, p.svc,
    { t: p.act, pill: p.act === "ACCEPT" ? "#3fb27f" : "#e5534b" },
    p.nat ? "NAT" : "",
  ]);
  s += guiTable(x + 30, y + 130, [["#", 46], ["Name", 230], ["ID", 56], ["From", 120], ["To", 110], ["Source", 130], ["Destination", 130], ["Service", 96], ["Action", 120], ["NAT", 60]], rows, { rh: 52, size: 17, hi: { 5: "#fff3f2" } }).svg;
  s += txt(x + 30, y + 520, "# = the order policies are checked (top to bottom). ID = the policy's permanent number; it never changes when you move a policy.", { size: 17, fill: "#5b6476" });
  s += txt(x + 30, y + 548, "\"Internet\" is the SD-WAN zone (wan1 + wan2). Lost-Laptop is an address object for one crew laptop reported lost. NVR = the CCTV recorder.", { size: 17, fill: "#5b6476" });
  return svg(W, h, rect(0, 0, W, h, 0, "#dfe4ee") + s, null);
}

// g4: Network → SD-WAN → Performance SLAs
function sdwanGui() {
  const h = 700, f = gui(h, "Network");
  const { x, y } = f.box;
  let s = f.svg + txt(x + 30, y + 46, "Network  ›  SD-WAN  ›  Performance SLAs", { size: 24, weight: 700, fill: "#1b2433" });
  s += rect(x + 30, y + 80, 1230, 480, 8, "#ffffff", "#d3d9e4", 1.5);
  s += txt(x + 50, y + 118, "Internet-Check", { size: 20, weight: 700, fill: "#1b2433" }) + txt(x + 230, y + 118, "ping → 8.8.8.8, 1.1.1.1 every 500 ms", { size: 17, fill: "#5b6476" });
  const rows = [
    [{ t: "wan1 (Starlink)", b: true }, { t: "Dead", pill: "#e5534b" }, "100%", "—", "—", { t: "✗ SLA failed", c: "#b3261e" }],
    [{ t: "wan2 (4G)", b: true }, { t: "Alive", pill: "#3fb27f" }, "0%", "61 ms", "8 ms", { t: "✓ SLA met", c: "#1f7a4c" }],
  ];
  s += guiTable(x + 50, y + 150, [["Interface", 240], ["Status", 150], ["Packet loss", 170], ["Latency", 160], ["Jitter", 160], ["SLA target (latency < 250 ms, loss < 5%)", 330]], rows, { rh: 56, size: 18 }).svg;
  // tiny latency chart
  const cx = x + 50, cy = y + 340;
  s += txt(cx, cy, "Latency, last 10 minutes", { size: 17, weight: 700, fill: "#3b4252" });
  s += rect(cx, cy + 14, 1190, 180, 4, "#fafbfd", "#e6eaf0", 1);
  let d1 = "", d2 = "";
  for (let i = 0; i <= 60; i++) {
    const px = cx + 10 + i * 19.5;
    const l1 = i < 42 ? 38 + Math.sin(i * 1.3) * 6 + (i % 7 === 0 ? 14 : 0) : null;
    const l2 = 60 + Math.sin(i * 0.9) * 9;
    if (l1 !== null) d1 += `${d1 ? "L" : "M"}${px} ${cy + 180 - l1 * 1.4} `;
    d2 += `${d2 ? "L" : "M"}${px} ${cy + 180 - l2 * 1.4} `;
  }
  s += `<path d="${d1}" fill="none" stroke="#2b5fb8" stroke-width="3"/><path d="${d2}" fill="none" stroke="#f0a030" stroke-width="3"/>`;
  s += txt(cx + 20, cy + 40, "● wan1 Starlink", { size: 16, fill: "#2b5fb8" }) + txt(cx + 180, cy + 40, "● wan2 4G", { size: 16, fill: "#c77d10" });
  s += line(cx + 10 + 42 * 19.5, cy + 20, cx + 10 + 42 * 19.5, cy + 190, "#e5534b", 2, 'stroke-dasharray="6 6"') + txt(cx + 10 + 42 * 19.5 + 8, cy + 40, "Starlink lost", { size: 15, fill: "#b3261e" });
  return svg(W, h, rect(0, 0, W, h, 0, "#dfe4ee") + s, null);
}

// g5: Log & Report → Forward Traffic
function forwardLog() {
  const h = 700, f = gui(h, "Log & Report");
  const { x, y } = f.box;
  let s = f.svg + txt(x + 30, y + 46, "Log & Report  ›  Forward Traffic", { size: 24, weight: 700, fill: "#1b2433" });
  s += rect(x + 30, y + 70, 600, 36, 6, "#ffffff", "#c3cad8", 1.5) + txt(x + 44, y + 94, "Source: 10.10.20.66   ✕", { size: 16, fill: "#1b2433" });
  const rows = [
    ["10:41:07", "10.10.20.66", "142.250.0.10", "HTTPS", { t: "Deny", pill: "#e5534b" }, "Block-Lost-Laptop (11)"],
    ["10:41:05", "10.10.20.66", "203.0.113.25", "HTTPS", { t: "Deny", pill: "#e5534b" }, "Block-Lost-Laptop (11)"],
    ["10:40:58", "10.10.20.66", "8.8.8.8", "DNS", { t: "Deny", pill: "#e5534b" }, "Block-Lost-Laptop (11)"],
    ["10:39:12", "10.10.20.15", "203.0.113.10", "HTTPS", { t: "Accept", pill: "#3fb27f" }, "Crew-to-Internet (3)"],
    ["10:39:10", "10.10.30.44", "198.51.100.80", "HTTPS", { t: "Accept", pill: "#3fb27f" }, "Guest-to-Internet (4)"],
  ];
  s += guiTable(x + 30, y + 130, [["Date/Time", 150], ["Source", 170], ["Destination", 190], ["Service", 110], ["Result", 120], ["Policy", 290]], rows, { rh: 52, size: 17 }).svg;
  s += para(x + 30, y + 480, "Traffic stopped by the Implicit Deny (policy 0) is NOT logged unless IT has switched on logging for it, so an empty log doesn't prove nothing was blocked.", { size: 18, width: 120, fill: "#5b6476" });
  return svg(W, h, rect(0, 0, W, h, 0, "#dfe4ee") + s, null);
}

// g6: Backup dialog
function backupGui() {
  const h = 760, f = gui(h, "Dashboard");
  const { x, y } = f.box;
  let s = f.svg;
  // admin menu dropped down (top right)
  const mx = 40 + W - 80 - 300, my = 30 + 96;
  s += rect(mx, my, 280, 210, 8, "#ffffff", "#c3cad8", 1.5);
  ["System", "Configuration ▸", "Change Password", "Logout"].forEach((m, i) => {
    if (i === 1) s += rect(mx + 2, my + 8 + i * 48, 276, 44, 0, "#e8f0fb");
    s += txt(mx + 20, my + 38 + i * 48, m, { size: 18, weight: i === 1 ? 700 : 400, fill: "#1b2433" });
  });
  s += rect(mx - 200, my + 56, 190, 140, 8, "#ffffff", "#c3cad8", 1.5);
  ["Backup", "Restore", "Revisions"].forEach((m, i) => {
    if (i === 0) s += rect(mx - 198, my + 62, 186, 40, 0, "#e8f0fb");
    s += txt(mx - 180, my + 90 + i * 42, m, { size: 18, weight: i === 0 ? 700 : 400, fill: "#1b2433" });
  });
  // dialog
  const dx = x + 80, dy = y + 120;
  s += rect(dx, dy, 700, 460, 10, "#ffffff", "#c3cad8", 2) + rect(dx, dy, 700, 56, 10, "#f1f4f8");
  s += txt(dx + 24, dy + 37, "Backup System Configuration", { size: 22, weight: 700, fill: "#1b2433" });
  const radio = (rx, ry, on, label) => circle(rx, ry, 10, "#fff", "#2b5fb8", 2) + (on ? circle(rx, ry, 5, "#2b5fb8") : "") + txt(rx + 20, ry + 6, label, { size: 18, fill: "#1b2433" });
  s += txt(dx + 24, dy + 110, "Backup to", { size: 18, fill: "#5b6476" }) + radio(dx + 220, dy + 104, true, "Local PC") + radio(dx + 380, dy + 104, false, "USB Disk");
  s += txt(dx + 24, dy + 170, "File format", { size: 18, fill: "#5b6476" }) + radio(dx + 220, dy + 164, true, "FortiOS") + radio(dx + 380, dy + 164, false, "YAML");
  s += txt(dx + 24, dy + 230, "Encryption", { size: 18, fill: "#5b6476" }) + rect(dx + 210, dy + 212, 50, 26, 13, "#3fb27f") + circle(dx + 247, dy + 225, 10, "#fff");
  s += txt(dx + 24, dy + 290, "Password", { size: 18, fill: "#5b6476" }) + rect(dx + 210, dy + 268, 300, 36, 4, "#fff", "#c3cad8", 1.5) + txt(dx + 222, dy + 293, "••••••••••••", { size: 18, fill: "#1b2433" });
  s += para(dx + 24, dy + 350, "Keep the password with the backup in IT's password vault. An encrypted backup can't be restored without it.", { size: 17, width: 70, fill: "#b3261e" });
  s += rect(dx + 450, dy + 400, 110, 40, 6, "#2b5fb8") + txt(dx + 505, dy + 426, "OK", { size: 18, weight: 700, fill: "#fff", anchor: "middle" });
  s += rect(dx + 570, dy + 400, 110, 40, 6, "#ffffff", "#c3cad8", 1.5) + txt(dx + 625, dy + 426, "Cancel", { size: 18, fill: "#1b2433", anchor: "middle" });
  return svg(W, h, rect(0, 0, W, h, 0, "#dfe4ee") + s, null);
}

// ── CLI pictures ────────────────────────────────────────────────────────────
const SSH = `SSH — ${HOST}`;

function tStatus() {
  return termPic(SSH, [
    `${P}get system status`,
    "Version: FortiGate-60F v7.6.6,build3xxx,26xxxx (GA.M)",
    "Firmware Signature: certified",
    { t: "  … (security database versions) …", c: T.dim },
    "Serial-Number: FGT60FTKXXXXXXXX",
    "BIOS version: 05000xxx",
    "Log hard disk: Not available",
    `Hostname: ${HOST}`,
    "Operation Mode: NAT",
    "Current virtual domain: root",
    "Max number of virtual domains: 10",
    "Virtual domains status: 1 in NAT mode, 0 in TP mode",
    "Virtual domain configuration: disable",
    "FIPS-CC mode: disable",
    "Current HA mode: standalone",
    "Branch point: xxxx",
    "Release Version Information: GA",
    "System time: Mon Oct 19 10:56:23 2026",
    "Last reboot reason: warm reboot",
    P,
  ], { size: 25 }).svg;
}

function tPhysical() {
  return termPic(SSH, [
    `${P}get system interface physical`,
    "== [onboard]",
    "        ==[wan1]",
    "                mode: dhcp",
    "                ip: 100.64.0.10 255.192.0.0",
    "                ipv6: ::/0",
    { t: "                status: up", hi: true },
    "                speed: 1000Mbps (Duplex: full)",
    "        ==[wan2]",
    "                mode: static",
    "                ip: 192.168.8.2 255.255.255.0",
    "                ipv6: ::/0",
    "                status: up",
    "                speed: 1000Mbps (Duplex: full)",
    "        ==[internal5]",
    "                mode: static",
    "                ip: 0.0.0.0 0.0.0.0",
    "                ipv6: ::/0",
    "                status: up",
    "                speed: 1000Mbps (Duplex: full)",
    { t: "  …", c: T.dim },
    P,
  ], { size: 24 }).svg;
}

function routingGeo() {
  return termPic(SSH, [
    `${P}get router info routing-table all`,
    "Codes: K - kernel, C - connected, S - static, R - RIP, B - BGP",
    "       O - OSPF, IA - OSPF inter area",
    "       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2",
    "       E1 - OSPF external type 1, E2 - OSPF external type 2",
    "       i - IS-IS, L1 - IS-IS level-1, L2 - IS-IS level-2, ia - IS-IS inter area",
    "       * - candidate default",
    "",
    "Routing table for VRF=0",
    "S*      0.0.0.0/0 [1/0] via 100.64.0.1, wan1",
    "                  [1/0] via 192.168.8.1, wan2",
    ...IF.map(([n, , ip]) => `C       ${ip.replace(/\.1\//, ".0/")} is directly connected, ${n}`),
    "C       100.64.0.0/10 is directly connected, wan1",
    "C       192.168.8.0/24 is directly connected, wan2",
    P,
  ], { size: 23 });
}
const tRouting = () => routingGeo().svg;
{
  const { t } = routingGeo();
  SPOTS.defaultRoute = [...lineSpots(t, 9, 0, 42).slice(0, 7), ...lineSpots(t, 10, 18, 42).slice(0, 3)];
}

function tPolicy() {
  return termPic(SSH, [
    `${P}show firewall policy 3`,
    "config firewall policy",
    "    edit 3",
    "        set name \"Crew-to-Internet\"",
    "        set uuid 6f1c2e8a-xxxx-51ef-xxxx-xxxxxxxxxxxx",
    "        set srcintf \"CREW\"",
    "        set dstintf \"Internet\"",
    "        set action accept",
    "        set srcaddr \"all\"",
    "        set dstaddr \"all\"",
    "        set schedule \"always\"",
    "        set service \"ALL\"",
    "        set logtraffic all",
    "        set nat enable",
    "    next",
    "end",
    P,
  ], { size: 26 }).svg;
}

function tSessions() {
  return termPic(SSH, [
    `${P}diagnose sys session filter clear`,
    `${P}diagnose sys session filter src 10.10.20.15`,
    `${P}diagnose sys session filter dport 443`,
    `${P}diagnose sys session list`,
    "",
    "session info: proto=6 proto_state=11 duration=59 expire=3586 timeout=3600 refresh_dir=both",
    "  flags=00000000 socktype=0 sockport=443 av_idx=9 use=5",
    { t: "  …", c: T.dim },
    "statistic(bytes/packets/allow_err): org=10941/16/1 reply=3633/11/1 tuples=3",
    "orgin->sink: org pre->post, reply pre->post dev=21->5/5->21 gwy=100.64.0.1/0.0.0.0",
    { t: "hook=post dir=org act=snat 10.10.20.15:49397->203.0.113.10:443(100.64.0.10:49397)", hi: true },
    "hook=pre dir=reply act=dnat 203.0.113.10:443->100.64.0.10:49397(10.10.20.15:49397)",
    { t: "  …", c: T.dim },
    { t: "misc=0 policy_id=3 pol_uuid_idx=15905 auth_info=0 chk_client_info=0 vd=0", hi: true },
    "total session: 1",
    `${P}diagnose sys session filter clear`,
    P,
  ], { size: 22 }).svg;
}

function tSniffer() {
  return termPic(SSH, [
    `${P}diagnose sniffer packet any 'host 8.8.8.8 and icmp' 4 4 l`,
    "interfaces=[any]",
    "filters=[host 8.8.8.8 and icmp]",
    "2026-10-19 10:15:02.545306 CREW in 10.10.20.15 -> 8.8.8.8: icmp: echo request",
    "2026-10-19 10:15:02.545390 wan1 out 100.64.0.10 -> 8.8.8.8: icmp: echo request",
    "2026-10-19 10:15:02.583112 wan1 in 8.8.8.8 -> 100.64.0.10: icmp: echo reply",
    "2026-10-19 10:15:02.583170 CREW out 8.8.8.8 -> 10.10.20.15: icmp: echo reply",
    "4 packets received by filter",
    "0 packets dropped by kernel",
    P,
  ], { size: 25 }).svg;
}

function tDebugFlow() {
  return termPic(SSH, [
    `${P}diagnose debug flow filter clear`,
    `${P}diagnose debug flow filter addr 10.10.50.10`,
    `${P}diagnose debug flow show function-name enable`,
    `${P}diagnose debug flow trace start 5`,
    `${P}diagnose debug enable`,
    "",
    "id=65308 trace_id=12 func=print_pkt_detail line=6336 msg=\"vd-root:0 received a packet(proto=6, 10.10.30.44:51544->10.10.50.10:443) tun_id=0.0.0.0 from GUEST. flag [S], seq 802211, ack 0, win 64240\"",
    "id=65308 trace_id=12 func=init_ip_session_common line=6550 msg=\"allocate a new session-00004b21\"",
    "id=65308 trace_id=12 func=__vf_ip_route_input_rcu line=2116 msg=\"find a route: flag=00000000 gw-10.10.50.10 via CCTV\"",
    { t: "id=65308 trace_id=12 func=fw_forward_handler line=887 msg=\"Denied by forward policy check (policy 0)\"", hi: true },
    "",
    `${P}diagnose debug disable`,
    `${P}diagnose debug reset`,
    P,
  ], { size: 22, wrap: true }).svg;
}

function tPing() {
  return termPic(SSH, [
    `${P}execute ping 8.8.8.8`,
    "PING 8.8.8.8 (8.8.8.8): 56 data bytes",
    "64 bytes from 8.8.8.8: icmp_seq=0 ttl=117 time=38.3 ms",
    "64 bytes from 8.8.8.8: icmp_seq=1 ttl=117 time=37.9 ms",
    "64 bytes from 8.8.8.8: icmp_seq=2 ttl=117 time=41.2 ms",
    "64 bytes from 8.8.8.8: icmp_seq=3 ttl=117 time=38.0 ms",
    "64 bytes from 8.8.8.8: icmp_seq=4 ttl=117 time=37.9 ms",
    "",
    "--- 8.8.8.8 ping statistics ---",
    { t: "5 packets transmitted, 5 packets received, 0% packet loss", hi: true },
    "round-trip min/avg/max = 37.9/38.6/41.2 ms",
    "",
    `${P}execute ping-options source 10.10.20.1`,
    `${P}execute ping 10.10.50.10`,
    "PING 10.10.50.10 (10.10.50.10): 56 data bytes",
    "64 bytes from 10.10.50.10: icmp_seq=0 ttl=255 time=0.6 ms",
    { t: "  …", c: T.dim },
    `${P}execute ping-options reset`,
    P,
  ], { size: 24 }).svg;
}

function tVpn() {
  return termPic(SSH, [
    `${P}get vpn ipsec tunnel summary`,
    { t: "'JLS-Office' 203.0.113.5:0  selectors(total,up): 1/1  rx(pkt,err): 19214/0  tx(pkt,err): 18890/0", hi: true },
    "'NH-Support' 198.51.100.20:0  selectors(total,up): 1/0  rx(pkt,err): 0/0  tx(pkt,err): 0/0",
    "",
    `${P}diagnose vpn ike gateway list name NH-Support`,
    "",
    "vd: root/0",
    "name: NH-Support",
    "version: 2",
    "interface: wan1 5",
    "addr: 100.64.0.10:500 -> 198.51.100.20:500",
    "created: 15s ago",
    "IKE SA: created 1/1",
    "IPsec SA: created 0/0",
    { t: "status: connecting, state 3, started 15s ago", hi: true },
    P,
  ], { size: 24, wrap: true }).svg;
}

function tSdwan() {
  return termPic(SSH, [
    `${P}diagnose sys sdwan health-check`,
    "Health Check(Internet-Check):",
    { t: "Seq(1 wan1): state(dead), packet-loss(100.000%) sla_map=0x0", hi: true },
    "Seq(2 wan2): state(alive), packet-loss(0.000%) latency(61.408), jitter(8.217), mos(4.312), bandwidth-up(49998), bandwidth-dw(149991), bandwidth-bi(199989) sla_map=0x1",
    "",
    `${P}diagnose sys sdwan member`,
    "Member(1): interface: wan1, gateway: 100.64.0.1, priority: 0 1024, weight: 0",
    "Member(2): interface: wan2, gateway: 192.168.8.1, priority: 0 1024, weight: 0",
    P,
  ], { size: 24, wrap: true }).svg;
}

function tPerformance() {
  return termPic(SSH, [
    `${P}get system performance status`,
    { t: "CPU states: 4% user 3% system 0% nice 92% idle 0% iowait 0% irq 1% softirq", hi: true },
    "CPU0 states: 5% user 4% system 0% nice 90% idle 0% iowait 0% irq 1% softirq",
    { t: "  …", c: T.dim },
    { t: "Memory: 1871872k total, 898498k used (48%), 813260k free (43%), 160114k freeable (9%)", hi: true },
    "Average network usage: 18240 / 2611 kbps in 1 minute, 15022 / 2390 kbps in 10 minutes, 14310 / 2206 kbps in 30 minutes",
    "Average sessions: 1284 sessions in 1 minute, 1190 sessions in 10 minutes, 1102 sessions in 30 minutes",
    "Average session setup rate: 21 sessions per second in last 1 minute, 18 sessions per second in last 10 minutes, 17 sessions per second in last 30 minutes",
    "Virus caught: 0 total in 1 minute",
    "IPS attacks blocked: 0 total in 1 minute",
    "Uptime: 12 days,  4 hours,  37 minutes",
    P,
  ], { size: 24, wrap: true }).svg;
}

// ── Look vs change poster ───────────────────────────────────────────────────
function readVsChange() {
  let b = backdrop(W, H) + titleBlock(80, 90, "The rule", "Read-only — and what changes the firewall");
  const cols = [
    ["Read-only — safe", C.green, ["get system status", "get system interface physical", "get router info routing-table all", "get system performance status", "show firewall policy", "diagnose sys sdwan health-check", "get vpn ipsec tunnel summary", "execute ping / traceroute", "GUI: Dashboard, logs, FortiView"]],
    ["Careful — agree with IT", C.amber, ["diagnose sniffer packet (with a filter and a count)", "diagnose debug flow (with a filter; disable afterwards)", "execute backup config"]],
    ["Changes — IT only", C.red, ["config … / set … / end (any config)", "diagnose sys session clear", "execute reboot / shutdown", "execute factory-reset", "firmware upgrade", "policy, NAT, VPN or admin changes"]],
  ];
  cols.forEach(([t, col, items], i) => {
    const x = 80 + i * 490, y = 200;
    b += rect(x, y, 460, 640, 20, C.panel, col, 3);
    b += txt(x + 28, y + 56, t, { size: 30, weight: 700, fill: col });
    let iy = y + 118;
    items.forEach((it) => {
      const n = Math.ceil(it.length / 33);
      b += circle(x + 36, iy - 7, 6, col) + para(x + 56, iy, it, { size: 19, width: 33, fill: C.text, family: MONO });
      iy += 26 * n + 22;
    });
  });
  return svg(W, H, b);
}

export const PICTURES = {
  "f01-cover.png": cover,
  "f02-ports.png": ports,
  "f03-where-it-sits.png": role,
  "f04-read-vs-change.png": readVsChange,
  "g01-dashboard.png": dashboard,
  "g02-interfaces.png": interfaces,
  "g03-policy-list.png": policyList,
  "g04-sdwan-sla.png": sdwanGui,
  "g05-forward-traffic.png": forwardLog,
  "g06-backup.png": backupGui,
  "t01-system-status.png": tStatus,
  "t02-interface-physical.png": tPhysical,
  "t03-routing-table.png": tRouting,
  "t04-show-policy.png": tPolicy,
  "t05-session-list.png": tSessions,
  "t06-sniffer.png": tSniffer,
  "t07-debug-flow.png": tDebugFlow,
  "t08-ping.png": tPing,
  "t09-vpn.png": tVpn,
  "t10-sdwan-health.png": tSdwan,
  "t11-performance.png": tPerformance,
};
