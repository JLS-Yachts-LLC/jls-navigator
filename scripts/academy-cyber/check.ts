// npx tsx scripts/academy-cyber/check.ts — every cyber course passes the app's own content rules.
import { randomUUID } from "node:crypto";
import { normalizeContent, publishProblems, forLearner, allBlocks } from "../../src/lib/academy/content";
// @ts-ignore plain JS modules
import { buildCourse, content, MEDIA_FILES, COURSE } from "./course.mjs";
// @ts-ignore
import { OFFICERS, CAPTAINS } from "./courses-leaders.mjs";

const courses = [
  { title: COURSE.title, files: MEDIA_FILES as string[], content: content() },
  { title: OFFICERS.title, files: OFFICERS.files as string[], content: OFFICERS.content() },
  { title: CAPTAINS.title, files: CAPTAINS.files as string[], content: CAPTAINS.content() },
];
let failed = false;
for (const c of courses) {
  const ids = Object.fromEntries(c.files.map((f) => [f, randomUUID()]));
  const raw = buildCourse(ids, c.content);
  const used = new Set(JSON.stringify(raw).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g));
  const unused = c.files.filter((f) => !used.has(ids[f]));
  const clean = normalizeContent(raw);
  const problems = [
    ...(JSON.stringify(clean) !== JSON.stringify(raw) ? ["normalizeContent changed the course"] : []),
    ...publishProblems(clean),
    ...(/"correct":\["|"explanation"|"bucketId":"[^"]|"rightId":"[^"]|"spots":\[\{/.test(JSON.stringify(forLearner(clean))) ? ["answer keys leak to learners"] : []),
    ...unused.map((f) => `file listed but not used: ${f}`),
  ];
  const count: Record<string, number> = {};
  for (const b of allBlocks(clean)) count[b.type] = (count[b.type] ?? 0) + 1;
  console.log(problems.length ? "✗" : "✓", c.title, "—", clean.sections.length, "sections,", clean.sections.flatMap((s) => s.lessons).length, "lessons", JSON.stringify(count));
  for (const p of problems) { console.log("   ", p); failed = true; }
}
if (failed) process.exit(1);
