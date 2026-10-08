/**
 * Builds the Client Portal app icons into public/portal-icons/:
 *   icon-192.png, icon-512.png   home-screen / install icons (Android, desktop)
 *   icon-maskable-512.png        Android adaptive icon — star inside the safe zone
 *   apple-touch-icon.png         180 px, iPhone / iPad home screen
 *
 *   node scripts/make-portal-icons.mjs
 *
 * The same Polaris star the portal's sidebar draws (src/components/brand/polaris-star.ts),
 * on the portal's navy rather than Orbit's teal, so the two apps are told apart
 * on a phone that has both. Edit the star there, then re-run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { POLARIS_STAR } from "../src/components/brand/polaris-star.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "portal-icons");
fs.mkdirSync(out, { recursive: true });

const STAR = POLARIS_STAR.polygons.map((p) => `<polygon points="${p.points}" fill="${p.fill}"/>`).join("");
// The portal's content navy (#0D1E44), lifted slightly at the top.
const GRADIENT = `<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#14306A"/><stop offset="1" stop-color="#0B1838"/>
</linearGradient></defs>`;

/** Full-bleed square with the star centred; `pad` grid units of margin each side. */
const tile = (pad) => {
  const lo = -pad, span = 64 + 2 * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${lo} ${lo} ${span} ${span}">
  ${GRADIENT}<rect x="${lo}" y="${lo}" width="${span}" height="${span}" fill="url(#t)"/>${STAR}</svg>`;
};

async function png(svg, size) {
  const big = await sharp(Buffer.from(svg), { density: 1200 }).resize(1024, 1024).png().toBuffer();
  return sharp(big).resize(size, size, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toBuffer();
}

const files = {
  "icon-192.png": await png(tile(8), 192),
  "icon-512.png": await png(tile(8), 512),
  // Android crops adaptive icons to as little as the centre 80% circle.
  "icon-maskable-512.png": await png(tile(18), 512),
  "apple-touch-icon.png": await png(tile(8), 180),
};
for (const [name, data] of Object.entries(files)) {
  fs.writeFileSync(path.join(out, name), data);
  console.log(name.padEnd(24), data.length, "bytes");
}
