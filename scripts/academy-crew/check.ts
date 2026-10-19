// npx tsx scripts/academy-crew/check.ts <privacy|uae|respect|wellbeing> [--json out.json] — the course passes the app's own content rules.
// With --json, writes the course with media ids taken from ids.json (file name → academy_media id) next to the course.
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { normalizeContent, publishProblems, forLearner, allBlocks } from "../../src/lib/academy/content";

const [course, flag, outFile] = process.argv.slice(2);
if (!course) throw new Error("Usage: check.ts <course folder> [--json out.json]");
const { buildCourse, MEDIA_FILES, COURSE } = await import(`./${course}/course.mjs`);
const idsPath = new URL(`./${course}/ids.json`, import.meta.url);
const real = flag === "--json";
const ids: Record<string, string> = real
  ? JSON.parse(readFileSync(idsPath, "utf8"))
  : Object.fromEntries(MEDIA_FILES.map((f: string) => [f, randomUUID()]));
if (real && !existsSync(idsPath)) throw new Error("ids.json missing");

const raw = buildCourse(ids);
const clean = normalizeContent(raw);
if (JSON.stringify(clean) !== JSON.stringify(raw)) {
  console.error("normalizeContent changed the course:");
  const a = JSON.stringify(raw, null, 1).split("\n"), b = JSON.stringify(clean, null, 1).split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { console.error(i, a[i], "→", b[i]); if (i > 40) break; }
  process.exit(1);
}
const problems = publishProblems(clean);
if (problems.length) { console.error(problems); process.exit(1); }
const learner = JSON.stringify(forLearner(clean));
if (/"correct":\["|"explanation"|"bucketId":"[^"]|"rightId":"[^"]|"spots":\[\{/.test(learner)) { console.error("answer keys leak to learners"); process.exit(1); }
// every listed file is used, every used file is listed
const used = new Set(JSON.stringify(buildCourse(Object.fromEntries(MEDIA_FILES.map((f: string) => [f, f])))).match(/"mediaId":"[^"]+"/g)!.map((m) => m.slice(11, -1)));
const unused = MEDIA_FILES.filter((f: string) => !used.has(f));
if (unused.length) { console.error("listed but not used:", unused); process.exit(1); }
const blocks = allBlocks(clean);
const count: Record<string, number> = {};
for (const b of blocks) count[b.type] = (count[b.type] ?? 0) + 1;
console.log("OK —", COURSE.title, "—", clean.sections.length, "sections,", clean.sections.flatMap((s) => s.lessons).length, "lessons,", blocks.length, "blocks", count);
console.log("JSON size", JSON.stringify(clean).length);
if (real && outFile) { writeFileSync(outFile, JSON.stringify(clean)); console.log("wrote", outFile); }
