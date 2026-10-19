// node scripts/academy-cyber/render-pictures.mjs <out dir>
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PICTURES } from "./pictures.mjs";
import { LEADER_PICTURES } from "./pictures-leaders.mjs";

const out = process.argv[2];
if (!out) throw new Error("Usage: render-pictures.mjs <out dir>");
mkdirSync(out, { recursive: true });
const only = process.argv[3];
for (const [name, make] of Object.entries({ ...PICTURES, ...LEADER_PICTURES })) {
  if (only && !name.includes(only)) continue;
  await sharp(Buffer.from(make())).png({ compressionLevel: 9, palette: false }).toFile(join(out, name));
  console.log("✓", name);
}
