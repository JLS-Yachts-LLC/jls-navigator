// npx tsx scripts/academy-everyday/check.ts — the everyday AV/IT courses pass the app's own content rules.
import { randomUUID } from "node:crypto";
import { normalizeContent, publishProblems, forLearner, allBlocks } from "../../src/lib/academy/content";
// @ts-ignore plain JS modules
import { buildCourse } from "../academy-cyber/course.mjs";
// @ts-ignore
import { AV } from "./av-course.mjs";
// @ts-ignore
import { M365, CREWIT } from "./office-courses.mjs";
// @ts-ignore
import { GUESTWIFI, PRINTING, PHONES } from "./services-courses.mjs";

export const COURSES = [AV, M365, CREWIT, GUESTWIFI, PRINTING, PHONES];
let failed = false;
for (const c of COURSES) {
  const ids = Object.fromEntries((c.files as string[]).map((f) => [f, randomUUID()]));
  const raw = buildCourse(ids, c.content());
  const used = new Set(JSON.stringify(raw).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g));
  const clean = normalizeContent(raw);
  const problems = [
    ...(JSON.stringify(clean) !== JSON.stringify(raw) ? ["normalizeContent changed the course"] : []),
    ...publishProblems(clean),
    ...(/"correct":\["|"explanation"|"bucketId":"[^"]|"rightId":"[^"]|"spots":\[\{/.test(JSON.stringify(forLearner(clean))) ? ["answer keys leak to learners"] : []),
    ...(c.files as string[]).filter((f) => !used.has(ids[f])).map((f) => `file listed but not used: ${f}`),
  ];
  const count: Record<string, number> = {};
  for (const b of allBlocks(clean)) count[b.type] = (count[b.type] ?? 0) + 1;
  console.log(problems.length ? "✗" : "✓", c.title, "—", clean.sections.flatMap((s) => s.lessons).length, "lessons", JSON.stringify(count));
  for (const p of problems) { console.log("   ", p); failed = true; }
}
if (failed) process.exit(1);
