// node scripts/academy-cyber/render-pdfs.mjs <out dir> [name filter]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFS } from "./pdfs.mjs";

const [out, filter] = process.argv.slice(2);
if (!out) throw new Error("Usage: render-pdfs.mjs <out dir> [name filter]");
mkdirSync(out, { recursive: true });
for (const [name, make] of Object.entries(PDFS)) {
  if (filter && !name.includes(filter)) continue;
  const buf = await make();
  writeFileSync(join(out, name), buf);
  console.log("✓", name, `${(buf.length / 1024).toFixed(0)} KB`);
}
