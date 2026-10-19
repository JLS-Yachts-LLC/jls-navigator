// Block builders for the AV/IT courses, in the Crew Academy content shape
// (src/lib/academy/content.ts) — the same helpers as the cyber course, plus a
// reading() that keeps indentation inside ``` code fences (Cisco config is indented).
// Files are referenced by name ("@c02-front-panel.png") and swapped for academy_media
// ids by makeBuild(content)(mediaIds) once uploaded.
import { randomUUID } from "node:crypto";

export const id = () => randomUUID().replace(/-/g, "").slice(0, 12);

/** Remove the common leading indent of a template literal (code fences keep their own indent). */
function dedent(s) {
  const lines = s.replace(/^\n/, "").replace(/\s+$/, "").split("\n");
  const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(ind)).join("\n");
}

export const reading = (markdown) => ({ id: id(), type: "reading", markdown: dedent(markdown) });
export const image = (file, caption) => ({ id: id(), type: "image", mediaId: `@${file}`, caption });
export const video = (file, title) => ({ id: id(), type: "video", mediaId: `@${file}`, url: null, title, mustWatch: true });
export const ack = (statement) => ({ id: id(), type: "acknowledge", statement });

/**
 * quiz(title, [[kind, prompt, options, explanation], …]). Options starting with "*" are right.
 * For truefalse, `options` is the boolean answer.
 */
export function quiz(title, questions) {
  return {
    id: id(), type: "quiz", title,
    questions: questions.map(([kind, prompt, opts, explanation]) => {
      if (kind === "truefalse") {
        return { id: id(), kind, prompt, options: [{ id: "true", text: "True" }, { id: "false", text: "False" }], correct: [opts ? "true" : "false"], explanation };
      }
      const options = opts.map((o) => ({ id: id(), text: o.replace(/^\*/, ""), right: o.startsWith("*") }));
      return { id: id(), kind, prompt, options: options.map(({ id, text }) => ({ id, text })), correct: options.filter((o) => o.right).map((o) => o.id), explanation };
    }),
  };
}
export const hotspot = (title, prompt, file, spots) => ({ id: id(), type: "hotspot", title, prompt, mediaId: `@${file}`, spots: spots.map((s) => ({ id: id(), ...s })) });
export const match = (title, prompt, pairs) => ({ id: id(), type: "match", title, prompt, pairs: pairs.map(([left, right]) => ({ id: id(), left, right, rightId: id() })) });
export const order = (title, prompt, steps) => ({ id: id(), type: "order", title, prompt, items: steps.map((text) => ({ id: id(), text })) });
export function sort(title, prompt, buckets, items) {
  const b = buckets.map((text) => ({ id: id(), text }));
  return { id: id(), type: "sort", title, prompt, buckets: b, items: items.map(([text, i]) => ({ id: id(), text, bucketId: b[i].id })) };
}
export const lesson = (title, blocks) => ({ id: id(), title, blocks });
export const section = (title, lessons) => ({ id: id(), title, lessons });

/** buildCourse(mediaIds): swap "@file" references for academy_media ids. Throws if a file is missing. */
export const makeBuild = (content) => (mediaIds) => {
  const c = content();
  for (const s of c.sections) for (const l of s.lessons) for (const b of l.blocks) {
    if (typeof b.mediaId === "string" && b.mediaId.startsWith("@")) {
      const idFor = mediaIds[b.mediaId.slice(1)];
      if (!idFor) throw new Error(`No uploaded file for ${b.mediaId}`);
      b.mediaId = idFor;
    }
  }
  return c;
};

/** Hotspot spots: picture pixels → percentages of the picture's WIDTH (as the player expects). */
export const spotsFor = (W) => (cx, cy, r) => ({ x: +(cx / W * 100).toFixed(2), y: +(cy / W * 100).toFixed(2), r: +(r / W * 100).toFixed(2) });
