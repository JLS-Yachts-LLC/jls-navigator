// Short silent animations for the "Cyber security at sea" course. Each one is a
// function of time (seconds) → SVG frame on a 1600 × 900 canvas; render.mjs pipes
// the frames into ffmpeg. On-screen captions carry the story (no sound needed —
// crew often watch with the sound off).
import { C, SERIF, txt, para, rect, circle, line, g, backdrop, icon, captionBar, yacht, waves } from "./art.mjs";

const W = 1600, H = 900;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (x) => x * x * (3 - 2 * x);
/** 0 → 1 between t0 and t1, eased. */
const ramp = (t, t0, t1) => smooth(clamp((t - t0) / (t1 - t0)));
/** Fade in at t0, out at t1 (each over d seconds). */
const vis = (t, t0, t1, d = 0.4) => Math.min(ramp(t, t0, t0 + d), 1 - ramp(t, t1 - d, t1));
const lerp = (a, b, p) => a + (b - a) * p;
const pt = (a, b, p) => [lerp(a[0], b[0], p), lerp(a[1], b[1], p)];
const op = (o, body) => (o <= 0.001 ? "" : `<g opacity="${o.toFixed(3)}">${body}</g>`);

function titleCard(t, t1, kicker, title, sub) {
  const o = vis(t, 0, t1, 0.5);
  return op(o, txt(W / 2, 360, kicker.toUpperCase(), { size: 24, weight: 700, fill: C.gold, anchor: "middle", spacing: 4 }) +
    txt(W / 2, 450, title, { size: 72, family: SERIF, fill: C.white, anchor: "middle" }) +
    (sub ? txt(W / 2, 520, sub, { size: 30, fill: C.muted, anchor: "middle" }) : ""));
}
function endCard(t, t0, title, sub) {
  const o = ramp(t, t0, t0 + 0.6);
  return op(o, rect(0, 0, W, H, 0, C.bg) + backdrop(W, H) + g(W / 2 - 60, 230, 1.2, icon.shield()) +
    txt(W / 2, 480, title, { size: 54, family: SERIF, fill: C.white, anchor: "middle" }) +
    (sub ? txt(W / 2, 550, sub, { size: 30, fill: C.muted, anchor: "middle" }) : ""));
}
const captions = (t, list) => list.map(([t0, t1, s, sub]) => {
  const o = vis(t, t0, t1, 0.35);
  return o > 0 ? captionBar(W, H, s, { opacity: o, sub }) : "";
}).join("");

// A node of the ship's network: icon in a disc, label underneath, red when infected.
function node(x, y, ic, label, infected = 0) {
  const ring = infected > 0 ? circle(x, y, 70, "none", C.red, 5, `opacity="${infected}"`) : "";
  const badge = infected > 0 ? g(x + 22, y - 76, 0.5 * infected, icon.bug()) : "";
  return circle(x, y, 66, C.deep, C.line, 2) + ring + g(x - 45, y - 45, 0.9, ic) +
    txt(x, y + 100, label, { size: 24, weight: 600, fill: infected > 0.5 ? "#ffb3ae" : C.text, anchor: "middle" }) + badge;
}
// A link that turns red from a towards b as p goes 0 → 1 (with a travelling pulse).
function link(a, b, p, base = C.line) {
  let s = line(...a, ...b, base, 4);
  if (p > 0) {
    const e = pt(a, b, clamp(p));
    s += line(...a, ...e, C.red, 6);
    if (p < 1) s += circle(...e, 11, C.red) + circle(...e, 22, "none", C.red, 3, 'opacity="0.5"');
  }
  return s;
}

// ── A1: one click, whole ship ───────────────────────────────────────────────
const NODES = {
  laptop: [300, 300, "Crew laptop", () => icon.laptop()],
  phone: [300, 590, "Crew phone", () => icon.phone()],
  office: [1050, 225, "Office PC", () => icon.laptop("#1b3f6e", C.gold)],
  server: [1330, 225, "Email & files", () => icon.server()],
  ecdis: [980, 600, "ECDIS", () => icon.ecdis()],
  engine: [1200, 600, "Engine monitoring", () => icon.server("#3a2a2a")],
  cctv: [1420, 600, "CCTV", () => icon.satellite(C.muted)],
};
function oneClick(t) {
  let b = backdrop(W, H);
  b += titleCard(t, 3.5, "How malware spreads", "One click. Whole ship.");

  // Scene A — the email (3.5 – 12)
  const oa = vis(t, 3.5, 12);
  if (oa > 0) {
    let s = g(525, 150, 5.5, icon.laptop(t > 9 ? "#5a1f1c" : C.panel2, t > 9 ? C.red : C.teal));
    // envelope flies in
    const fly = ramp(t, 4, 5.8);
    const [ex, ey] = pt([1450, 120], [800, 360], fly);
    if (t < 6.6) s += g(ex - 60, ey - 60, 1.2 * (1 - 0.3 * fly), icon.envelope());
    // opened email on the screen
    const oe = ramp(t, 6.4, 6.9) * (1 - ramp(t, 9, 9.3));
    s += op(oe, rect(630, 266, 340, 196, 6, C.paper) +
      txt(648, 300, "From: Crew Office", { size: 17, fill: C.ink }) +
      txt(648, 328, "Updated crew rota — please open", { size: 17, weight: 700, fill: C.ink }) +
      rect(648, 360, 200, 56, 6, "#eef1f6", "#c3cad8", 2) + rect(660, 369, 28, 38, 4, C.amber) +
      txt(698, 395, "Crew_Rota.zip", { size: 17, weight: 600, fill: C.ink }));
    // cursor moves to the attachment and clicks
    const cm = ramp(t, 7.2, 8.4);
    const [cx, cy] = pt([1000, 520], [745, 390], cm);
    if (t > 7 && t < 9.2) {
      const press = t > 8.5 && t < 8.8 ? 0.85 : 1;
      s += `<path transform="translate(${cx} ${cy}) scale(${1.6 * press})" d="M0 0 L0 28 L7 21 L12 32 L17 30 L12 19 L22 19 Z" fill="#fff" stroke="#000" stroke-width="1.5"/>`;
      if (t > 8.5) s += circle(cx, cy, 10 + (t - 8.5) * 60, "none", C.gold, 3, `opacity="${clamp(1 - (t - 8.5) * 2)}"`);
    }
    // infection
    const inf = ramp(t, 9.2, 10);
    s += op(inf, g(720, 275, 1.6 + 0.2 * Math.sin(t * 6), icon.bug()));
    b += op(oa, s);
    b += captions(t, [[4, 8.9, "An email arrives: \"Updated crew rota — please open\"."], [9, 12, "One click — and malware is running on the laptop."]]);
  }

  // Scene B — flat network (12 – 21.5)
  const ob = vis(t, 12, 21.5);
  if (ob > 0) {
    const sw = [800, 420];
    let s = rect(735, 385, 130, 70, 12, C.panel2, C.line, 2) + txt(800, 430, "Switch", { size: 22, weight: 600, fill: C.text, anchor: "middle" });
    const order = ["phone", "office", "server", "ecdis", "engine", "cctv"];
    const pIn = ramp(t, 13, 14.2);
    let links = link([NODES.laptop[0], NODES.laptop[1]], sw, pIn);
    const nodesSvg = [];
    order.forEach((k, i) => {
      const t0 = 14.4 + i * 0.6;
      const p = ramp(t, t0, t0 + 0.9);
      links += link(sw, [NODES[k][0], NODES[k][1]], p);
      nodesSvg.push(node(NODES[k][0], NODES[k][1], NODES[k][3](), NODES[k][2], ramp(t, t0 + 0.8, t0 + 1.1)));
    });
    nodesSvg.push(node(NODES.laptop[0], NODES.laptop[1], NODES.laptop[3](), NODES.laptop[2], 1));
    s = links + s + nodesSvg.join("");
    b += op(ob, s);
    b += captions(t, [[12.3, 16.5, "On a flat network, everything is connected to everything…"], [16.6, 21.5, "…so it can reach the office, the bridge and the engine room."]]);
  }

  // Scene C — separated networks (21.5 – 31)
  const oc = vis(t, 21.5, 31);
  if (oc > 0) {
    const fw = [800, 420], crewSw = [520, 445], bizSw = [1190, 355], otSw = [1200, 470];
    let s = "";
    // zones
    s += rect(150, 160, 520, 600, 22, "none", C.teal, 3, 'stroke-dasharray="14 10"') + txt(170, 200, "CREW NETWORK", { size: 20, weight: 700, fill: C.teal, spacing: 2 });
    s += rect(920, 90, 600, 285, 22, "none", C.gold, 3, 'stroke-dasharray="14 10"') + txt(940, 124, "SHIP'S BUSINESS", { size: 20, weight: 700, fill: C.gold, spacing: 2 });
    s += rect(870, 470, 680, 285, 22, "none", C.red, 3, 'stroke-dasharray="14 10"') + txt(890, 508, "BRIDGE & ENGINE", { size: 20, weight: 700, fill: C.red, spacing: 2 });
    let links = "";
    links += link([NODES.laptop[0], NODES.laptop[1]], crewSw, ramp(t, 23, 24));
    links += link(crewSw, [NODES.phone[0], NODES.phone[1]], ramp(t, 24.1, 25));
    links += link(crewSw, fw, ramp(t, 25.2, 26.3) * 0.82);
    links += line(...fw, ...bizSw, C.line, 4) + line(...fw, ...otSw, C.line, 4);
    for (const k of ["office", "server"]) links += line(...bizSw, NODES[k][0], NODES[k][1], C.line, 4);
    for (const k of ["ecdis", "engine", "cctv"]) links += line(...otSw, NODES[k][0], NODES[k][1], C.line, 4);
    s = links + s;
    const flash = t > 26.2 ? 0.5 + 0.5 * Math.sin((t - 26.2) * 14) * (1 - ramp(t, 26.2, 28.5)) : 0;
    s += rect(fw[0] - 90, fw[1] - 45, 180, 90, 14, flash > 0 ? "#7a2a26" : "#5a1f1c", C.red, 3 + flash * 6) + g(fw[0] - 82, fw[1] - 38, 0.75, icon.firewall()) +
      txt(fw[0] + 40, fw[1] + 9, "Firewall", { size: 22, weight: 700, fill: C.white, anchor: "middle" });
    s += op(ramp(t, 26.4, 26.8), txt(fw[0], fw[1] - 70, "BLOCKED", { size: 34, weight: 800, fill: C.red, anchor: "middle", spacing: 3 }));
    for (const sw of [crewSw, bizSw, otSw]) s += circle(...sw, 12, C.panel2, C.line, 2);
    s += node(NODES.laptop[0], NODES.laptop[1], NODES.laptop[3](), NODES.laptop[2], 1);
    s += node(NODES.phone[0], NODES.phone[1], NODES.phone[3](), NODES.phone[2], ramp(t, 24.9, 25.2));
    for (const k of ["office", "server", "ecdis", "engine", "cctv"]) s += node(NODES[k][0], NODES[k][1], NODES[k][3](), NODES[k][2], 0);
    b += op(oc, s);
    b += captions(t, [[21.8, 26, "With separate networks and a firewall in between…"], [26.1, 31, "…it stays in one place — the bridge and engines keep working."]]);
  }
  b += endCard(t, 31, "Think before you click.", "And report anything odd — straight away.");
  return b;
}

// ── A2: stolen password vs MFA ─────────────────────────────────────────────
function browser(x, y, w, h, url, body, urlColour = C.ink) {
  return rect(x, y, w, h, 14, C.paper, "#c3cad8", 2) + rect(x, y, w, 52, 14, "#e6eaf1") + rect(x, y + 38, w, 14, 0, "#e6eaf1") +
    rect(x + 20, y + 10, w - 40, 32, 16, C.white) + txt(x + 40, y + 33, url, { size: 19, fill: urlColour, family: "Consolas, monospace" }) + body;
}
function signIn(x, y, pw, extra = "") {
  return txt(x + 40, y + 110, "Sign in to your email", { size: 28, weight: 700, fill: C.ink }) +
    rect(x + 40, y + 140, 420, 52, 8, C.white, "#b8c1d1", 2) + txt(x + 56, y + 174, "j.martin@vessel-mail.com", { size: 20, fill: C.ink }) +
    rect(x + 40, y + 206, 420, 52, 8, C.white, "#b8c1d1", 2) + txt(x + 56, y + 242, pw, { size: 26, fill: C.ink, family: "Consolas, monospace" }) +
    rect(x + 40, y + 276, 160, 52, 8, "#2b5fb8") + txt(x + 120, y + 310, "Sign in", { size: 21, weight: 700, fill: C.white, anchor: "middle" }) + extra;
}
function mfa(t) {
  let b = backdrop(W, H);
  b += titleCard(t, 3.2, "Two-step sign-in", "Why we use MFA", "A stolen password shouldn't be enough");
  const crim = (x, y, s = 1) => g(x, y, s, icon.user("#8a2f2a")) + g(x + 12 * s, y - 6 * s, 0.76 * s, `<path d="M10 40 C10 6 90 6 90 40 L84 52 C70 24 30 24 16 52 Z" fill="#5a1f1c"/>`);

  // Scene 1 — fake page (3.2 – 11)
  const o1 = vis(t, 3.2, 11);
  if (o1 > 0) {
    const typed = "••••••••••••".slice(0, Math.floor(ramp(t, 4.4, 6.2) * 12));
    let s = browser(120, 160, 560, 400, "mail-vessel.com.signin-secure.net", signIn(120, 160, typed), "#b3261e");
    s += g(270, 600, 1.1, icon.user(C.teal)) + txt(325, 740, "Crew member", { size: 22, fill: C.muted, anchor: "middle" });
    // the password flies to the criminal
    const f = ramp(t, 6.8, 8.6);
    if (t > 6.6) {
      const [px, py] = pt([400, 400], [1180, 380], f);
      s += rect(px - 110, py - 28, 220, 56, 28, C.gold) + txt(px, py + 9, "KettleOrbit…", { size: 22, weight: 700, fill: C.bg, anchor: "middle" });
    }
    s += crim(1130, 420, 1.3) + txt(1195, 590, "Criminal", { size: 22, fill: "#ffb3ae", anchor: "middle" });
    b += op(o1, s);
    b += captions(t, [[3.5, 6.6, "A link opens a fake sign-in page. It looks real — check the address."], [6.7, 11, "The password goes straight to a criminal."]]);
  }

  // Scene 2 — password only (11 – 16.5)
  const o2 = vis(t, 11, 16.5);
  if (o2 > 0) {
    const ok = ramp(t, 13, 13.4);
    let s = crim(160, 340, 1.4) + txt(230, 520, "Criminal", { size: 22, fill: "#ffb3ae", anchor: "middle" });
    s += browser(420, 160, 560, 400, "mail.vessel-mail.com", signIn(420, 160, "••••••••••••"));
    s += line(990, 360, 1130, 360, C.red, 5);
    s += g(1150, 260, 1.8, icon.lock(ok > 0.5 ? C.red : C.gold, ok > 0.5));
    s += op(ramp(t, 13.4, 14), rect(1100, 470, 360, 120, 14, C.panel, C.red, 3) +
      txt(1280, 515, "Inbox — 2,341 emails", { size: 24, weight: 700, fill: C.white, anchor: "middle" }) +
      txt(1280, 555, "Payroll, guest lists, passports…", { size: 20, fill: "#ffb3ae", anchor: "middle" }));
    b += op(o2, s);
    b += captions(t, [[11.2, 16.5, "Password only: the criminal is straight in."]]);
  }

  // Scene 3 — with MFA (16.5 – 26)
  const o3 = vis(t, 16.5, 26);
  if (o3 > 0) {
    let s = crim(110, 300, 1.2) + txt(170, 460, "Criminal", { size: 22, fill: "#ffb3ae", anchor: "middle" });
    const denied = t > 21.4;
    const prompt = denied
      ? rect(460, 450, 420, 70, 10, "#fde8e7") + g(470, 457, 0.56, icon.cross()) + txt(540, 495, "Sign-in denied", { size: 24, weight: 700, fill: "#b3261e" })
      : rect(460, 450, 420, 70, 10, "#eef4ff") + txt(480, 494, "Approve the sign-in on your phone…", { size: 21, fill: C.ink });
    s += browser(320, 150, 580, 400, "mail.vessel-mail.com", signIn(320, 150, "••••••••••••"));
    s += op(ramp(t, 17.6, 18), prompt);
    // signal to the crew phone
    const sig = ramp(t, 18, 19.2);
    if (t > 18 && t < 22) for (let i = 0; i < 3; i++) {
      const p = clamp(sig - i * 0.15);
      if (p > 0) s += circle(...pt([900, 480], [1240, 380], p), 9, C.teal);
    }
    // phone
    s += rect(1150, 160, 300, 560, 36, "#1c2230", "#4a5a78", 3) + rect(1170, 196, 260, 488, 10, C.panel2);
    s += op(ramp(t, 19, 19.4), g(1250, 220, 1, icon.lock(C.gold)) +
      txt(1300, 360, "Sign-in request", { size: 24, weight: 700, fill: C.white, anchor: "middle" }) +
      txt(1300, 396, "Location: unknown", { size: 19, fill: C.muted, anchor: "middle" }) +
      txt(1300, 424, "Device: Windows PC", { size: 19, fill: C.muted, anchor: "middle" }) +
      txt(1300, 470, "Was this you?", { size: 22, fill: C.white, anchor: "middle" }) +
      rect(1195, 500, 210, 56, 10, C.green, "none", 0, `opacity="${denied ? 0.35 : 1}"`) + txt(1300, 536, "Yes, it was me", { size: 20, weight: 700, fill: C.white, anchor: "middle" }) +
      rect(1195, 572, 210, 56, 10, denied ? C.red : "none", C.red, 3) + txt(1300, 608, "No, deny", { size: 20, weight: 700, fill: denied ? C.white : C.red, anchor: "middle" }));
    if (t > 20.2 && t < 21.6) {
      const tap = ramp(t, 20.2, 21);
      const [fx, fy] = pt([1480, 760], [1310, 600], tap);
      s += circle(fx, fy, 22, "#f2c9a8", "#b98a6a", 2);
      if (t > 21.1) s += circle(1300, 600, 20 + (t - 21.1) * 80, "none", C.white, 3, `opacity="${clamp(1 - (t - 21.1) * 2)}"`);
    }
    s += txt(1300, 760, "Your phone", { size: 22, fill: C.muted, anchor: "middle" });
    b += op(o3, s);
    b += captions(t, [[16.8, 21.3, "With MFA the password alone isn't enough — it needs your phone too."], [21.4, 26, "Never approve a sign-in you didn't start. Deny it, then report it.", "Then change your password."]]);
  }
  b += endCard(t, 26, "Turn on MFA everywhere you can.", "And never share a code — nobody genuine will ask for it.");
  return b;
}

// ── A3: GPS jamming and spoofing ───────────────────────────────────────────
function gps(t) {
  let b = backdrop(W, H);
  b += titleCard(t, 3.2, "Navigation safety", "When the screen lies", "GPS jamming and spoofing");

  const o1 = vis(t, 3.2, 16.5);
  if (o1 > 0) {
    let s = "";
    // ECDIS panel
    const ex = 90, ey = 120, ew = 680, eh = 590;
    s += rect(ex, ey, ew, eh, 16, "#0f3550", C.line, 3) + txt(ex + 24, ey + 42, "ECDIS — position from GPS", { size: 24, weight: 700, fill: C.white });
    s += `<clipPath id="ec"><rect x="${ex}" y="${ey + 60}" width="${ew}" height="${eh - 60}"/></clipPath><g clip-path="url(#ec)">` +
      `<path d="M${ex} ${ey + 60} H${ex + 250} C${ex + 300} ${ey + 200} ${ex + 260} ${ey + 330} ${ex + 220} ${ey + eh} H${ex} Z" fill="#c8b27a"/>` +
      `<path d="M${ex + ew} ${ey + 60} H${ex + 470} C${ex + 430} ${ey + 220} ${ex + 470} ${ey + 380} ${ex + 520} ${ey + eh} H${ex + ew} Z" fill="#c8b27a"/>` +
      line(ex + 360, ey + eh, ex + 360, ey + 60, C.red, 3, 'stroke-dasharray="12 10"') + `</g>`;
    // own ship: true track straight up the channel; GPS position drifts onto land after 7.5 s
    const prog = clamp((t - 3.2) / 13);
    const trueY = ey + eh - 70 - prog * 300;
    const drift = ramp(t, 7.5, 11.5);
    const shipX = ex + 360 - drift * 300 + (t > 11.5 ? Math.sin(t * 9) * 4 : 0);
    const shipY = trueY - drift * 40;
    s += `<path transform="translate(${shipX} ${shipY})" d="M0 -26 L16 18 L0 10 L-16 18 Z" fill="${drift > 0.6 ? C.red : C.white}"/>`;
    s += circle(shipX, shipY, 30, "none", drift > 0.6 ? C.red : C.white, 2, 'opacity="0.6"');
    s += rect(ex + 20, ey + eh - 70, 300, 52, 8, C.deep, "none", 0, 'opacity="0.85"') +
      txt(ex + 36, ey + eh - 36, drift > 0.5 ? "SOG 0.0 kn   ⚠ GPS" : `SOG 8.${Math.floor(t * 3) % 10} kn   GPS OK`, { size: 22, weight: 600, fill: drift > 0.5 ? C.amber : C.green, family: "Consolas, monospace" });
    // radar panel
    const rx = 1180, ry = 400, rr = 270;
    s += rect(830, 120, 680, 590, 16, "#0a1a12", C.line, 3) + txt(854, 162, "Radar — independent of GPS", { size: 24, weight: 700, fill: C.white });
    s += `<clipPath id="rc"><circle cx="${rx}" cy="${ry + 20}" r="${rr - 30}"/></clipPath>`;
    s += circle(rx, ry + 20, rr - 30, "#03140b", "#2e6b45", 2);
    for (const r of [80, 160]) s += circle(rx, ry + 20, r, "none", "#1d4a30", 1.5);
    s += `<g clip-path="url(#rc)">` +
      `<path d="M${rx - 250} ${ry - 230} C${rx - 150} ${ry - 100} ${rx - 160} ${ry + 60} ${rx - 200} ${ry + 270}" fill="none" stroke="#f0a030" stroke-width="16" opacity="0.8"/>` +
      `<path d="M${rx + 140} ${ry - 230} C${rx + 100} ${ry - 80} ${rx + 120} ${ry + 80} ${rx + 170} ${ry + 270}" fill="none" stroke="#f0a030" stroke-width="16" opacity="0.8"/>`;
    const ang = t * 2.2;
    s += `<path d="M${rx} ${ry + 20} L${rx + Math.cos(ang) * 260} ${ry + 20 + Math.sin(ang) * 260} A260 260 0 0 0 ${rx + Math.cos(ang - 0.35) * 260} ${ry + 20 + Math.sin(ang - 0.35) * 260} Z" fill="#3fb27f" opacity="0.25"/>` + `</g>`;
    s += `<path transform="translate(${rx} ${ry + 20})" d="M0 -18 L11 12 L0 6 L-11 12 Z" fill="${C.green}"/>`;
    s += txt(rx, 692, "Still in the middle of the channel", { size: 22, fill: C.green, anchor: "middle" });
    b += op(o1, s);
    b += captions(t, [[3.5, 7.4, "Normally the GPS position, the chart and the radar all agree."], [7.5, 12, "Jamming or spoofing can freeze your GPS — or move you onto land."], [12.1, 16.5, "Radar, visual bearings and the echo sounder don't depend on GPS."]]);
  }

  const o2 = vis(t, 16.5, 27.5);
  if (o2 > 0) {
    let s = txt(120, 170, "IF THE GPS LOOKS WRONG", { size: 22, weight: 700, fill: C.gold, spacing: 3 }) +
      txt(120, 240, "What to do", { size: 60, family: SERIF, fill: C.white });
    const steps = [
      "Cross-check: radar ranges, visual bearings, depth",
      "Tell the Officer of the Watch / Captain at once",
      "Navigate on the sources you can trust",
      "Log it and report it — others may be affected too",
    ];
    steps.forEach((st, i) => {
      const o = ramp(t, 17.2 + i * 1.6, 17.8 + i * 1.6);
      const y = 320 + i * 110;
      s += op(o, `<g transform="translate(${(1 - o) * 40} 0)">` + circle(160, y, 30, C.gold) + txt(160, y + 11, String(i + 1), { size: 30, weight: 700, fill: C.bg, anchor: "middle" }) +
        txt(220, y + 12, st, { size: 34, weight: 600, fill: C.white }) + `</g>`);
    });
    s += g(1230, 300, 2.6, icon.ecdis()) + g(1360, 270, 1, icon.warn());
    b += op(o2, s);
  }
  b += endCard(t, 27.5, "Never rely on a single source.", "Cross-check, tell the OOW, report it.");
  return b;
}

export const ANIMATIONS = {
  "a1-one-click-whole-ship.mp4": { seconds: 35, frame: oneClick },
  "a2-why-mfa.mp4": { seconds: 30, frame: mfa },
  "a3-gps-spoofing.mp4": { seconds: 31.5, frame: gps },
};
export const frameSvg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${C.bg}"/>${body}</svg>`;
