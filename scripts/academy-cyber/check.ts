// npx tsx scripts/academy-cyber/check.ts — the course passes the app's own content rules.
import { randomUUID } from "node:crypto";
import { normalizeContent, publishProblems, forLearner, allBlocks, gradeBlock } from "../../src/lib/academy/content";
// @ts-ignore plain JS module
import { buildCourse, MEDIA_FILES } from "./course.mjs";

const ids = Object.fromEntries(MEDIA_FILES.map((f: string) => [f, randomUUID()]));
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
const blocks = allBlocks(clean);
const count: Record<string, number> = {};
for (const b of blocks) count[b.type] = (count[b.type] ?? 0) + 1;
console.log("OK —", clean.sections.length, "sections,", clean.sections.flatMap((s) => s.lessons).length, "lessons,", blocks.length, "blocks", count);
console.log("JSON size", JSON.stringify(clean).length);
