// node scripts/academy-crew/spotcheck.mjs <course> <pictures dir> <out dir> — draws every hotspot's
// right places onto its picture so they can be checked by eye.
import sharp from "sharp";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
const [course, dir, out] = process.argv.slice(2);
const { content } = await import(`./${course}/course.mjs`);
mkdirSync(out, { recursive: true });
let n = 0;
for (const s of content().sections) for (const l of s.lessons) for (const b of l.blocks) {
  if (b.type !== "hotspot") continue;
  const file = b.mediaId.slice(1);
  const meta = await sharp(join(dir, file)).metadata();
  const W = meta.width, k = W / 100;
  const marks = b.spots.map((p) => `<circle cx="${p.x * k}" cy="${p.y * k}" r="${p.r * k}" fill="#ff00ff" fill-opacity="0.35" stroke="#ff00ff" stroke-width="3"/>`).join("");
  const over = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${meta.height}">${marks}</svg>`);
  const marked = await sharp(join(dir, file)).composite([{ input: over }]).png().toBuffer();
  await sharp(marked).resize(1000).png().toFile(join(out, `spot-${++n}-${file}`));
  console.log(n, b.title, "→", file);
}
