/** Crew Academy interactive exercises: nothing leaks to the learner, marking, completion. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blockForLearner, courseOutcome, gradeBlock, gradedItems, hitsSpot, normalizeContent, publishProblems,
  type CourseContent, type HotspotBlock, type MatchBlock, type OrderBlock, type SortBlock,
} from "../content";

const match: MatchBlock = { id: "m", type: "match", pairs: [
  { id: "p1", left: "CO2", right: "Electrical", rightId: "r9" },
  { id: "p2", left: "Foam", right: "Oil", rightId: "r4" },
  { id: "p3", left: "Water", right: "Wood", rightId: "r7" },
] };
const order: OrderBlock = { id: "o", type: "order", items: [{ id: "a", text: "Raise alarm" }, { id: "b", text: "Throw buoy" }, { id: "c", text: "Keep watch" }] };
const sort: SortBlock = { id: "s", type: "sort",
  buckets: [{ id: "g1", text: "Glass" }, { id: "g2", text: "Plastic" }],
  items: [{ id: "i1", text: "Bottle", bucketId: "g1" }, { id: "i2", text: "Wrapper", bucketId: "g2" }] };
const hot: HotspotBlock = { id: "h", type: "hotspot", mediaId: "11111111-1111-4111-8111-111111111111", spots: [{ id: "x", x: 50, y: 30, r: 5 }] };

test("the learner's copy carries no answer keys", () => {
  const m = blockForLearner(match) as MatchBlock;
  assert.ok(m.pairs.every((p) => p.right === "" && p.rightId === ""));
  assert.deepEqual(new Set(m.choices!.map((c) => c.id)), new Set(["r9", "r4", "r7"]));
  // Right ids are independent of pair ids, so a left id never points at its answer.
  assert.ok(m.choices!.every((c) => !m.pairs.some((p) => p.id === c.id)));
  const s = blockForLearner(sort) as SortBlock;
  assert.ok(s.items.every((i) => i.bucketId === ""));
  assert.deepEqual((blockForLearner(hot) as HotspotBlock).spots, []);
  const o = blockForLearner(order) as OrderBlock;
  assert.notDeepEqual(o.items.map((i) => i.id), ["a", "b", "c"]);
  assert.deepEqual(order.items.map((i) => i.id), ["a", "b", "c"]); // original untouched
});

test("matching, ordering and sorting give partial credit per item", () => {
  assert.equal(gradeBlock(match, { p1: "r9", p2: "r4", p3: "r7" }, 80).score, 100);
  const half = gradeBlock(match, { p1: "r9", p2: "r7", p3: "r4" }, 80);
  assert.equal(half.right, 1);
  assert.equal(half.passed, false);
  assert.equal(gradeBlock(order, ["a", "b", "c"], 100).passed, true);
  assert.equal(gradeBlock(order, ["b", "a", "c"], 100).score, 33);
  assert.equal(gradeBlock(order, "nonsense", 100).score, 0);
  assert.equal(gradeBlock(sort, { i1: "g1", i2: "g1" }, 50).score, 50);
});

test("a tap counts only inside a spot", () => {
  assert.equal(hitsSpot(hot.spots, 52, 31), true);
  assert.equal(hitsSpot(hot.spots, 60, 30), false);
  assert.equal(gradeBlock(hot, { x: 49, y: 29 }, 100).passed, true);
  assert.equal(gradeBlock(hot, { x: "a" }, 100).passed, false);
});

test("exercises count towards completion and the course score", () => {
  const course: CourseContent = { sections: [{ id: "s", title: "S", lessons: [{ id: "l", title: "L", blocks: [match, hot] }] }] };
  const o = courseOutcome(course, [{ block_id: "m", score: 100, completed_at: "t" }, { block_id: "h", score: 0 }]);
  assert.equal(o.complete, false);
  assert.equal(o.score, 50);
  assert.equal(gradedItems(order)[1].label, "Step 2: Throw buoy");
});

test("cleaning keeps right ids apart from pair ids, and publishing checks exercises", () => {
  const n = normalizeContent({ sections: [{ id: "s", title: "S", lessons: [{ id: "l", title: "L", blocks: [
    { id: "m", type: "match", pairs: [{ id: "p1", left: "a", right: "b", rightId: "p1" }, { id: "p2", left: "c", right: "", rightId: "z" }] },
    { id: "h", type: "hotspot", mediaId: null, spots: [] },
  ] }] }] });
  const m = n.sections[0].lessons[0].blocks[0] as MatchBlock;
  assert.notEqual(m.pairs[0].rightId, "p1");
  const problems = publishProblems(n).join(" | ");
  assert.match(problems, /matching exercise has an empty item/);
  assert.match(problems, /no picture/);
  assert.match(problems, /no right place marked/);
});
