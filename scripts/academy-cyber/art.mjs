// Drawing kit for the Crew Academy cyber security course pictures and animations.
// Everything is plain SVG strings, rendered with sharp (pictures) or piped frame by
// frame into ffmpeg (animations). Colours follow the crew app (navy + gold).

export const C = {
  bg: "#0d1f45", deep: "#081632", panel: "#13295a", panel2: "#1a3470", line: "#2c4a86",
  gold: "#d4a62a", white: "#ffffff", text: "#e8eefc", muted: "#9fb0d4",
  red: "#e5534b", green: "#3fb27f", teal: "#2bb3c0", amber: "#f0a030", sea: "#123a6b", paper: "#f7f8fb", ink: "#1b2433",
};
export const SANS = "Segoe UI, Arial, sans-serif";
export const SERIF = "Georgia, serif";

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function txt(x, y, s, o = {}) {
  const { size = 28, weight = 400, fill = C.text, anchor = "start", family = SANS, opacity = 1, italic = false, spacing } = o;
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${opacity}"${italic ? ' font-style="italic"' : ""}${spacing ? ` letter-spacing="${spacing}"` : ""}>${esc(s)}</text>`;
}

/** Word-wrap by an approximate character budget; returns one <text> per line. */
export function para(x, y, s, o = {}) {
  const { width = 40, lh = 1.35, size = 28 } = o;
  const words = String(s).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) { lines.push(cur.trim()); cur = w; } else cur += " " + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.map((l, i) => txt(x, y + i * size * lh, l, o)).join("");
}

export const svg = (w, h, body, bg = C.bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  (bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : "") + body + `</svg>`;

export const g = (x, y, s, body, extra = "") => `<g transform="translate(${x} ${y}) scale(${s})"${extra}>${body}</g>`;
export const rect = (x, y, w, h, r, fill, stroke = "none", sw = 0, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
export const circle = (x, y, r, fill, stroke = "none", sw = 0, extra = "") =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
export const line = (x1, y1, x2, y2, stroke, sw = 3, extra = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" ${extra}/>`;

// Subtle background: sea-chart grid and a soft glow.
export function backdrop(w, h) {
  let grid = "";
  for (let x = 0; x <= w; x += 80) grid += line(x, 0, x, h, C.panel, 1, 'opacity="0.55"');
  for (let y = 0; y <= h; y += 80) grid += line(0, y, w, y, C.panel, 1, 'opacity="0.55"');
  return `<defs><radialGradient id="glow" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#1b3a7a" stop-opacity="0.9"/><stop offset="1" stop-color="${C.bg}" stop-opacity="0"/></radialGradient></defs>` +
    grid + `<rect width="${w}" height="${h}" fill="url(#glow)"/>`;
}

// ── Icons (drawn around a 100×100 box at the origin; place with g()) ─────────
export const icon = {
  laptop: (screen = C.panel2, glow = C.teal) =>
    rect(12, 14, 76, 50, 5, "#2a3446", "#4a5a78", 2) + rect(17, 19, 66, 40, 2, screen) +
    rect(24, 26, 34, 4, 2, glow) + rect(24, 34, 48, 3, 1.5, C.muted, "none", 0, 'opacity="0.7"') + rect(24, 40, 40, 3, 1.5, C.muted, "none", 0, 'opacity="0.7"') +
    `<path d="M4 66 h92 l-6 9 h-80 z" fill="#3a465e" stroke="#4a5a78" stroke-width="2"/>`,
  phone: (screen = C.panel2) =>
    rect(30, 6, 40, 88, 8, "#222b3b", "#4a5a78", 2) + rect(34, 14, 32, 70, 3, screen) + rect(44, 9, 12, 2.5, 1, "#4a5a78"),
  shield: (fill = C.gold, mark = C.bg) =>
    `<path d="M50 6 L86 18 V46 C86 70 70 86 50 94 C30 86 14 70 14 46 V18 Z" fill="${fill}"/>` +
    `<path d="M33 50 L45 62 L68 38" fill="none" stroke="${mark}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
  lock: (fill = C.gold, open = false) =>
    `<path d="M32 46 V32 C32 20 41 12 50 12 C59 12 68 20 68 32 ${open ? "V24" : "V46"}" fill="none" stroke="${fill}" stroke-width="8" stroke-linecap="round" ${open ? 'transform="translate(18 -6)"' : ""}/>` +
    rect(22, 44, 56, 46, 8, fill) + circle(50, 63, 6, C.bg) + rect(47, 64, 6, 14, 3, C.bg),
  envelope: (fill = C.paper, flap = "#c9d3e8") =>
    rect(8, 22, 84, 58, 6, fill) + `<path d="M10 25 L50 56 L90 25" fill="none" stroke="${flap}" stroke-width="5" stroke-linejoin="round"/>`,
  bug: (fill = C.red) =>
    `<ellipse cx="50" cy="56" rx="22" ry="28" fill="${fill}"/>` + circle(50, 26, 13, fill) +
    [[-1, 40], [-1, 56], [-1, 72], [1, 40], [1, 56], [1, 72]].map(([s, y]) => line(50 + s * 20, y, 50 + s * 38, y - 8 + (y - 56) / 3, fill, 5)).join("") +
    line(44, 16, 36, 4, fill, 4) + line(56, 16, 64, 4, fill, 4) + line(50, 32, 50, 82, C.deep, 3),
  user: (fill = C.muted) => circle(50, 30, 18, fill) + `<path d="M16 92 C16 64 30 54 50 54 C70 54 84 64 84 92 Z" fill="${fill}"/>`,
  usb: (fill = "#c7ced9") =>
    rect(30, 34, 40, 60, 6, "#2f3a4f", "#4a5a78", 2) + rect(36, 8, 28, 28, 2, fill) + rect(42, 14, 6, 6, 1, "#5a6578") + rect(52, 14, 6, 6, 1, "#5a6578"),
  warn: (fill = C.amber) =>
    `<path d="M50 8 L94 88 H6 Z" fill="${fill}" stroke="${fill}" stroke-width="6" stroke-linejoin="round"/>` + rect(46, 34, 8, 30, 4, C.deep) + circle(50, 74, 5, C.deep),
  tick: (fill = C.green) => circle(50, 50, 44, fill) + `<path d="M28 51 L44 66 L73 36" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`,
  cross: (fill = C.red) => circle(50, 50, 44, fill) + line(33, 33, 67, 67, "#fff", 10) + line(67, 33, 33, 67, "#fff", 10),
  firewall: (fill = C.red) => {
    let b = rect(4, 10, 92, 80, 4, "#7a2a26");
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const off = r % 2 ? -11 : 0;
      b += rect(8 + c * 23 + off, 14 + r * 19, 19, 15, 2, fill);
    }
    return `<clipPath id="fwclip"><rect x="4" y="10" width="92" height="80" rx="4"/></clipPath><g clip-path="url(#fwclip)">${b}</g>`;
  },
  satellite: (fill = C.muted) =>
    `<path d="M20 70 A40 40 0 0 1 80 70 Z" fill="${fill}"/>` + rect(44, 70, 12, 20, 2, fill) + rect(30, 88, 40, 6, 3, fill) +
    `<path d="M62 22 a20 20 0 0 1 16 16 M62 10 a32 32 0 0 1 28 28" fill="none" stroke="${C.teal}" stroke-width="4" stroke-linecap="round"/>`,
  ecdis: (screen = "#0f3550") =>
    rect(6, 10, 88, 64, 5, "#252e3e", "#4a5a78", 2) + rect(12, 16, 76, 52, 2, screen) +
    `<path d="M12 50 C30 44 40 58 58 48 S80 40 88 44 V68 H12 Z" fill="#c8b27a" opacity="0.65"/>` +
    rect(40, 74, 20, 10, 1, "#3a465e") + rect(28, 84, 44, 6, 3, "#3a465e"),
  server: (fill = "#2a3446") =>
    [0, 1, 2].map((i) => rect(14, 8 + i * 29, 72, 25, 4, fill, "#4a5a78", 2) + circle(26, 20.5 + i * 29, 3.5, C.green) + rect(38, 18 + i * 29, 38, 5, 2.5, "#4a5a78")).join(""),
  key: (fill = C.gold) => circle(30, 50, 18, "none", fill, 9) + rect(46, 46, 44, 9, 3, fill) + rect(72, 54, 8, 14, 2, fill) + rect(84, 54, 7, 10, 2, fill),
};

/** Side-on motor yacht silhouette, ~600 wide × 170 tall, origin top-left. */
export function yacht(fill = C.white, accent = C.panel2, windows = "#244a8a") {
  return `<path d="M10 120 L590 120 L540 168 L70 168 Z" fill="${fill}"/>` +
    `<path d="M120 120 L160 72 L470 72 L520 120 Z" fill="${fill}"/>` +
    `<path d="M200 72 L235 36 L420 36 L440 72 Z" fill="${fill}"/>` +
    `<path d="M265 36 L285 14 L380 14 L392 36 Z" fill="${fill}"/>` +
    rect(330, 0, 6, 16, 2, fill) + rect(300, 4, 40, 4, 2, fill) +
    `<path d="M170 82 L460 82 L490 108 L150 108 Z" fill="${windows}"/>` +
    `<path d="M245 44 L415 44 L428 64 L232 64 Z" fill="${windows}"/>` +
    `<path d="M290 20 L376 20 L384 31 L282 31 Z" fill="${windows}"/>` +
    rect(70, 140, 470, 6, 3, accent);
}

export function waves(w, y, t = 0, fill = C.sea) {
  let d = `M0 ${y}`;
  for (let x = 0; x <= w; x += 20) d += ` L${x} ${y + Math.sin((x / 90) + t) * 6}`;
  return `<path d="${d} L${w} ${y + 400} L0 ${y + 400} Z" fill="${fill}"/>`;
}

/** Rounded caption bar used at the bottom of animation frames. */
export function captionBar(w, h, s, o = {}) {
  const { opacity = 1, sub } = o;
  const bh = sub ? 128 : 96;
  return `<g opacity="${opacity}">` + rect(60, h - bh - 36, w - 120, bh, 18, C.deep, C.gold, 2, 'fill-opacity="0.92"') +
    txt(w / 2, h - bh - 36 + (sub ? 52 : 60), s, { size: 34, weight: 600, fill: C.white, anchor: "middle" }) +
    (sub ? txt(w / 2, h - 36 - 26, sub, { size: 24, fill: C.muted, anchor: "middle" }) : "") + `</g>`;
}

export function titleBlock(x, y, kicker, title, o = {}) {
  const { size = 56, anchor = "start" } = o;
  return txt(x, y, kicker.toUpperCase(), { size: 20, weight: 700, fill: C.gold, spacing: 3, anchor }) +
    txt(x, y + size + 6, title, { size, family: SERIF, fill: C.white, anchor });
}
