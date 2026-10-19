/** Course creator publish checks: located issues say exactly what publishProblems() says, for every kind of gap. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { courseIssues } from "../builder-checks";
import { emptyContent, newBlock, newQuestion, publishProblems, type BlockType, type CourseContent } from "../content";
// @ts-ignore plain JS generator module
import { buildCourse, MEDIA_FILES } from "../../../../scripts/academy-cyber/course.mjs";

const same = (c: CourseContent) => assert.deepEqual(courseIssues(c).map((i) => i.full), publishProblems(c));
const cyber = (): CourseContent =>
  buildCourse(Object.fromEntries((MEDIA_FILES as string[]).map((f, i) => [f, `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`])));

test("a finished course has no issues", () => {
  assert.deepEqual(courseIssues(cyber()), []);
  same(cyber());
});

test("an empty course, an untitled section and an empty lesson match publishProblems", () => {
  same({ sections: [] });
  same({ sections: [{ id: "s1", title: "", lessons: [] }] });
  const c = emptyContent();
  c.sections[0].title = "";
  c.sections[0].lessons[0].title = " ";
  same(c);
  const issues = courseIssues(c);
  assert.equal(issues.find((i) => i.text.includes("lesson is empty"))?.lessonId, c.sections[0].lessons[0].id);
});

test("every new, unfilled block type is flagged on the block itself, in step with publishProblems", () => {
  const types = ["reading", "video", "document", "image", "quiz", "acknowledge", "match", "order", "sort", "hotspot"] as BlockType[];
  const c = emptyContent();
  const blocks = types.map(newBlock);
  c.sections[0].lessons[0].blocks = blocks;
  same(c);
  const byBlock = new Set(courseIssues(c).map((i) => i.blockId));
  for (const b of blocks) if (b.type !== "acknowledge") assert.ok(byBlock.has(b.id), `${b.type} is flagged`);
});

test("broken quizzes, exercises and media in a real course match publishProblems", () => {
  const c = cyber();
  const all = c.sections.flatMap((s) => s.lessons.flatMap((l) => l.blocks));
  for (const b of all) {
    if (b.type === "quiz") { b.questions[0].correct = []; b.questions.push({ ...newQuestion("multi"), prompt: "" }); }
    if (b.type === "image" || b.type === "document") b.mediaId = null;
    if (b.type === "video") { b.mediaId = null; b.url = null; }
    if (b.type === "hotspot") { b.spots = []; b.mediaId = null; }
    if (b.type === "match") b.pairs[0].right = "";
    if (b.type === "order") b.items = b.items.slice(0, 1);
    if (b.type === "sort") { b.buckets[0].text = ""; b.items[1].text = " "; }
    if (b.type === "reading") b.markdown = "  ";
    if (b.type === "acknowledge") b.statement = "";
  }
  c.sections[2].title = "";
  same(c);
  assert.ok(courseIssues(c).length > 40);
  assert.ok(courseIssues(c).every((i) => i.text && i.sectionId));
});
