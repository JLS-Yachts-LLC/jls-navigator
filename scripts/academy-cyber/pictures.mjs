// Still pictures for the "Cyber security at sea" course.
// Each entry: file name → { w, h, svg }. Hotspot exercises read SPOTS below
// (x, y, r as percentages of the picture's WIDTH, as the course player expects).
import { C, SANS, SERIF, esc, txt, para, svg, g, rect, circle, line, backdrop, icon, yacht, waves, titleBlock } from "./art.mjs";

const W = 1600, H = 900;
const pct = (v) => +(v / W * 100).toFixed(2);
const spot = (x, y, r) => ({ x: pct(x), y: pct(y), r: pct(r) });

// ── 1. Cover ────────────────────────────────────────────────────────────────
function cover() {
  let b = backdrop(W, H);
  // network constellation above the yacht
  const nodes = [[260, 230], [430, 150], [610, 250], [990, 160], [1180, 250], [1350, 140], [800, 120]];
  for (let i = 0; i < nodes.length - 1; i++) b += line(...nodes[i], ...nodes[i + 1], C.teal, 2, 'opacity="0.5"');
  b += line(...nodes[6], 800, 330, C.teal, 2, 'opacity="0.5"');
  for (const [x, y] of nodes) b += circle(x, y, 9, C.teal) + circle(x, y, 18, "none", C.teal, 2, 'opacity="0.35"');
  b += waves(W, 700, 0, C.sea) + waves(W, 735, 1.5, "#0f3160");
  b += g(500, 520, 1, yacht());
  b += g(700, 250, 2, icon.shield(C.gold));
  b += rect(0, 0, W, H, 0, "none");
  b += txt(W / 2, 80, "CREW ACADEMY", { size: 22, weight: 700, fill: C.gold, anchor: "middle", spacing: 4 });
  b += txt(W / 2, 840, "Cyber security at sea", { size: 64, family: SERIF, fill: C.white, anchor: "middle" });
  return svg(W, H, b);
}

// ── 2. The five Cyber Essentials controls, in ship terms ────────────────────
function fiveControls() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Cyber Essentials", "Five controls — and what they mean on board");
  const cards = [
    ["Firewalls", "Keep the ship's networks apart: guest and crew Wi-Fi never touch bridge or engine systems.", icon.firewall()],
    ["Secure settings", "No default passwords, no unknown apps, nothing switched on that isn't needed.", icon.lock(C.teal)],
    ["User access", "Your own login, a strong passphrase and two-step sign-in (MFA). Never share.", icon.key()],
    ["Malware protection", "Scan USB sticks and files. Don't plug unknown devices into ship's equipment.", icon.bug()],
    ["Security updates", "Install updates when asked. Critical fixes go on within 14 days.", icon.shield(C.green, C.white)],
  ];
  const cw = 272, gap = 20, x0 = (W - (cw * 5 + gap * 4)) / 2;
  cards.forEach(([t, d, ic], i) => {
    const x = x0 + i * (cw + gap), y = 230;
    b += rect(x, y, cw, 560, 18, C.panel, C.line, 2);
    b += circle(x + cw / 2, y + 110, 72, C.deep) + g(x + cw / 2 - 50, y + 60, 1, ic);
    b += txt(x + 24, y + 238, `${i + 1}`, { size: 22, weight: 700, fill: C.gold });
    b += txt(x + 24, y + 274, t, { size: 27, weight: 700, fill: C.white });
    b += para(x + 24, y + 318, d, { size: 23, width: 21, fill: C.text, lh: 1.4 });
  });
  b += txt(W / 2, 852, "Cyber Essentials Plus checks these controls are really in place — your habits keep them working.", { size: 24, fill: C.muted, anchor: "middle" });
  return svg(W, H, b);
}

// ── 3. Phishing email (hotspot picture, 1600 × 1000) ────────────────────────
const PH = 1000;
function phishingEmail() {
  let b = rect(0, 0, W, PH, 0, "#dfe4ee");
  // window chrome
  b += rect(60, 40, 1480, 920, 14, C.white, "#c3cad8", 2);
  b += rect(60, 40, 1480, 60, 14, "#eef1f6") + rect(60, 86, 1480, 14, 0, "#eef1f6");
  b += circle(100, 70, 9, "#e5534b") + circle(130, 70, 9, "#f0b030") + circle(160, 70, 9, "#3fb27f");
  b += txt(800, 79, "Inbox — crew@vessel-mail.com", { size: 22, fill: "#5b6476", anchor: "middle" });
  // header
  b += txt(110, 170, "URGENT: Your salary payment is ON HOLD — confirm your details within 2 hours", { size: 34, weight: 700, fill: C.ink });
  b += circle(140, 250, 34, "#2b5fb8") + txt(140, 262, "JP", { size: 26, weight: 700, fill: C.white, anchor: "middle" });
  b += txt(196, 240, "JLS Crew Payroll", { size: 26, weight: 700, fill: C.ink });
  b += txt(196, 276, "<payroll@jlsyachts-crewpay.com>", { size: 24, fill: "#5b6476" });
  b += txt(1490, 240, "Today 06:12", { size: 22, fill: "#5b6476", anchor: "end" });
  b += txt(196, 312, "To: undisclosed-recipients", { size: 22, fill: "#7a8394" });
  b += line(110, 345, 1490, 345, "#e3e7ef", 2);
  // body
  b += txt(110, 410, "Dear crew member,", { size: 27, fill: C.ink });
  b += para(110, 470, "We could not process this month's salary because your bank details have expired in our system. To avoid your payment being returned, you must confirm your details using the secure link below before 14:00 today.", { size: 27, width: 92, fill: C.ink, lh: 1.5 });
  b += para(110, 610, "If you do not confirm, your salary will be held until next month.", { size: 27, width: 92, fill: "#b3261e", weight: 600 });
  // button + hover tooltip showing the real address
  b += rect(110, 670, 400, 70, 10, "#2b5fb8") + txt(310, 715, "Confirm my bank details", { size: 27, weight: 700, fill: C.white, anchor: "middle" });
  b += `<path d="M300 742 l14 16 l5 -9 l10 -1 z" fill="${C.ink}" stroke="#fff" stroke-width="2"/>`; // cursor
  b += rect(540, 690, 720, 52, 8, "#2b2f38") + txt(560, 724, "http://jlsyachts-crewpay.com.verify-acct.ru/login", { size: 23, fill: "#f2f4f8", family: "Consolas, monospace" });
  b += txt(110, 800, "Kind regards,", { size: 27, fill: C.ink }) + txt(110, 838, "Payroll Team", { size: 27, fill: C.ink });
  // attachment
  b += rect(1060, 790, 430, 110, 10, "#f4f6fa", "#d3d9e4", 2);
  b += rect(1080, 810, 54, 70, 6, "#e5534b") + txt(1107, 853, "HTML", { size: 15, weight: 700, fill: C.white, anchor: "middle" });
  b += txt(1152, 840, "Salary_Form.html", { size: 25, weight: 600, fill: C.ink }) + txt(1152, 874, "38 KB", { size: 21, fill: "#7a8394" });
  return svg(W, PH, b, null);
}
export const PHISH_SPOTS = {
  sender: [spot(330, 268, 120), spot(470, 268, 120)],   // the look-alike address
  link: [spot(740, 716, 110), spot(960, 716, 110), spot(1160, 716, 110)],                           // where the button really goes
  attachment: [spot(1275, 845, 130)],
};

// ── 4. "Captain" gift-card scam on a phone ──────────────────────────────────
function giftCardScam() {
  let b = backdrop(W, H);
  // phone
  b += rect(150, 60, 430, 800, 46, "#1c2230", "#4a5a78", 3) + rect(172, 100, 386, 726, 10, "#e9e3da");
  b += rect(172, 100, 386, 86, 10, "#1f5c4f") + rect(172, 160, 386, 26, 0, "#1f5c4f");
  b += circle(222, 143, 24, "#c5ccd6") + g(204, 124, 0.36, icon.user("#7a8394"));
  b += txt(258, 138, "Captain (new number)", { size: 22, weight: 700, fill: C.white }) + txt(258, 166, "+44 7700 900461", { size: 18, fill: "#cfe3dd" });
  const bubble = (y, lines, mine = false) => {
    const h = lines.length * 30 + 26, w = mine ? 200 : 345, x = mine ? 542 - w : 188;
    let s = rect(x, y, w, h, 14, mine ? "#d6f5c8" : C.white);
    lines.forEach((l, i) => { s += txt(x + 16, y + 36 + i * 30, l, { size: 21, fill: C.ink }); });
    return s;
  };
  b += bubble(210, ["Hi, it's the Captain. I'm in a", "meeting with the owner and", "can't talk."]);
  b += bubble(342, ["I need you to buy 5 Apple gift", "cards, £200 each, for the", "guests. Send me photos of the", "codes as soon as you have them."]);
  b += bubble(504, ["Keep it between us please —", "it's a surprise. I'll pay you", "back today. Need them in 30", "minutes."]);
  b += bubble(666, ["Ok, which shop?"], true);
  // red flags
  b += titleBlock(700, 120, "Spot the scam", "Four red flags");
  const flags = [
    ["A new number", "Your Captain's number hasn't changed — a stranger's has."],
    ["Pressure and secrecy", "\"30 minutes\", \"keep it between us\" — so you don't check."],
    ["Gift cards or payments", "Real bosses don't buy guest gifts with crew money."],
    ["Can't talk", "They avoid a call because a voice would give them away."],
  ];
  flags.forEach(([t, d], i) => {
    const y = 250 + i * 128;
    b += g(700, y - 8, 0.62, icon.warn());
    b += txt(785, y + 22, t, { size: 30, weight: 700, fill: C.white });
    b += txt(785, y + 60, d, { size: 23, fill: C.muted });
  });
  b += rect(700, 770, 820, 84, 14, C.panel, C.gold, 2);
  b += txt(1110, 822, "Check it another way: call the number you already have, or ask in person.", { size: 22, weight: 600, fill: C.white, anchor: "middle" });
  return svg(W, H, b);
}

// ── 5. Passphrases + MFA ────────────────────────────────────────────────────
function passphrase() {
  let b = backdrop(W, H) + titleBlock(80, 90, "User access control", "Three random words — plus a second step");
  const bad = ["Password1", "Serenity2026!", "Summer2026", "12345678"];
  b += txt(80, 250, "Easy to guess", { size: 30, weight: 700, fill: C.red });
  bad.forEach((p, i) => {
    const y = 290 + i * 92;
    b += rect(80, y, 400, 70, 12, C.panel, C.red, 2) + txt(110, y + 46, p, { size: 30, family: "Consolas, monospace", fill: C.text });
    b += g(410, y + 12, 0.46, icon.cross());
  });
  b += txt(80, 700, "Names, years, the boat's name", { size: 22, fill: C.muted }) + txt(80, 732, "and keyboard patterns are guessed first.", { size: 22, fill: C.muted });
  // good
  b += txt(600, 250, "Strong and easy to remember", { size: 30, weight: 700, fill: C.green });
  ["Kettle", "Orbit", "Mango"].forEach((w, i) => {
    const x = 600 + i * 210;
    b += rect(x, 290, 190, 120, 16, C.panel2, C.green, 3) + txt(x + 95, 366, w, { size: 38, weight: 700, fill: C.white, anchor: "middle" });
  });
  b += txt(600, 470, "KettleOrbitMango7!", { size: 36, family: "Consolas, monospace", fill: C.gold });
  b += para(600, 520, "Use a different one for every account — a password manager remembers them for you.", { size: 24, width: 46, fill: C.muted });
  // MFA phone
  b += rect(1230, 230, 270, 520, 34, "#1c2230", "#4a5a78", 3) + rect(1248, 262, 234, 456, 8, C.panel2);
  b += g(1315, 290, 1, icon.lock(C.gold));
  b += txt(1365, 440, "Sign-in code", { size: 22, fill: C.muted, anchor: "middle" });
  b += txt(1365, 500, "482 913", { size: 44, weight: 700, fill: C.white, anchor: "middle", family: "Consolas, monospace" });
  b += rect(1270, 560, 190, 54, 10, C.green) + txt(1365, 595, "It was me", { size: 22, weight: 700, fill: C.white, anchor: "middle" });
  b += rect(1270, 628, 190, 54, 10, "none", C.red, 2) + txt(1365, 663, "Deny", { size: 22, weight: 700, fill: C.red, anchor: "middle" });
  b += txt(1365, 800, "MFA: a stolen password", { size: 24, weight: 600, fill: C.white, anchor: "middle" });
  b += txt(1365, 834, "isn't enough on its own.", { size: 24, weight: 600, fill: C.white, anchor: "middle" });
  b += rect(560, 640, 0, 0, 0, "none");
  b += txt(600, 700, "Never share your password — not even with IT.", { size: 26, weight: 600, fill: C.white });
  b += txt(600, 740, "Nobody genuine will ask for it, or for a sign-in code.", { size: 24, fill: C.muted });
  return svg(W, H, b);
}

// ── 6. USB and charging on the bridge ───────────────────────────────────────
function bridgeUsb() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Malware protection", "Bridge and engine-room equipment is not a charger");
  // left: console
  b += rect(80, 230, 680, 600, 20, C.panel, C.red, 3);
  b += rect(120, 470, 600, 250, 12, "#283245", "#3b4760", 2);
  b += g(230, 250, 3.8, icon.ecdis(), "") + `<path d="M300 470 L380 420 L470 400 L540 360" fill="none" stroke="#e5534b" stroke-width="4" stroke-dasharray="10 8"/>` + `<path d="M380 412 l12 22 h-24 z" fill="#ffffff"/>`;
  b += rect(560, 640, 60, 26, 4, "#121722", "#5a6578", 2) + txt(590, 700, "USB", { size: 18, fill: C.muted, anchor: "middle" });
  b += `<path d="M590 652 C590 600 660 600 660 560" fill="none" stroke="#c7ced9" stroke-width="7"/>`;
  b += g(608, 440, 1.2, icon.phone("#3a8f5c"));
  b += g(640, 250, 1.1, icon.cross());
  b += txt(420, 768, "ECDIS, radar, engine monitoring: never plug in phones,", { size: 22, fill: C.text, anchor: "middle" });
  b += txt(420, 800, "USB sticks or chargers — not even \"just to charge\".", { size: 22, fill: C.text, anchor: "middle" });
  // right: crew charging point
  b += rect(840, 230, 680, 600, 20, C.panel, C.green, 3);
  b += rect(1020, 330, 320, 200, 14, "#283245", "#3b4760", 2) + txt(1180, 380, "CREW CHARGING", { size: 22, weight: 700, fill: C.gold, anchor: "middle", spacing: 2 });
  [0, 1, 2].forEach((i) => { b += rect(1070 + i * 80, 420, 60, 70, 8, "#121722", "#5a6578", 2) + rect(1088 + i * 80, 446, 24, 10, 2, "#5a6578"); });
  b += g(1380, 250, 1.1, icon.tick());
  b += para(880, 610, "Charge phones in the crew mess or your cabin. USB sticks from shore, agents or contractors go to the ETO or officer to be scanned first.", { size: 23, width: 52, fill: C.text, lh: 1.45 });
  return svg(W, H, b);
}

// ── 7. Network separation ───────────────────────────────────────────────────
function networks() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Firewalls", "One connection to shore — separate networks on board");
  b += g(750, 170, 1, icon.satellite());
  b += txt(800, 300, "VSAT / Starlink / 4G", { size: 22, fill: C.muted, anchor: "middle" });
  b += line(800, 310, 800, 360, C.teal, 4);
  b += rect(640, 360, 320, 90, 14, "#5a1f1c", C.red, 3) + g(650, 365, 0.8, icon.firewall()) + txt(840, 415, "Firewall", { size: 30, weight: 700, fill: C.white, anchor: "middle" });
  const zones = [
    ["Guest Wi-Fi", "Guests' phones and laptops", C.teal, icon.phone()],
    ["Crew Wi-Fi", "Your own phone, tablet, laptop", C.teal, icon.laptop()],
    ["Ship's business", "Office PCs, email, accounts", C.gold, icon.server()],
    ["Bridge & engine", "ECDIS, radar, engine & alarm systems, CCTV", C.red, icon.ecdis()],
  ];
  const zw = 330, gap = 30, x0 = (W - (zw * 4 + gap * 3)) / 2;
  zones.forEach(([t, d, col, ic], i) => {
    const x = x0 + i * (zw + gap), y = 560;
    b += line(800, 450, x + zw / 2, y, col, 4, 'opacity="0.9"');
    b += rect(x, y, zw, 250, 18, C.panel, col, 3);
    b += g(x + 20, y + 30, 0.72, ic);
    b += txt(x + 106, y + 70, t, { size: 26, weight: 700, fill: C.white });
    b += para(x + 106, y + 110, d, { size: 21, width: 19, fill: C.muted });
  });
  // the walls between zones
  for (let i = 1; i < 4; i++) {
    const x = x0 + i * (zw + gap) - gap / 2;
    b += rect(x - 6, 590, 12, 190, 4, C.red) ;
  }
  b += txt(W / 2, 860, "Each network is walled off. Never plug a cable into a socket you don't know, or join a device to a network it isn't meant for.", { size: 23, fill: C.text, anchor: "middle" });
  return svg(W, H, b);
}

// ── 8. Social media oversharing (hotspot picture, 1600 × 1100) ─────────────
const SH = 1100;
function socialPost() {
  let b = rect(0, 0, W, SH, 0, "#e9edf3");
  b += rect(420, 30, 760, 1040, 18, C.white, "#cfd6e2", 2);
  b += circle(476, 86, 28, "#c79a2c") + txt(520, 80, "deckhand_life", { size: 24, weight: 700, fill: C.ink }) + txt(520, 110, "📍 Port Hercule, Monaco", { size: 21, fill: "#4a5568" });
  // photo
  b += rect(420, 140, 760, 620, 0, "#8fc3e8");
  b += rect(420, 560, 760, 200, 0, "#2f6ea8");
  b += `<g clip-path="url(#ph)"><clipPath id="ph"><rect x="420" y="140" width="760" height="620"/></clipPath>${g(470, 420, 1.1, yacht(C.white, C.white, "#1d3d6e"))}</g>`;
  b += txt(800, 588, "M/Y SERENITY", { size: 22, weight: 700, fill: "#1d3d6e", anchor: "middle", spacing: 2 });
  // crew pass on the table in the foreground
  b += rect(840, 640, 300, 170, 12, C.white, "#9aa5b8", 2, 'transform="rotate(-8 990 725)"');
  b += `<g transform="rotate(-8 990 725)">${rect(856, 656, 80, 96, 6, "#c5ccd6")}${g(860, 664, 0.72, icon.user("#7a8394"))}` +
    txt(950, 682, "CREW PASS", { size: 18, weight: 700, fill: C.ink }) + txt(950, 708, "J. MARTIN", { size: 16, fill: C.ink }) + txt(950, 730, "Deck — ID 40417", { size: 14, fill: "#4a5568" }) +
    [...Array(22)].map((_, i) => rect(950 + i * 7, 744, i % 3 ? 3 : 5, 40, 0, C.ink)).join("") + `</g>`;
  // actions + caption
  b += txt(450, 830, "♡   💬   ➤", { size: 30, fill: C.ink });
  b += txt(450, 880, "312 likes", { size: 22, weight: 700, fill: C.ink });
  b += txt(450, 924, "deckhand_life", { size: 23, weight: 700, fill: C.ink });
  b += txt(615, 924, "Owner + 8 guests arrive tomorrow 10:00 🥂", { size: 23, fill: C.ink });
  b += txt(450, 960, "then we sail for Corsica on Friday! Busy week ahead", { size: 23, fill: C.ink });
  b += txt(450, 996, "#crewlife #superyacht #monaco", { size: 23, fill: "#2b5fb8" });
  b += txt(450, 1040, "2 HOURS AGO", { size: 16, fill: "#8a93a3" });
  return svg(W, SH, b, null);
}
export const SOCIAL_SPOTS = {
  schedule: [spot(720, 925, 110), spot(940, 925, 110)],  // the owner's arrival time and the next passage
  pass: [spot(990, 725, 125)],      // crew pass with name, ID number and barcode
};

// ── 9. Report it poster ────────────────────────────────────────────────────
function reportIt() {
  let b = backdrop(W, H) + titleBlock(80, 90, "When something feels wrong", "Report it — straight away, no blame");
  const steps = [
    ["Stop", "Don't click anything else, don't reply, don't try to fix it yourself.", icon.warn()],
    ["Tell someone now", "Officer of the watch, your Head of Department, the ETO or the Captain.", icon.user(C.gold)],
    ["Leave it as it is", "Don't switch it off or delete anything. If you're told to, turn off Wi-Fi or unplug the cable.", icon.laptop("#5a1f1c", C.red)],
    ["Say what happened", "What you clicked or opened, when, and on which device or account.", icon.envelope()],
  ];
  steps.forEach(([t, d, ic], i) => {
    const x = 80 + i * 370, y = 240;
    b += rect(x, y, 350, 520, 18, C.panel, C.line, 2);
    b += circle(x + 175, y + 110, 72, C.deep) + g(x + 125, y + 60, 1, ic);
    b += circle(x + 40, y + 40, 22, C.gold) + txt(x + 40, y + 49, String(i + 1), { size: 24, weight: 700, fill: C.bg, anchor: "middle" });
    b += txt(x + 28, y + 250, t, { size: 32, weight: 700, fill: C.white });
    b += para(x + 28, y + 296, d, { size: 24, width: 25, fill: C.text, lh: 1.45 });
  });
  b += txt(W / 2, 840, "Reporting fast is what matters. Nobody gets into trouble for reporting a mistake.", { size: 27, weight: 600, fill: C.gold, anchor: "middle" });
  return svg(W, H, b);
}

// ── 10. Wrap-up ────────────────────────────────────────────────────────────
function summary() {
  let b = backdrop(W, H) + titleBlock(80, 90, "Remember", "Six habits that keep the ship safe");
  const items = [
    [icon.envelope(), "Pause before you click", "Unexpected, urgent or too good? Check it another way."],
    [icon.key(), "Strong, private passwords", "Three random words, one per account, and MFA."],
    [icon.usb(), "No unknown USBs", "Nothing plugged into bridge or engine equipment."],
    [icon.shield(C.green, C.white), "Update when asked", "Don't keep pressing \"later\"."],
    [icon.phone(), "Share less", "No positions, guests, itineraries or passes online."],
    [icon.warn(), "Report it fast", "Mistakes happen. Silence is what does the damage."],
  ];
  items.forEach(([ic, t, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 80 + col * 740, y = 220 + row * 210;
    b += rect(x, y, 700, 180, 18, C.panel, C.line, 2);
    b += circle(x + 95, y + 90, 62, C.deep) + g(x + 50, y + 45, 0.9, ic);
    b += txt(x + 190, y + 74, t, { size: 32, weight: 700, fill: C.white });
    b += para(x + 190, y + 118, d, { size: 22, width: 40, fill: C.muted });
  });
  return svg(W, H, b);
}

export const PICTURES = {
  "01-cover.png": cover,
  "02-five-controls.png": fiveControls,
  "03-phishing-email.png": phishingEmail,
  "04-gift-card-scam.png": giftCardScam,
  "05-passphrase-mfa.png": passphrase,
  "06-bridge-usb.png": bridgeUsb,
  "07-networks.png": networks,
  "08-social-post.png": socialPost,
  "09-report-it.png": reportIt,
  "10-six-habits.png": summary,
};
