/**
 * Crew Academy — draft quiz questions from a lesson, for the course writer to
 * review. Nothing is saved or published by this: the questions come back to the
 * course creator as a new quiz block in the draft, where the writer edits,
 * deletes or keeps them before publishing.
 *
 * One Claude call through the Anthropic SDK (same pattern as the receipt reader:
 * a strict tool, so the answer always has this shape). The source is the
 * lesson's reading text plus up to two of its PDFs.
 */
import Anthropic from "@anthropic-ai/sdk";
import { MEDIA_BUCKET } from "@/lib/academy/academy.server";
import { newId, newQuestion, type CourseContent, type Question, type QuestionKind } from "@/lib/academy/content";

const MODEL = "claude-opus-5-5";
const MAX_PDF_BYTES = 20 * 1024 * 1024;

const RECORD_QUESTIONS: Anthropic.Beta.BetaTool = {
  name: "record_questions",
  description: "Record the quiz questions. Call this exactly once.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "prompt", "options", "correct", "explanation"],
          properties: {
            kind: { type: "string", enum: ["single", "multi", "truefalse"], description: "single = one right answer; multi = two or more right answers; truefalse = a statement that is true or false." },
            prompt: { type: "string", description: "The question (or, for truefalse, the statement). Plain, short, practical." },
            options: { type: "array", items: { type: "string" }, description: "3 or 4 answers for single/multi. For truefalse, exactly [\"True\", \"False\"]." },
            correct: { type: "array", items: { type: "integer" }, description: "Zero-based indexes into options of the right answer(s)." },
            explanation: { type: "string", description: "One or two sentences, from the lesson, on why the answer is right." },
          },
        },
      },
    },
  },
};

function prompt(count: number, lessonTitle: string, text: string) {
  return `You are helping a yacht crew training writer. Write ${count} quiz questions that check whether a crew member understood the lesson "${lessonTitle}".

Rules:
- Only test what the lesson material actually says. No outside facts, no trick questions.
- Prefer practical, on-board situations ("What do you do first when…") over word definitions.
- Mix the kinds: mostly single answer, some true/false, at most one multi-answer.
- Wrong answers must be plausible to someone who skimmed, but clearly wrong to someone who read it.
- Plain English for crew whose first language may not be English. Keep each question under 30 words.

Call record_questions once with the questions.

Lesson text:
"""
${text || "(No reading text — use the attached document.)"}
"""`;
}

async function pdfBlocks(sb: any, content: CourseContent, lessonId: string): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  const lesson = content.sections.flatMap((s) => s.lessons).find((l) => l.id === lessonId);
  const ids = (lesson?.blocks ?? []).filter((b) => b.type === "document" && b.mediaId).map((b: any) => b.mediaId as string).slice(0, 2);
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const id of ids) {
    const { data: row } = await sb.from("academy_media").select("storage_path, size_bytes").eq("id", id).maybeSingle();
    if (!row || (row.size_bytes ?? 0) > MAX_PDF_BYTES) continue;
    const { data: file } = await sb.storage.from(MEDIA_BUCKET).download(row.storage_path);
    if (!file) continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let b64 = "";
    for (let i = 0; i < bytes.length; i += 0x8000) b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: btoa(b64) } });
  }
  return blocks;
}

/** Draft questions for one lesson of a course (draft content, already scope-checked by the caller). */
export async function draftQuizQuestions(sb: any, content: CourseContent, lessonId: string, count: number): Promise<Question[]> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("AI question drafting is not set up yet");
  const lesson = content.sections.flatMap((s) => s.lessons).find((l) => l.id === lessonId);
  if (!lesson) throw new Error("Lesson not found — save the course first");
  const text = lesson.blocks.filter((b) => b.type === "reading").map((b: any) => b.markdown as string).join("\n\n").slice(0, 60_000);
  const docs = await pdfBlocks(sb, content, lessonId);
  if (!text.trim() && !docs.length) throw new Error("Add some reading text or a PDF to this lesson first — questions are drafted from it.");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 2 });
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "medium" },
    // If a safety classifier declines, Anthropic re-runs it on its recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    tools: [RECORD_QUESTIONS],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [...docs, { type: "text", text: prompt(count, lesson.title || "this lesson", text) }] }],
  });
  if (response.stop_reason === "refusal") throw new Error("Questions couldn't be drafted for this lesson — please write them by hand.");
  const call = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "record_questions");
  if (!call) throw new Error("No questions came back — try again, or write them by hand.");

  // Turn the answer into the course creator's Question shape, defensively.
  const raw = ((call.input as any)?.questions ?? []) as any[];
  return raw.slice(0, count).flatMap((q): Question[] => {
    const kind: QuestionKind = q?.kind === "multi" || q?.kind === "truefalse" ? q.kind : "single";
    const base = newQuestion(kind);
    const texts: string[] = kind === "truefalse" ? ["True", "False"] : (Array.isArray(q?.options) ? q.options : []).map((o: unknown) => String(o ?? "").slice(0, 500)).slice(0, 6);
    if (texts.length < 2 || typeof q?.prompt !== "string" || !q.prompt.trim()) return [];
    const options = kind === "truefalse" ? base.options : texts.map((t) => ({ id: newId(), text: t }));
    const correct = [...new Set((Array.isArray(q?.correct) ? q.correct : []).filter((i: unknown) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < options.length))]
      .map((i) => options[i as number].id);
    if (!correct.length) return [];
    return [{ ...base, prompt: q.prompt.trim().slice(0, 2000), options, correct: kind === "multi" ? correct : correct.slice(0, 1), explanation: String(q?.explanation ?? "").slice(0, 2000) }];
  });
}
