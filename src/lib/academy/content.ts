/**
 * Crew Academy course content — the shape stored in academy_courses.draft_content
 * and snapshotted into academy_course_versions.content, plus the rules that work
 * on it. Shared by the server routes, the course creator and the course player.
 *
 *   course → sections → lessons → blocks
 *
 * Blocks: reading (markdown) · video (uploaded MP4, or a YouTube / Vimeo link) ·
 * document (PDF) · image · quiz (single / multiple choice, true or false) ·
 * acknowledge ("I have read and understood") — and the interactive exercises:
 * match (pair items up) · order (put steps in order) · sort (put items into
 * groups) · hotspot (tap the right place on a picture).
 *
 * Answer keys (`correct`, a pair's `rightId`, the authored order, an item's
 * `bucketId`, a picture's `spots`) and explanations live in the content. They
 * never leave the server before the learner submits: the player gets
 * forLearner(content), which strips them and shuffles what needs shuffling.
 */

export type BlockType = "reading" | "video" | "document" | "image" | "quiz" | "acknowledge" | "match" | "order" | "sort" | "hotspot";
export type QuestionKind = "single" | "multi" | "truefalse";

export type Option = { id: string; text: string };
export type Question = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  options: Option[];
  /** Option ids that are right. Stripped before the content reaches a learner. */
  correct: string[];
  /** Shown after answering. Stripped before the content reaches a learner. */
  explanation?: string;
};

export type ReadingBlock = { id: string; type: "reading"; markdown: string };
export type VideoBlock = {
  id: string; type: "video";
  /** academy_media id of an uploaded MP4 … */
  mediaId?: string | null;
  /** … or a YouTube / Vimeo link (not tracked: counts as watched once opened). */
  url?: string | null;
  title?: string;
  /** Must be watched (to VIDEO_DONE_PERCENT) before the block counts as done. */
  mustWatch: boolean;
};
export type DocumentBlock = { id: string; type: "document"; mediaId: string | null; title?: string };
export type ImageBlock = { id: string; type: "image"; mediaId: string | null; caption?: string };
export type QuizBlock = { id: string; type: "quiz"; title?: string; questions: Question[] };
export type AcknowledgeBlock = { id: string; type: "acknowledge"; statement: string };

/**
 * Pair each left item with its right one. `rightId` is a separate random id per
 * pair (not derived from the pair id), so the learner's copy — rights shuffled
 * into `choices`, keys removed — gives nothing away.
 */
export type MatchPair = { id: string; left: string; right: string; rightId: string };
export type MatchBlock = { id: string; type: "match"; title?: string; prompt?: string; pairs: MatchPair[]; choices?: Option[] };
/** Put the items in order. The authored order is the answer; learners get them shuffled. */
export type OrderBlock = { id: string; type: "order"; title?: string; prompt?: string; items: Option[] };
/** Put each item in the right group. `bucketId` is stripped for learners. */
export type SortItem = { id: string; text: string; bucketId: string };
export type SortBlock = { id: string; type: "sort"; title?: string; prompt?: string; buckets: Option[]; items: SortItem[] };
/**
 * Tap the right place on a picture. Spots are circles; x and y are percentages
 * of the picture's WIDTH (so a circle stays round whatever the height), r too.
 */
export type HotspotSpot = { id: string; x: number; y: number; r: number };
export type HotspotBlock = { id: string; type: "hotspot"; title?: string; prompt?: string; mediaId: string | null; spots: HotspotSpot[] };

export type Block = ReadingBlock | VideoBlock | DocumentBlock | ImageBlock | QuizBlock | AcknowledgeBlock
  | MatchBlock | OrderBlock | SortBlock | HotspotBlock;
/** Blocks that are marked (and retried until passed). */
export type GradedBlock = QuizBlock | MatchBlock | OrderBlock | SortBlock | HotspotBlock;
export const GRADED_TYPES = new Set<BlockType>(["quiz", "match", "order", "sort", "hotspot"]);
export const isGraded = (b: Block): b is GradedBlock => GRADED_TYPES.has(b.type);

export type Lesson = { id: string; title: string; blocks: Block[] };
export type Section = { id: string; title: string; lessons: Lesson[] };
export type CourseContent = { sections: Section[] };

/** Progress for one block (academy_progress row). */
export type BlockProgress = {
  block_id: string;
  viewed_at?: string | null;
  completed_at?: string | null;
  video_percent?: number | null;
  score?: number | null;
};

export const VIDEO_DONE_PERCENT = 90;
export const TRUE_FALSE_OPTIONS: Option[] = [{ id: "true", text: "True" }, { id: "false", text: "False" }];

export const BLOCK_LABELS: Record<BlockType, string> = {
  reading: "Reading",
  video: "Video",
  document: "PDF document",
  image: "Picture",
  quiz: "Quiz",
  acknowledge: "Read & understood",
  match: "Match pairs",
  order: "Put in order",
  sort: "Sort into groups",
  hotspot: "Tap the picture",
};

export const newId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).slice(0, 12);

export const emptyContent = (): CourseContent => ({
  sections: [{ id: newId(), title: "Section 1", lessons: [{ id: newId(), title: "Lesson 1", blocks: [] }] }],
});

export function newBlock(type: BlockType): Block {
  const id = newId();
  switch (type) {
    case "reading": return { id, type, markdown: "" };
    case "video": return { id, type, mediaId: null, url: null, title: "", mustWatch: true };
    case "document": return { id, type, mediaId: null, title: "" };
    case "image": return { id, type, mediaId: null, caption: "" };
    case "quiz": return { id, type, title: "", questions: [newQuestion("single")] };
    case "acknowledge": return { id, type, statement: "I have read and understood this lesson." };
    case "match": return { id, type, title: "", prompt: "Match each item with its pair.", pairs: [newPair(), newPair()] };
    case "order": return { id, type, title: "", prompt: "Put these steps in the right order.", items: [{ id: newId(), text: "" }, { id: newId(), text: "" }] };
    case "sort": {
      const a = { id: newId(), text: "" }, b2 = { id: newId(), text: "" };
      return { id, type, title: "", prompt: "Put each item in the right group.", buckets: [a, b2], items: [{ id: newId(), text: "", bucketId: a.id }, { id: newId(), text: "", bucketId: b2.id }] };
    }
    case "hotspot": return { id, type, title: "", prompt: "Tap the right place on the picture.", mediaId: null, spots: [] };
  }
}

export const newPair = (): MatchPair => ({ id: newId(), left: "", right: "", rightId: newId() });

export function newQuestion(kind: QuestionKind): Question {
  return {
    id: newId(), kind, prompt: "",
    options: kind === "truefalse" ? TRUE_FALSE_OPTIONS.map((o) => ({ ...o })) : [{ id: newId(), text: "" }, { id: newId(), text: "" }],
    correct: [],
    explanation: "",
  };
}

// ── Cleaning what the creator sends ──────────────────────────────────────────
export class ContentError extends Error {}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const idOf = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^[A-Za-z0-9_-]{1,40}$/.test(s) ? s : newId();
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mediaRef = (v: unknown): string | null => (typeof v === "string" && UUID_RE.test(v) ? v : null);

function cleanQuestion(raw: any): Question {
  const kind: QuestionKind = raw?.kind === "multi" || raw?.kind === "truefalse" ? raw.kind : "single";
  const options: Option[] = kind === "truefalse"
    ? TRUE_FALSE_OPTIONS.map((o) => ({ ...o }))
    : (Array.isArray(raw?.options) ? raw.options : []).slice(0, 10).map((o: any) => ({ id: idOf(o?.id), text: str(o?.text, 500) }));
  const ids = new Set(options.map((o) => o.id));
  let correct = (Array.isArray(raw?.correct) ? raw.correct : []).filter((c: unknown) => typeof c === "string" && ids.has(c));
  correct = [...new Set(correct)] as string[];
  if (kind !== "multi") correct = correct.slice(0, 1);
  return { id: idOf(raw?.id), kind, prompt: str(raw?.prompt, 2000), options, correct, explanation: str(raw?.explanation, 2000) };
}

function cleanBlock(raw: any): Block | null {
  const id = idOf(raw?.id);
  switch (raw?.type) {
    case "reading": return { id, type: "reading", markdown: str(raw.markdown, 100_000) };
    case "video": {
      const url = typeof raw.url === "string" && /^https:\/\//i.test(raw.url.trim()) ? raw.url.trim().slice(0, 500) : null;
      const mediaId = mediaRef(raw.mediaId);
      return { id, type: "video", mediaId, url: mediaId ? null : url, title: str(raw.title, 300), mustWatch: raw.mustWatch !== false };
    }
    case "document": return { id, type: "document", mediaId: mediaRef(raw.mediaId), title: str(raw.title, 300) };
    case "image": return { id, type: "image", mediaId: mediaRef(raw.mediaId), caption: str(raw.caption, 500) };
    case "quiz": return {
      id, type: "quiz", title: str(raw.title, 300),
      questions: (Array.isArray(raw.questions) ? raw.questions : []).slice(0, 100).map(cleanQuestion),
    };
    case "acknowledge": return { id, type: "acknowledge", statement: str(raw.statement, 1000) };
    case "match": {
      const pairs: MatchPair[] = (Array.isArray(raw.pairs) ? raw.pairs : []).slice(0, 20).map((pr: any) => ({
        id: idOf(pr?.id), left: str(pr?.left, 300), right: str(pr?.right, 300), rightId: idOf(pr?.rightId),
      }));
      // A right id must never equal a pair id (that would give the answer away) or repeat.
      const used = new Set(pairs.map((pr) => pr.id));
      for (const pr of pairs) { while (used.has(pr.rightId)) pr.rightId = newId(); used.add(pr.rightId); }
      return { id, type: "match", title: str(raw.title, 300), prompt: str(raw.prompt, 1000), pairs };
    }
    case "order": return {
      id, type: "order", title: str(raw.title, 300), prompt: str(raw.prompt, 1000),
      items: (Array.isArray(raw.items) ? raw.items : []).slice(0, 20).map((o: any) => ({ id: idOf(o?.id), text: str(o?.text, 300) })),
    };
    case "sort": {
      const buckets: Option[] = (Array.isArray(raw.buckets) ? raw.buckets : []).slice(0, 6).map((o: any) => ({ id: idOf(o?.id), text: str(o?.text, 120) }));
      const ids = new Set(buckets.map((b) => b.id));
      const items: SortItem[] = (Array.isArray(raw.items) ? raw.items : []).slice(0, 30).map((o: any) => ({
        id: idOf(o?.id), text: str(o?.text, 300), bucketId: ids.has(o?.bucketId) ? o.bucketId : (buckets[0]?.id ?? ""),
      }));
      return { id, type: "sort", title: str(raw.title, 300), prompt: str(raw.prompt, 1000), buckets, items };
    }
    case "hotspot": {
      const num = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number(v) || 0));
      return {
        id, type: "hotspot", title: str(raw.title, 300), prompt: str(raw.prompt, 1000), mediaId: mediaRef(raw.mediaId),
        spots: (Array.isArray(raw.spots) ? raw.spots : []).slice(0, 10).map((s: any) => ({
          id: idOf(s?.id), x: num(s?.x, 0, 100), y: num(s?.y, 0, 400), r: num(s?.r, 1, 50) || 6,
        })),
      };
    }
    default: return null;
  }
}

/** Accept only the known shape from the course creator; anything else is dropped. */
export function normalizeContent(raw: unknown): CourseContent {
  const sections = Array.isArray((raw as any)?.sections) ? (raw as any).sections : [];
  if (sections.length > 50) throw new ContentError("A course can have up to 50 sections.");
  const out: CourseContent = {
    sections: sections.map((s: any) => ({
      id: idOf(s?.id),
      title: str(s?.title, 300),
      lessons: (Array.isArray(s?.lessons) ? s.lessons : []).slice(0, 100).map((l: any) => ({
        id: idOf(l?.id),
        title: str(l?.title, 300),
        blocks: (Array.isArray(l?.blocks) ? l.blocks : []).slice(0, 100).map(cleanBlock).filter(Boolean) as Block[],
      })),
    })),
  };
  // Ids must be unique across the course: progress is keyed by block id.
  const seen = new Set<string>();
  for (const s of out.sections) for (const l of s.lessons) for (const b of l.blocks) {
    if (seen.has(b.id)) b.id = newId();
    seen.add(b.id);
  }
  return out;
}

/** What stops a course being published. Empty = ready. */
export function publishProblems(content: CourseContent): string[] {
  const problems: string[] = [];
  const lessons = content.sections.flatMap((s) => s.lessons);
  if (lessons.length === 0) problems.push("Add at least one lesson.");
  content.sections.forEach((s, si) => {
    if (!s.title.trim()) problems.push(`Section ${si + 1} needs a title.`);
    s.lessons.forEach((l, li) => {
      const where = `${s.title.trim() || `Section ${si + 1}`} › ${l.title.trim() || `Lesson ${li + 1}`}`;
      if (!l.title.trim()) problems.push(`${where}: the lesson needs a title.`);
      if (l.blocks.length === 0) problems.push(`${where}: the lesson is empty.`);
      for (const b of l.blocks) {
        if (b.type === "reading" && !b.markdown.trim()) problems.push(`${where}: a reading block is empty.`);
        if (b.type === "video" && !b.mediaId && !b.url) problems.push(`${where}: a video has no file or link.`);
        if ((b.type === "document" || b.type === "image") && !b.mediaId) problems.push(`${where}: a ${BLOCK_LABELS[b.type].toLowerCase()} has no file.`);
        if (b.type === "acknowledge" && !b.statement.trim()) problems.push(`${where}: a "read & understood" block has no statement.`);
        if (b.type === "match") {
          if (b.pairs.length < 2) problems.push(`${where}: a matching exercise needs at least two pairs.`);
          if (b.pairs.some((pr) => !pr.left.trim() || !pr.right.trim())) problems.push(`${where}: a matching exercise has an empty item.`);
        }
        if (b.type === "order") {
          if (b.items.length < 2) problems.push(`${where}: an ordering exercise needs at least two steps.`);
          if (b.items.some((o) => !o.text.trim())) problems.push(`${where}: an ordering exercise has an empty step.`);
        }
        if (b.type === "sort") {
          if (b.buckets.length < 2) problems.push(`${where}: a sorting exercise needs at least two groups.`);
          if (b.buckets.some((o) => !o.text.trim())) problems.push(`${where}: a sorting exercise has a group with no name.`);
          if (b.items.length < 2) problems.push(`${where}: a sorting exercise needs at least two items.`);
          if (b.items.some((o) => !o.text.trim())) problems.push(`${where}: a sorting exercise has an empty item.`);
        }
        if (b.type === "hotspot") {
          if (!b.mediaId) problems.push(`${where}: a picture exercise has no picture.`);
          if (b.spots.length === 0) problems.push(`${where}: a picture exercise has no right place marked.`);
        }
        if (b.type === "quiz") {
          if (b.questions.length === 0) problems.push(`${where}: a quiz has no questions.`);
          b.questions.forEach((q, qi) => {
            const qn = `${where}: quiz question ${qi + 1}`;
            if (!q.prompt.trim()) problems.push(`${qn} has no question text.`);
            if (q.options.length < 2) problems.push(`${qn} needs at least two answers.`);
            if (q.options.some((o) => !o.text.trim())) problems.push(`${qn} has an empty answer.`);
            if (q.correct.length === 0) problems.push(`${qn} has no right answer marked.`);
          });
        }
      }
    });
  });
  return problems;
}

/** A shuffled copy — never left in the original order when that can be avoided. */
export function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let tries = 0; tries < 5; tries++) {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.length < 2 || out.some((x, i) => x !== list[i])) break;
  }
  return out;
}

/** One block as a learner's browser may have it: answer keys gone, answers shuffled. */
export function blockForLearner(b: Block): Block {
  switch (b.type) {
    case "quiz":
      return { ...b, questions: b.questions.map(({ correct: _c, explanation: _e, ...q }) => ({ ...q, correct: [] as string[] })) };
    case "match":
      return {
        ...b,
        pairs: b.pairs.map((pr) => ({ id: pr.id, left: pr.left, right: "", rightId: "" })),
        choices: shuffled(b.pairs.map((pr) => ({ id: pr.rightId, text: pr.right }))),
      };
    case "order":
      return { ...b, items: shuffled(b.items) };
    case "sort":
      return { ...b, items: shuffled(b.items.map((i) => ({ ...i, bucketId: "" }))) };
    case "hotspot":
      return { ...b, spots: [] };
    default:
      return b;
  }
}

/** The content a learner's browser may have: no answer keys, no explanations. */
export function forLearner(content: CourseContent): CourseContent {
  return {
    sections: content.sections.map((s) => ({
      ...s,
      lessons: s.lessons.map((l) => ({ ...l, blocks: l.blocks.map(blockForLearner) })),
    })),
  };
}

export function allBlocks(content: CourseContent): Block[] {
  return content.sections.flatMap((s) => s.lessons.flatMap((l) => l.blocks));
}

export function findBlock(content: CourseContent, blockId: string): { block: Block; lessonId: string } | null {
  for (const s of content.sections) for (const l of s.lessons) for (const b of l.blocks) {
    if (b.id === blockId) return { block: b, lessonId: l.id };
  }
  return null;
}

export function findLesson(content: CourseContent, lessonId: string): Lesson | null {
  for (const s of content.sections) for (const l of s.lessons) if (l.id === lessonId) return l;
  return null;
}

/** Every academy_media id the course uses — a learner may open only these. */
export function mediaIdsIn(content: CourseContent): Set<string> {
  const ids = new Set<string>();
  for (const b of allBlocks(content)) {
    if ((b.type === "video" || b.type === "document" || b.type === "image" || b.type === "hotspot") && b.mediaId) ids.add(b.mediaId);
  }
  return ids;
}

// ── Marking ──────────────────────────────────────────────────────────────────
export type QuestionResult = { id: string; correct: boolean; rightAnswers: string[]; explanation?: string };
export type QuizResult = {
  score: number; right: number; total: number; passed: boolean; questions: QuestionResult[];
  /** The full answer for an exercise (pairs, order, groups, spots) — shown only once passed. */
  solution?: unknown;
};

/** Mark one quiz. `answers` maps question id → chosen option ids. All-or-nothing per question. */
export function gradeQuiz(block: QuizBlock, answers: Record<string, unknown>, passMark: number): QuizResult {
  const questions = block.questions.map((q) => {
    const given = Array.isArray(answers?.[q.id]) ? [...new Set((answers[q.id] as unknown[]).filter((a) => typeof a === "string"))] as string[] : [];
    const right = new Set(q.correct);
    const correct = given.length === right.size && given.every((g) => right.has(g));
    return { id: q.id, correct, rightAnswers: q.correct, explanation: q.explanation || undefined };
  });
  const right = questions.filter((q) => q.correct).length;
  const total = questions.length;
  const score = total ? Math.round((right / total) * 100) : 100;
  return { score, right, total, passed: score >= passMark, questions };
}

const result = (items: QuestionResult[], passMark: number, solution?: unknown): QuizResult => {
  const right = items.filter((i) => i.correct).length;
  const total = items.length;
  const score = total ? Math.round((right / total) * 100) : 100;
  return { score, right, total, passed: score >= passMark, questions: items, solution };
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** Is a tap at (x, y) — percentages of the picture's width — inside one of the spots? */
export function hitsSpot(spots: HotspotSpot[], x: number, y: number): boolean {
  return spots.some((s) => Math.hypot(x - s.x, y - s.y) <= s.r);
}

/**
 * Mark any graded block. Answers by type:
 *   quiz     { [questionId]: optionId[] }
 *   match    { [pairId]: rightId }
 *   order    itemId[] (top to bottom)
 *   sort     { [itemId]: bucketId }
 *   hotspot  { x, y }   (percentages of the picture's width)
 * Partial credit per item; the block is passed at the course pass mark.
 */
export function gradeBlock(block: GradedBlock, answers: unknown, passMark: number): QuizResult {
  switch (block.type) {
    case "quiz":
      return gradeQuiz(block, obj(answers), passMark);
    case "match": {
      const a = obj(answers);
      return result(block.pairs.map((pr) => ({ id: pr.id, correct: a[pr.id] === pr.rightId, rightAnswers: [pr.rightId] })), passMark,
        Object.fromEntries(block.pairs.map((pr) => [pr.id, pr.rightId])));
    }
    case "order": {
      const given = Array.isArray(answers) ? answers : [];
      return result(block.items.map((it, i) => ({ id: String(i), correct: given[i] === it.id, rightAnswers: [it.id] })), passMark,
        block.items.map((it) => it.id));
    }
    case "sort": {
      const a = obj(answers);
      return result(block.items.map((it) => ({ id: it.id, correct: a[it.id] === it.bucketId, rightAnswers: [it.bucketId] })), passMark,
        Object.fromEntries(block.items.map((it) => [it.id, it.bucketId])));
    }
    case "hotspot": {
      const a = obj(answers);
      const x = Number(a.x), y = Number(a.y);
      const hit = Number.isFinite(x) && Number.isFinite(y) && hitsSpot(block.spots, x, y);
      return result([{ id: "tap", correct: hit, rightAnswers: [] }], passMark, block.spots);
    }
  }
}

/** One question / item of a graded block, for the question analysis report. */
export function gradedItems(block: GradedBlock): { id: string; label: string }[] {
  switch (block.type) {
    case "quiz": return block.questions.map((q) => ({ id: q.id, label: q.prompt }));
    case "match": return block.pairs.map((pr) => ({ id: pr.id, label: `${pr.left} → ${pr.right}` }));
    case "order": return block.items.map((it, i) => ({ id: String(i), label: `Step ${i + 1}: ${it.text}` }));
    case "sort": return block.items.map((it) => ({ id: it.id, label: `${it.text} → ${block.buckets.find((b) => b.id === it.bucketId)?.text ?? "?"}` }));
    case "hotspot": return [{ id: "tap", label: block.prompt || "Tap the right place" }];
  }
}

// ── Completion ───────────────────────────────────────────────────────────────
/** Whether one block is finished, given its progress row. */
export function blockDone(block: Block, p: BlockProgress | undefined): boolean {
  if (!p) return false;
  switch (block.type) {
    case "video":
      if (block.mediaId && block.mustWatch) return (p.video_percent ?? 0) >= VIDEO_DONE_PERCENT || !!p.completed_at;
      return !!p.viewed_at || !!p.completed_at;
    case "quiz":
    case "match":
    case "order":
    case "sort":
    case "hotspot":
    case "acknowledge":
      return !!p.completed_at;
    default:
      return !!p.viewed_at || !!p.completed_at;
  }
}

/**
 * The course result. Complete when every block is done (a quiz or exercise is
 * done once it is passed — it can be retried until then). The score is the
 * average of the quiz and exercise scores, or null when the course has none.
 */
export function courseOutcome(content: CourseContent, progress: BlockProgress[]): {
  done: number; total: number; complete: boolean; score: number | null;
} {
  const byId = new Map(progress.map((p) => [p.block_id, p]));
  const blocks = allBlocks(content);
  const done = blocks.filter((b) => blockDone(b, byId.get(b.id))).length;
  const quizScores = blocks.filter(isGraded).map((b) => byId.get(b.id)?.score ?? 0);
  return {
    done, total: blocks.length,
    complete: blocks.length > 0 && done === blocks.length,
    score: quizScores.length ? Math.round(quizScores.reduce((a, s) => a + s, 0) / quizScores.length) : null,
  };
}

/** YouTube / Vimeo page link → embeddable player URL, or null for anything else. */
export function embedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v") ?? (u.pathname.startsWith("/embed/") ? u.pathname.slice(7) : null)
        ?? (u.pathname.startsWith("/shorts/") ? u.pathname.slice(8) : null);
      return v ? `https://www.youtube-nocookie.com/embed/${v}` : null;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
    if (host === "player.vimeo.com") return url;
    return null;
  } catch {
    return null;
  }
}
