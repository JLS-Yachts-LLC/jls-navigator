/**
 * Crew Academy — publish checks, located. The same rules as publishProblems()
 * (content.ts), but each one says WHERE it is (section / lesson / block) so the
 * course creator can show it on the block itself and jump to it. `full` is the
 * exact publishProblems() wording; builder-checks.test.ts keeps the two in step.
 */
import { BLOCK_LABELS, type Block, type CourseContent } from "@/lib/academy/content";

export type Issue = {
  sectionId: string | null;
  lessonId: string | null;
  blockId: string | null;
  /** Short, for showing next to the thing itself ("No file yet"). */
  text: string;
  /** As publishProblems() words it, with the section › lesson prefix. */
  full: string;
};

/** What's missing in one block — short wording, in publishProblems() order. */
export function blockIssues(b: Block): { text: string; tail: string }[] {
  const out: { text: string; tail: string }[] = [];
  const add = (text: string, tail: string) => out.push({ text, tail });
  if (b.type === "reading" && !b.markdown.trim()) add("No text yet", "a reading block is empty.");
  if (b.type === "video" && !b.mediaId && !b.url) add("No video file or link yet", "a video has no file or link.");
  if ((b.type === "document" || b.type === "image") && !b.mediaId) add("No file yet", `a ${BLOCK_LABELS[b.type].toLowerCase()} has no file.`);
  if (b.type === "acknowledge" && !b.statement.trim()) add("No statement yet", `a "read & understood" block has no statement.`);
  if (b.type === "match") {
    if (b.pairs.length < 2) add("Needs at least two pairs", "a matching exercise needs at least two pairs.");
    if (b.pairs.some((pr) => !pr.left.trim() || !pr.right.trim())) add("A pair is half empty", "a matching exercise has an empty item.");
  }
  if (b.type === "order") {
    if (b.items.length < 2) add("Needs at least two steps", "an ordering exercise needs at least two steps.");
    if (b.items.some((o) => !o.text.trim())) add("A step is empty", "an ordering exercise has an empty step.");
  }
  if (b.type === "sort") {
    if (b.buckets.length < 2) add("Needs at least two groups", "a sorting exercise needs at least two groups.");
    if (b.buckets.some((o) => !o.text.trim())) add("A group has no name", "a sorting exercise has a group with no name.");
    if (b.items.length < 2) add("Needs at least two items", "a sorting exercise needs at least two items.");
    if (b.items.some((o) => !o.text.trim())) add("An item is empty", "a sorting exercise has an empty item.");
  }
  if (b.type === "hotspot") {
    if (!b.mediaId) add("No picture yet", "a picture exercise has no picture.");
    if (b.spots.length === 0) add("No right place marked", "a picture exercise has no right place marked.");
  }
  if (b.type === "quiz") {
    if (b.questions.length === 0) add("No questions yet", "a quiz has no questions.");
    b.questions.forEach((q, qi) => {
      const n = `Question ${qi + 1}`, qn = `quiz question ${qi + 1}`;
      if (!q.prompt.trim()) add(`${n} has no question text`, `${qn} has no question text.`);
      if (q.options.length < 2) add(`${n} needs at least two answers`, `${qn} needs at least two answers.`);
      if (q.options.some((o) => !o.text.trim())) add(`${n} has an empty answer`, `${qn} has an empty answer.`);
      if (q.correct.length === 0) add(`${n} has no right answer marked`, `${qn} has no right answer marked.`);
    });
  }
  return out;
}

/** Every publish check in the course, located, in publishProblems() order. */
export function courseIssues(content: CourseContent): Issue[] {
  const issues: Issue[] = [];
  const lessons = content.sections.flatMap((s) => s.lessons);
  if (lessons.length === 0) {
    issues.push({ sectionId: content.sections[0]?.id ?? null, lessonId: null, blockId: null, text: "Add at least one lesson", full: "Add at least one lesson." });
  }
  content.sections.forEach((s, si) => {
    if (!s.title.trim()) issues.push({ sectionId: s.id, lessonId: null, blockId: null, text: "The section needs a title", full: `Section ${si + 1} needs a title.` });
    s.lessons.forEach((l, li) => {
      const where = `${s.title.trim() || `Section ${si + 1}`} › ${l.title.trim() || `Lesson ${li + 1}`}`;
      const at = { sectionId: s.id, lessonId: l.id };
      if (!l.title.trim()) issues.push({ ...at, blockId: null, text: "The lesson needs a title", full: `${where}: the lesson needs a title.` });
      if (l.blocks.length === 0) issues.push({ ...at, blockId: null, text: "The lesson is empty — add a block", full: `${where}: the lesson is empty.` });
      for (const b of l.blocks) {
        for (const i of blockIssues(b)) issues.push({ ...at, blockId: b.id, text: i.text, full: `${where}: ${i.tail}` });
      }
    });
  });
  return issues;
}
