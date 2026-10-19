/** Crew Academy offline: progress made with no signal looks the same as what the server would record. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyLocally } from "../../../components/academy/academy-offline";
import { courseOutcome, type CourseContent } from "../content";

const content: CourseContent = { sections: [{ id: "s", title: "S", lessons: [{ id: "l", title: "L", blocks: [
  { id: "r", type: "reading", markdown: "x" },
  { id: "v", type: "video", mediaId: "11111111-1111-4111-8111-111111111111", mustWatch: true },
  { id: "a", type: "acknowledge", statement: "ok" },
] }] }] };

test("opening a lesson, watching and signing off offline completes the course locally", () => {
  let p = applyLocally(content, [], { op: "viewed", enrolment: "e", lessonId: "l" });
  assert.ok(p.find((x) => x.block_id === "r")?.viewed_at);
  assert.equal(p.find((x) => x.block_id === "v"), undefined); // a must-watch video isn't "seen" by opening the lesson
  p = applyLocally(content, p, { op: "video", enrolment: "e", blockId: "v", percent: 60 });
  p = applyLocally(content, p, { op: "video", enrolment: "e", blockId: "v", percent: 40 });
  assert.equal(p.find((x) => x.block_id === "v")?.video_percent, 60); // never goes backwards
  p = applyLocally(content, p, { op: "video", enrolment: "e", blockId: "v", percent: 95 });
  p = applyLocally(content, p, { op: "acknowledge", enrolment: "e", blockId: "a" });
  assert.equal(courseOutcome(content, p).complete, true);
});
