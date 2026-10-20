/**
 * Writes the How-to Guides as PDFs to docs/how-to-guides/:
 *   - one PDF per guide
 *   - one combined PDF per section (e.g. "Polaris - Operations How-to Guides.pdf")
 *
 * Run: node scripts/build-how-to-pdfs.ts   (Node 23+ runs TypeScript directly)
 * Same content as the in-app How-to Guides (src/lib/how-to/guides.ts).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { guidePdfName, guidesBySection, HOW_TO_GUIDES } from "../src/lib/how-to/guides.ts";
import { buildGuidesPdf } from "../src/lib/how-to/guide-pdf.ts";

const root = join(import.meta.dirname, "..");
const out = join(root, "docs", "how-to-guides");
const load = (src: string) => readFile(join(root, "public", src));

await mkdir(out, { recursive: true });
for (const g of HOW_TO_GUIDES) {
  await writeFile(join(out, guidePdfName(g)), await buildGuidesPdf([g], load));
  console.log("  ✓", guidePdfName(g));
}
for (const s of guidesBySection()) {
  const name = `Polaris - ${s.section} How-to Guides.pdf`;
  await writeFile(join(out, name), await buildGuidesPdf(s.guides, load, { title: `${s.section} How-to Guides` }));
  console.log("  ✓", name);
}
console.log(`Done → ${out}`);
