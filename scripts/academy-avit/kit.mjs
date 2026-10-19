// Extra drawing kit for the AV/IT courses (Cisco switch, FortiGate), on top of the
// cyber course's art.mjs: terminal windows, switch and firewall front panels, a
// browser-style GUI frame. All plain SVG strings, like art.mjs.
//
// Example data only: RFC 1918 / RFC 5737 / RFC 6598 addresses, the RFC 7042
// documentation MAC range (00-00-5E-00-53-xx), invented names, masked serials.
import { C, SANS, esc, txt, rect, circle, line } from "../academy-cyber/art.mjs";

export const MONO = "Consolas, Lucida Console, monospace";
/** Consolas advance width is 1126/2048 of the font size. */
export const CHAR = 0.55;

// Terminal colours (a dark PuTTY-ish scheme).
export const T = {
  bg: "#0b1220", bar: "#1c2536", text: "#d6deeb", dim: "#7f8ea8", prompt: "#7fdbca", cmd: "#ffffff",
  hi: "#3a2f0b", hiLine: "#f0c419", red: "#ff6b6b", green: "#4fd18b", amber: "#f0a030", cyan: "#5fc8e8",
};

/**
 * A terminal window. `lines` are strings or { t, c (colour), hi (highlight band), b (bold) }.
 * A string starting with a prompt like "SW-CORE-01#" is drawn as prompt + command.
 * Returns { svg, rowY(i), colX(n), size } so callers can place hotspots on rows.
 */
export function terminal(x, y, w, h, title, lines, o = {}) {
  const { size = 24, lh = 1.32, pad = 28, promptRe = /^([A-Za-z0-9_.-]+(?:\([a-z-]+\))?[#>$] ?)(.*)$/ } = o;
  const top = y + 56 + pad;
  const rowY = (i) => top + i * size * lh;
  const colX = (n) => x + pad + n * size * CHAR;
  let s = rect(x, y, w, h, 14, T.bg, "#2b3a55", 2);
  s += rect(x, y, w, 52, 14, T.bar) + rect(x, y + 38, w, 14, 0, T.bar);
  s += circle(x + 30, y + 26, 8, "#e5534b") + circle(x + 56, y + 26, 8, "#f0b030") + circle(x + 82, y + 26, 8, "#3fb27f");
  s += txt(x + w / 2, y + 34, title, { size: 20, fill: T.dim, anchor: "middle", family: SANS });
  const norm = lines.map((ln) => (typeof ln === "string" ? { t: ln } : ln));
  // one highlight band per run of highlighted lines
  for (let i = 0; i < norm.length; i++) {
    if (!norm[i].hi || norm[i - 1]?.hi) continue;
    let j = i;
    while (norm[j + 1]?.hi) j++;
    const col = norm[i].hi === true ? T.hi : norm[i].hi;
    s += rect(x + 10, rowY(i) - size * 1.0, w - 20, size * lh * (j - i + 1), 4, col, T.hiLine, 1.5);
  }
  norm.forEach((L, i) => {
    const by = rowY(i);
    const m = !L.c && promptRe.exec(L.t);
    const weight = L.b ? 700 : 400;
    if (m && o.prompts !== false && /[#>]\s?$/.test(m[1]) && (m[2] !== undefined)) {
      s += `<text x="${colX(0)}" y="${by}" font-family="${MONO}" font-size="${size}" xml:space="preserve">` +
        `<tspan fill="${T.prompt}">${esc(m[1])}</tspan><tspan fill="${T.cmd}" font-weight="700">${esc(m[2])}</tspan></text>`;
    } else {
      s += `<text x="${colX(0)}" y="${by}" font-family="${MONO}" font-size="${size}" font-weight="${weight}" fill="${L.c ?? T.text}" xml:space="preserve">${esc(L.t)}</text>`;
    }
  });
  return { svg: s, rowY, colX, size };
}

/** Height a terminal() needs for n lines at this size. */
export const termHeight = (n, size, lh = 1.32, pad = 28) => 56 + pad * 2 + (n - 0.6) * size * lh + 8;

/** Word-wrap long terminal lines (continuations keep the line's highlight). */
export function wrapLines(lines, cols) {
  const out = [];
  for (const ln of lines) {
    const L = typeof ln === "string" ? { t: ln } : ln;
    if (L.t.length <= cols) { out.push(L); continue; }
    let rest = L.t;
    while (rest.length > cols) {
      let cut = rest.lastIndexOf(" ", cols);
      if (cut < cols * 0.5) cut = cols;
      out.push({ ...L, t: rest.slice(0, cut) });
      rest = "    " + rest.slice(cut).trimStart();
    }
    out.push({ ...L, t: rest });
  }
  return out;
}

/** Font size that fits the longest line of `lines` into width w. */
export function fitSize(lines, w, max = 26, pad = 28) {
  const longest = Math.max(...lines.map((l) => (typeof l === "string" ? l : l.t).length));
  return Math.min(max, Math.floor((w - pad * 2) / (longest * CHAR)));
}

// ── Switch front panel ────────────────────────────────────────────────────────
/**
 * A 1U 24-port PoE access switch with 4 SFP uplinks, drawn at (x, y), w wide.
 * `ports[n]` → "up" | "down" | "err" | "poe" | "off" sets the LED and port colour.
 * Returns geometry so exercises can target ports.
 */
export function switchPanel(x, y, w, o = {}) {
  const { ports = {}, uplinks = {}, label = "24 × 1G PoE+  ·  4 × SFP uplinks", model = "C9200L-24P-4G" } = o;
  const h = w * 0.2;
  const k = w / 1400; // drawn on a 1400-wide grid
  const X = (v) => x + v * k, Y = (v) => y + v * k;
  let s = rect(x, y, w, h, 8 * k, "#2b3240", "#4a5468", 2);
  s += rect(X(0), Y(0), w, 18 * k, 0, "#3a4354");
  // left: brand strip, system LEDs, mode button
  s += txt(X(30), Y(58), model, { size: 18 * k, weight: 700, fill: "#c9d1de" });
  const sys = [["SYST", C.green], ["ACTV", C.green], ["STAT", C.green], ["SPEED", "#4a5468"], ["DUPLX", "#4a5468"], ["PoE", "#4a5468"]];
  sys.forEach(([n, c], i) => {
    s += circle(X(42), Y(86 + i * 22), 5 * k, c) + txt(X(54), Y(91 + i * 22), n, { size: 13 * k, fill: "#9aa5b8" });
  });
  s += rect(X(120), Y(150), 36 * k, 36 * k, 6 * k, "#1b2029", "#5a6478", 2) + txt(X(138), Y(206), "MODE", { size: 12 * k, fill: "#9aa5b8", anchor: "middle" });
  s += circle(X(138), Y(100), 14 * k, "#1f4f99", "#6fa8dc", 2) + txt(X(138), Y(106), "B", { size: 15 * k, weight: 700, fill: "#ffffff", anchor: "middle" });
  // ports: 12 columns × 2 rows, odd on top, even below (Cisco numbering)
  const geo = { port: {}, uplink: {}, console: null, usbConsole: null, mgmt: null };
  const px0 = 230, pw = 58, ph = 54, gapCol = 6;
  for (let c = 0; c < 12; c++) {
    const group = Math.floor(c / 6) * 26;
    for (let r = 0; r < 2; r++) {
      const n = c * 2 + r + 1;
      const px = px0 + c * (pw + gapCol) + group, py = 64 + r * 92;
      const st = ports[n] ?? "down";
      const led = { up: C.green, poe: C.green, err: "#3c4454", stp: C.amber, down: "#3c4454", off: "#3c4454" }[st];
      s += rect(X(px), Y(py), pw * k, ph * k, 4 * k, "#11151c", "#596377", 1.5);
      s += rect(X(px + 14), Y(py + 8), (pw - 28) * k, 10 * k, 1, "#262c36") + rect(X(px + 8), Y(py + 20), (pw - 16) * k, 26 * k, 2, "#1d222b");
      s += circle(X(px + pw / 2), Y(py - 10 + (r ? ph + 22 : 0)), 5 * k, led);
      s += txt(X(px + pw / 2), Y(r ? py + ph + 46 : py - 22), String(n), { size: 14 * k, fill: "#9aa5b8", anchor: "middle" });
      geo.port[n] = { cx: X(px + pw / 2), cy: Y(py + ph / 2), r: (pw / 2 + 6) * k };
    }
  }
  // uplinks: 4 SFP cages
  const ux0 = px0 + 12 * (pw + gapCol) + 26 + 30;
  for (let i = 0; i < 4; i++) {
    const c = Math.floor(i / 2), r = i % 2;
    const ux = ux0 + c * 86, uy = 70 + r * 92;
    const st = uplinks[i + 1] ?? "down";
    s += rect(X(ux), Y(uy), 74 * k, 44 * k, 3 * k, "#0d1016", "#8e98ab", 2) + rect(X(ux + 8), Y(uy + 8), 58 * k, 28 * k, 2, st === "up" ? "#c7ced9" : "#1d222b");
    s += circle(X(ux + 37), Y(r ? uy + 60 : uy - 12), 5 * k, st === "up" ? C.green : "#3c4454");
    s += txt(X(ux + 37), Y(r ? uy + 82 : uy - 22), String(i + 1), { size: 14 * k, fill: "#9aa5b8", anchor: "middle" });
    geo.uplink[i + 1] = { cx: X(ux + 37), cy: Y(uy + 22), r: 46 * k };
  }
  // right end (front of a C9200L / C9300): USB mini-B console and USB-A storage port.
  // The RJ-45 console and the MGMT port are on the back of these models.
  const rx = ux0 + 2 * 86 + 30;
  s += `<path d="M${X(rx)} ${Y(84)} h${50 * k} v${18 * k} l${-6 * k} ${8 * k} h${-38 * k} l${-6 * k} ${-8 * k} z" fill="#0d1016" stroke="#6fa8dc" stroke-width="2"/>`;
  s += txt(X(rx + 25), Y(136), "CONSOLE", { size: 13 * k, fill: "#9fc5e8", anchor: "middle" });
  s += rect(X(rx + 2), Y(170), 46 * k, 18 * k, 3 * k, "#0d1016", "#9aa5b8", 2) + rect(X(rx + 8), Y(174), 34 * k, 6 * k, 1, "#5a6578");
  s += txt(X(rx + 25), Y(212), "USB", { size: 13 * k, fill: "#9aa5b8", anchor: "middle" });
  geo.console = { cx: X(rx + 25), cy: Y(96), r: 40 * k };
  geo.usb = { cx: X(rx + 25), cy: Y(179), r: 30 * k };
  geo.h = h;
  if (label) s += txt(x + w / 2, y + h + 40 * k, label, { size: 18 * k, fill: C.muted, anchor: "middle" });
  return { svg: s, geo };
}

// ── FortiGate-style desktop firewall front panel ───────────────────────────────
/**
 * A small desktop firewall front panel (60F-style layout): USB, CONSOLE, WAN1, WAN2,
 * DMZ, then internal ports. `links[name]` → true lights the port's link LED.
 */
export function firewallPanel(x, y, w, o = {}) {
  const { links = {}, model = "FortiGate 60F", ports = ["wan1", "wan2", "dmz", "a", "b", "1", "2", "3", "4", "5"] } = o;
  const k = w / 1400, h = 230 * k;
  const X = (v) => x + v * k, Y = (v) => y + v * k;
  let s = rect(x, y, w, h, 18 * k, "#e7e9ee", "#b8bec9", 2);
  s += rect(X(0), Y(h / k - 30), w, 30 * k, 0, "#c9ced8");
  s += txt(X(40), Y(64), model, { size: 26 * k, weight: 700, fill: "#a3252b" });
  ["STATUS", "ALARM", "HA", "POWER"].forEach((n, i) => {
    s += circle(X(52), Y(100 + i * 26), 6 * k, i === 0 || i === 3 ? C.green : "#9aa3b2") + txt(X(66), Y(106 + i * 26), n, { size: 14 * k, fill: "#5b6476" });
  });
  const geo = { port: {} };
  // USB + console
  s += rect(X(180), Y(96), 46 * k, 18 * k, 3 * k, "#20242c") + txt(X(203), Y(150), "USB", { size: 14 * k, fill: "#5b6476", anchor: "middle" });
  s += rect(X(250), Y(84), 62 * k, 52 * k, 4 * k, "#20242c", "#6fa8dc", 2) + rect(X(262), Y(94), 38 * k, 28 * k, 2, "#3a3f4a");
  s += txt(X(281), Y(160), "CONSOLE", { size: 14 * k, fill: "#2b5fb8", anchor: "middle" });
  geo.console = { cx: X(281), cy: Y(110), r: 44 * k };
  geo.usb = { cx: X(203), cy: Y(105), r: 30 * k };
  let px = 360;
  ports.forEach((n) => {
    const isWan = /^wan/.test(n), isDmz = n === "dmz";
    if (n === "a" || n === "1") px += 24;
    s += rect(X(px), Y(84), 70 * k, 60 * k, 4 * k, "#20242c", isWan ? "#a3252b" : "#8e96a5", isWan ? 3 : 1.5);
    s += rect(X(px + 12), Y(96), 46 * k, 32 * k, 2, "#3a3f4a");
    s += circle(X(px + 16), Y(74), 5 * k, links[n] ? C.green : "#9aa3b2") + circle(X(px + 54), Y(74), 5 * k, links[n] ? C.amber : "#9aa3b2");
    s += txt(X(px + 35), Y(170), n.toUpperCase(), { size: 16 * k, weight: 700, fill: isWan ? "#a3252b" : "#3b4252", anchor: "middle" });
    geo.port[n] = { cx: X(px + 35), cy: Y(114), r: 42 * k };
    px += 84;
  });
  geo.h = h;
  return { svg: s, geo };
}

// ── Browser-style admin GUI frame ─────────────────────────────────────────────
/** A browser window with an admin GUI: top bar, left menu, content area. Returns the content box. */
export function guiFrame(x, y, w, h, o = {}) {
  const { url = "https://10.10.99.1", product = "FortiGate 60F", host = "FGT-YACHT-01", menu = [], active } = o;
  let s = rect(x, y, w, h, 12, "#ffffff", "#c3cad8", 2);
  // browser chrome
  s += rect(x, y, w, 50, 12, "#eef1f6") + rect(x, y + 38, w, 12, 0, "#eef1f6");
  s += circle(x + 26, y + 25, 7, "#e5534b") + circle(x + 48, y + 25, 7, "#f0b030") + circle(x + 70, y + 25, 7, "#3fb27f");
  s += rect(x + 100, y + 10, w - 200, 30, 15, "#ffffff", "#d3d9e4", 1.5) + txt(x + 124, y + 32, "🔒 " + url, { size: 17, fill: "#5b6476" });
  // product top bar
  s += rect(x, y + 50, w, 46, 0, "#1f2a38");
  s += txt(x + 22, y + 80, product, { size: 19, weight: 700, fill: "#ffffff" }) + txt(x + 22 + product.length * 11 + 20, y + 80, host, { size: 17, fill: "#9fb0c8" });
  s += txt(x + w - 22, y + 80, "admin ▾", { size: 17, fill: "#d8dee9", anchor: "end" });
  // left menu
  const mw = 250;
  s += rect(x, y + 96, mw, h - 96, 0, "#283544");
  menu.forEach((m, i) => {
    const my = y + 96 + 14 + i * 40;
    const on = m === active;
    if (on) s += rect(x, my, mw, 36, 0, "#3b6ea8");
    s += txt(x + 24, my + 25, m, { size: 18, weight: on ? 700 : 400, fill: on ? "#ffffff" : "#c9d3e0" });
  });
  return { svg: s, box: { x: x + mw, y: y + 96, w: w - mw, h: h - 96 } };
}

/** A simple table for GUI screens. cols = [[header, width], …]; rows = arrays of cells (string or {t, c, b, pill}). */
export function guiTable(x, y, cols, rows, o = {}) {
  const { rh = 44, size = 17, head = "#f1f4f8", hi = {} } = o;
  const w = cols.reduce((a, [, cw]) => a + cw, 0);
  let s = rect(x, y, w, rh, 0, head) + line(x, y + rh, x + w, y + rh, "#d3d9e4", 1.5);
  let cx = x;
  cols.forEach(([hname, cw]) => { s += txt(cx + 12, y + rh / 2 + 6, hname, { size: size - 1, weight: 700, fill: "#3b4252" }); cx += cw; });
  rows.forEach((row, ri) => {
    const ry = y + rh * (ri + 1);
    if (hi[ri]) s += rect(x, ry, w, rh, 0, hi[ri]);
    else if (ri % 2) s += rect(x, ry, w, rh, 0, "#fafbfd");
    s += line(x, ry + rh, x + w, ry + rh, "#e6eaf0", 1);
    cx = x;
    row.forEach((cell, ci) => {
      const C2 = typeof cell === "string" ? { t: cell } : cell;
      if (C2.pill) {
        const pw = C2.t.length * size * 0.58 + 22;
        s += rect(cx + 10, ry + 9, pw, rh - 18, (rh - 18) / 2, C2.pill) + txt(cx + 10 + pw / 2, ry + rh / 2 + 6, C2.t, { size: size - 2, weight: 700, fill: "#ffffff", anchor: "middle" });
      } else s += txt(cx + 12, ry + rh / 2 + 6, C2.t, { size, weight: C2.b ? 700 : 400, fill: C2.c ?? "#1b2433" });
      cx += cols[ci][1];
    });
  });
  return { svg: s, w, h: rh * (rows.length + 1), rowY: (ri) => y + rh * (ri + 1) + rh / 2 };
}
