/** Crew Academy content rules: cleaning, answer-key stripping, marking and completion. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  courseOutcome, embedUrl, forLearner, gradeQuiz, normalizeContent, publishProblems,
  type CourseContent, type QuizBlock,
} from "../content";

const quiz: QuizBlock = {
  id: "q1", type: "quiz", title: "Check",
  questions: [
    { id: "a", kind: "single", prompt: "Pick b", options: [{ id: "x", text: "x" }, { id: "b", text: "b" }], correct: ["b"], explanation: "Because" },
    { id: "m", kind: "multi", prompt: "Pick both", options: [{ id: "1", text: "1" }, { id: "2", text: "2" }, { id: "3", text: "3" }], correct: ["1", "2"] },
  ],
};
const course: CourseContent = {
  sections: [{ id: "s", title: "Fire", lessons: [{ id: "l", title: "Extinguishers", blocks: [
    { id: "r1", type: "reading", markdown: "Read me" },
    { id: "v1", type: "video", mediaId: "11111111-1111-4111-8111-111111111111", mustWatch: true },
    quiz,
    { id: "ack", type: "acknowledge", statement: "Understood" },
  ] }] }],
};

test("forLearner strips every answer key and explanation", () => {
  const safe = JSON.stringify(forLearner(course));
  assert.ok(!safe.includes("Because"));
  const q = (forLearner(course).sections[0].lessons[0].blocks[2] as QuizBlock).questions;
  assert.deepEqual(q.map((x) => x.correct), [[], []]);
  // The original is untouched.
  assert.deepEqual(quiz.questions[0].correct, ["b"]);
});

test("gradeQuiz is all-or-nothing per question", () => {
  const half = gradeQuiz(quiz, { a: ["b"], m: ["1"] }, 80);
  assert.equal(half.score, 50);
  assert.equal(half.passed, false);
  const full = gradeQuiz(quiz, { a: ["b"], m: ["2", "1", "2"] }, 80);
  assert.equal(full.score, 100);
  assert.equal(full.passed, true);
  assert.equal(full.questions[0].explanation, "Because");
  assert.equal(gradeQuiz(quiz, { a: "b" as any }, 80).right, 0);
});

test("courseOutcome needs every block done, video watched and quiz passed", () => {
  const base = [
    { block_id: "r1", viewed_at: "t" },
    { block_id: "v1", viewed_at: "t", video_percent: 40 },
    { block_id: "q1", score: 50 },
    { block_id: "ack", completed_at: "t" },
  ];
  let o = courseOutcome(course, base);
  assert.equal(o.complete, false);
  assert.equal(o.done, 2);
  o = courseOutcome(course, [...base.slice(0, 1), { block_id: "v1", video_percent: 95 }, { block_id: "q1", score: 100, completed_at: "t" }, base[3]]);
  assert.equal(o.complete, true);
  assert.equal(o.score, 100);
});

test("normalizeContent drops unknown blocks, bad media ids and duplicate ids", () => {
  const n = normalizeContent({ sections: [{ id: "s", title: "S", lessons: [{ id: "l", title: "L", blocks: [
    { id: "dup", type: "reading", markdown: "a" },
    { id: "dup", type: "reading", markdown: "b" },
    { id: "x", type: "script", code: "alert(1)" },
    { id: "img", type: "image", mediaId: "../../etc/passwd" },
    { id: "q", type: "quiz", questions: [{ id: "q", kind: "single", options: [{ id: "o1", text: "1" }, { id: "o2", text: "2" }], correct: ["o1", "o2", "nope"] }] },
  ] }] }] });
  const blocks = n.sections[0].lessons[0].blocks;
  assert.equal(blocks.length, 4);
  assert.notEqual(blocks[0].id, blocks[1].id);
  assert.equal((blocks[2] as any).mediaId, null);
  assert.deepEqual((blocks[3] as QuizBlock).questions[0].correct, ["o1"]);
});

test("publishProblems flags what a learner would trip over", () => {
  assert.deepEqual(publishProblems(course), []);
  const p = publishProblems({ sections: [{ id: "s", title: "S", lessons: [{ id: "l", title: "L", blocks: [
    { id: "q", type: "quiz", questions: [{ id: "q", kind: "single", prompt: "?", options: [{ id: "a", text: "a" }, { id: "b", text: "" }], correct: [] }] },
  ] }] }] });
  assert.equal(p.length, 2);
  assert.match(p.join(" "), /no right answer/);
});

test("embedUrl accepts YouTube and Vimeo only", () => {
  assert.equal(embedUrl("https://www.youtube.com/watch?v=abc123"), "https://www.youtube-nocookie.com/embed/abc123");
  assert.equal(embedUrl("https://youtu.be/abc123"), "https://www.youtube-nocookie.com/embed/abc123");
  assert.equal(embedUrl("https://vimeo.com/76979871"), "https://player.vimeo.com/video/76979871");
  assert.equal(embedUrl("https://evil.example/video"), null);
});
