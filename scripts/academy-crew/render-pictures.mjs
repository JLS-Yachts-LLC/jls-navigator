// node scripts/academy-crew/render-pictures.mjs <course folder> <out dir> [name filter]
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [course, out, only] = process.argv.slice(2);
if (!course || !out) throw new Error("Usage: render-pictures.mjs <course folder> <out dir> [name filter]");
const { PICTURES } = await import(`./${course}/pictures.mjs`);
mkdirSync(out, { recursive: true });
for (const [name, make] of Object.entries(PICTURES)) {
  if (only && !name.includes(only)) continue;
  await sharp(Buffer.from(make())).png({ compressionLevel: 9 }).toFile(join(out, name));
  console.log("✓", name);
}
