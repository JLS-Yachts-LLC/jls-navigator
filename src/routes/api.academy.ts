/**
 * Crew Academy — the learner's side (crew on a vessel taking their training).
 *
 *   GET  /api/academy?op=home                         → who they are, their vessel, their courses
 *   GET  /api/academy?op=course&enrolment=            → one course to take: content (no answer keys) + progress
 *   GET  /api/academy?op=media&enrolment=&media=      → { url }: a short-lived link to one file in that course
 *   GET  /api/academy?op=certificate&enrolment=       → the certificate PDF for a course they've completed
 *   POST /api/academy { op: "viewed",      enrolment, lessonId }        reading, pictures, PDFs and links in a lesson
 *   POST /api/academy { op: "video",       enrolment, blockId, percent, seconds }
 *   POST /api/academy { op: "answer",      enrolment, blockId, answers } → the quiz marked
 *   POST /api/academy { op: "acknowledge", enrolment, blockId }
 *   POST /api/academy { op: "share-results", share }   let JLS see my results (or stop)
 *
 * Every request: resolveLearner() (an ACTIVE learner login) → the enrolment must
 * be theirs, on their vessel → only then the service role reads data. Content
 * comes from the course VERSION pinned on the enrolment the first time it is
 * opened, so later edits to the course never change what they're doing.
 *
 * Answer keys never leave the server before an answer is submitted. A failed quiz
 * shows which questions were wrong but not the right answers (they can retry
 * until they pass); a passed quiz shows the right answers and explanations.
 */
import { json, resolveLearner, type LearnerCaller } from "@/lib/academy/academy-auth.server";
import {
  findBlock, findLesson, gradeBlock, isGraded, forLearner, mediaIdsIn, normalizeContent, type CourseContent,
} from "@/lib/academy/content";
import { UUID_RE, certificatePdf, logActivity, pdfResponse, refreshEnrolment, signedMediaUrl } from "@/lib/academy/academy.server";

type Ctx = { sb: any; learner: LearnerCaller };

const ACTIVE_STATUSES = ["not_started", "in_progress", "failed"];

class BadRequest extends Error {}

async function home(ctx: Ctx): Promise<Response> {
  const { sb, learner } = ctx;
  const { data: rows, error } = await sb.from("academy_enrolments")
    .select("id, status, mandatory, due_date, started_at, completed_at, score, expires_at, academy_courses(id, title, summary, category, estimated_minutes, owner_type), academy_certificates(number)")
    .eq("learner_id", learner.learnerId)
    .eq("yacht_id", learner.yachtId)
    .neq("status", "cancelled")
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) return json({ error: error.message }, 500);

  const courses = (rows ?? []).map((r: any) => ({
    enrolmentId: r.id,
    status: r.status,
    mandatory: r.mandatory,
    dueDate: r.due_date,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    score: r.score,
    expiresAt: r.expires_at,
    certificate: (Array.isArray(r.academy_certificates) ? r.academy_certificates[0] : r.academy_certificates)?.number ?? null,
    course: r.academy_courses && {
      id: r.academy_courses.id,
      title: r.academy_courses.title,
      summary: r.academy_courses.summary,
      category: r.academy_courses.category,
      minutes: r.academy_courses.estimated_minutes,
      from: r.academy_courses.owner_type === "jls" ? "JLS Yachts" : learner.vesselName,
    },
  }));

  await sb.from("academy_learners").update({ last_seen_at: new Date().toISOString() }).eq("id", learner.learnerId);
  const { data: share } = await sb.from("academy_jls_shares").select("id")
    .eq("resource_type", "learner").eq("resource_id", learner.learnerId).is("revoked_at", null).maybeSingle();

  return json({
    me: { displayName: learner.displayName, email: learner.email, sharedWithJls: !!share },
    vessel: { name: learner.vesselName, logo: learner.vesselLogo },
    todo: courses.filter((c: any) => ACTIVE_STATUSES.includes(c.status)),
    done: courses.filter((c: any) => c.status === "completed" || c.status === "expired"),
  });
}

/**
 * The learner's own enrolment with its pinned course version. Pins the current
 * published version (and marks it started) the first time it's opened.
 */
async function loadEnrolment(ctx: Ctx, enrolmentId: unknown, opts: { start?: boolean } = {}) {
  const { sb, learner } = ctx;
  if (typeof enrolmentId !== "string" || !UUID_RE.test(enrolmentId)) throw new BadRequest("Choose a course");
  const { data: enrolment } = await sb.from("academy_enrolments")
    .select("id, learner_id, course_id, yacht_id, version_id, status, score, started_at, completed_at, attempts")
    .eq("id", enrolmentId).eq("learner_id", learner.learnerId).eq("yacht_id", learner.yachtId).maybeSingle();
  if (!enrolment || enrolment.status === "cancelled") throw new BadRequest("That course isn't one of yours");

  const { data: course } = await sb.from("academy_courses")
    .select("id, title, summary, owner_type, pass_mark, refresh_months, current_version_id")
    .eq("id", enrolment.course_id).maybeSingle();
  if (!course) throw new BadRequest("That course is no longer available");

  if (!enrolment.version_id) {
    if (!course.current_version_id) throw new BadRequest("That course hasn't been published yet");
    const patch: Record<string, unknown> = { version_id: course.current_version_id };
    if (opts.start && enrolment.status === "not_started") {
      patch.status = "in_progress";
      patch.started_at = new Date().toISOString();
    }
    await sb.from("academy_enrolments").update(patch).eq("id", enrolment.id);
    Object.assign(enrolment, patch);
  } else if (opts.start && enrolment.status === "not_started") {
    const started_at = new Date().toISOString();
    await sb.from("academy_enrolments").update({ status: "in_progress", started_at }).eq("id", enrolment.id);
    Object.assign(enrolment, { status: "in_progress", started_at });
  }

  const { data: version } = await sb.from("academy_course_versions")
    .select("id, version, content").eq("id", enrolment.version_id).maybeSingle();
  if (!version) throw new BadRequest("That course version is missing");
  const content: CourseContent = normalizeContent(version.content);
  return { enrolment, course, content, version };
}

async function progressRows(sb: any, enrolmentId: string) {
  const { data } = await sb.from("academy_progress")
    .select("block_id, lesson_id, viewed_at, completed_at, video_percent, score").eq("enrolment_id", enrolmentId);
  return data ?? [];
}

async function upsertProgress(sb: any, enrolmentId: string, blockId: string, lessonId: string, patch: Record<string, unknown>) {
  const { error } = await sb.from("academy_progress").upsert(
    { enrolment_id: enrolmentId, block_id: blockId, lesson_id: lessonId, ...patch },
    { onConflict: "enrolment_id,block_id" },
  );
  if (error) throw new Error(error.message);
}

async function course(ctx: Ctx, enrolmentId: unknown): Promise<Response> {
  const { enrolment, course, content, version } = await loadEnrolment(ctx, enrolmentId, { start: true });
  // File sizes, so "Save for offline" can say how much it will download.
  const ids = [...mediaIdsIn(content)];
  const { data: files } = ids.length
    ? await ctx.sb.from("academy_media").select("id, size_bytes").in("id", ids)
    : { data: [] as any[] };
  return json({
    enrolment: { id: enrolment.id, status: enrolment.status, score: enrolment.score, completedAt: enrolment.completed_at },
    course: { title: course.title, summary: course.summary, passMark: course.pass_mark, version: version.version,
      from: course.owner_type === "jls" ? "JLS Yachts" : ctx.learner.vesselName },
    content: forLearner(content),
    progress: await progressRows(ctx.sb, enrolment.id),
    mediaSizes: Object.fromEntries((files ?? []).map((f: any) => [f.id, f.size_bytes ?? 0])),
  });
}

async function media(ctx: Ctx, enrolmentId: unknown, mediaId: unknown): Promise<Response> {
  const { content } = await loadEnrolment(ctx, enrolmentId);
  if (typeof mediaId !== "string" || !mediaIdsIn(content).has(mediaId)) throw new BadRequest("That file isn't part of this course");
  const { data: row } = await ctx.sb.from("academy_media").select("storage_path, kind, file_name, mime_type").eq("id", mediaId).maybeSingle();
  if (!row) return json({ error: "File not found" }, 404);
  const url = await signedMediaUrl(ctx.sb, row);
  if (!url) return json({ error: "Could not open the file" }, 500);
  return json({ url, name: row.file_name, mimeType: row.mime_type });
}

async function after(ctx: Ctx, loaded: Awaited<ReturnType<typeof loadEnrolment>>) {
  const outcome = await refreshEnrolment(ctx.sb, loaded.enrolment, loaded.content, loaded.course);
  return { outcome, progress: await progressRows(ctx.sb, loaded.enrolment.id) };
}

/**
 * The crew member's own choice to let JLS see their training results (or stop).
 * Their record is private to the vessel otherwise — decided 19 Oct 2026.
 */
async function shareResults(ctx: Ctx, share: boolean): Promise<Response> {
  const { sb, learner } = ctx;
  const { data: live } = await sb.from("academy_jls_shares").select("id")
    .eq("resource_type", "learner").eq("resource_id", learner.learnerId).is("revoked_at", null).maybeSingle();
  const who = learner.displayName ?? learner.email;
  if (share && !live) {
    await sb.from("academy_jls_shares").insert({
      yacht_id: learner.yachtId, resource_type: "learner", resource_id: learner.learnerId,
      shared_by_kind: "crew", shared_by: learner.userId, shared_by_name: who,
    });
  } else if (!share && live) {
    await sb.from("academy_jls_shares").update({ revoked_at: new Date().toISOString(), revoked_by_name: who }).eq("id", live.id);
  }
  if (share !== !!live) {
    await logActivity(sb, { yacht_id: learner.yachtId, learner_id: learner.learnerId, actor_user_id: learner.userId, actor_name: who,
      action: share ? "shared_with_jls" : "unshared_with_jls", detail: { type: "learner", byCrew: true } });
  }
  return json({ ok: true, sharedWithJls: share });
}

async function post(ctx: Ctx, body: any): Promise<Response> {
  if (body.op === "share-results") return shareResults(ctx, body.share === true);
  const loaded = await loadEnrolment(ctx, body?.enrolment, { start: true });
  const { sb } = ctx;
  const { enrolment, content, course } = loaded;
  const now = new Date().toISOString();

  if (body.op === "viewed") {
    const lesson = typeof body.lessonId === "string" ? findLesson(content, body.lessonId) : null;
    if (!lesson) throw new BadRequest("Unknown lesson");
    const existing = new Map<string, any>((await progressRows(sb, enrolment.id)).map((p: any) => [p.block_id, p]));
    // Reading, pictures, PDFs and linked (untracked) videos count once the lesson is open.
    for (const b of lesson.blocks) {
      const passive = b.type === "reading" || b.type === "image" || b.type === "document" || (b.type === "video" && !(b.mediaId && b.mustWatch));
      if (passive && !existing.get(b.id)?.viewed_at) await upsertProgress(sb, enrolment.id, b.id, lesson.id, { viewed_at: now });
    }
    return json(await after(ctx, loaded));
  }

  const found = typeof body.blockId === "string" ? findBlock(content, body.blockId) : null;
  if (!found) throw new BadRequest("Unknown part of the course");
  const { block, lessonId } = found;
  const { data: prev } = await sb.from("academy_progress").select("viewed_at, completed_at, video_percent, score")
    .eq("enrolment_id", enrolment.id).eq("block_id", block.id).maybeSingle();

  if (body.op === "video") {
    if (block.type !== "video") throw new BadRequest("That isn't a video");
    const percent = Math.max(0, Math.min(100, Math.round(Number(body.percent) || 0)));
    const seconds = Math.max(0, Number(body.seconds) || 0);
    await upsertProgress(sb, enrolment.id, block.id, lessonId, {
      viewed_at: prev?.viewed_at ?? now,
      video_percent: Math.max(prev?.video_percent ?? 0, percent),
      video_seconds: seconds,
    });
    return json(await after(ctx, loaded));
  }

  if (body.op === "acknowledge") {
    if (block.type !== "acknowledge") throw new BadRequest("That isn't a sign-off");
    if (!prev?.completed_at) {
      await upsertProgress(sb, enrolment.id, block.id, lessonId, { viewed_at: prev?.viewed_at ?? now, completed_at: now });
      await logActivity(sb, {
        yacht_id: enrolment.yacht_id, learner_id: enrolment.learner_id, course_id: enrolment.course_id,
        actor_user_id: ctx.learner.userId, actor_name: ctx.learner.displayName ?? ctx.learner.email,
        action: "acknowledged", detail: { blockId: block.id, statement: block.statement },
      });
    }
    return json(await after(ctx, loaded));
  }

  if (body.op === "answer") {
    if (!isGraded(block)) throw new BadRequest("That isn't a quiz or exercise");
    if (enrolment.status === "completed") throw new BadRequest("You've already completed this course");
    const result = gradeBlock(block, body.answers ?? {}, course.pass_mark);
    await sb.from("academy_attempts").insert({
      enrolment_id: enrolment.id, block_id: block.id, answers: body.answers ?? {},
      score: result.score, max_score: 100, passed: result.passed,
    });
    await sb.from("academy_enrolments").update({ attempts: (enrolment.attempts ?? 0) + 1 }).eq("id", enrolment.id);
    await upsertProgress(sb, enrolment.id, block.id, lessonId, {
      viewed_at: prev?.viewed_at ?? now,
      score: Math.max(prev?.score ?? 0, result.score),
      completed_at: prev?.completed_at ?? (result.passed ? now : null),
    });
    const rest = await after(ctx, loaded);
    return json({
      ...rest,
      result: {
        score: result.score, right: result.right, total: result.total, passed: result.passed, passMark: course.pass_mark,
        // Right answers, explanations and an exercise's full solution only once passed —
        // otherwise a retry would be a formality.
        questions: result.questions.map((q) => result.passed ? q : { id: q.id, correct: q.correct, rightAnswers: [] }),
        solution: result.passed ? result.solution : undefined,
      },
    });
  }

  throw new BadRequest("Unknown request");
}

export async function academyHandler(request: Request): Promise<Response> {
  const auth = await resolveLearner(request);
  if (!auth.ok) return auth.response;
  try {
    const ctx: Ctx = { sb: auth.sb, learner: auth.learner };
    const url = new URL(request.url);
    if (request.method === "GET") {
      const op = url.searchParams.get("op") ?? "home";
      if (op === "home") return await home(ctx);
      if (op === "course") return await course(ctx, url.searchParams.get("enrolment"));
      if (op === "media") return await media(ctx, url.searchParams.get("enrolment"), url.searchParams.get("media"));
      if (op === "certificate") {
        const id = url.searchParams.get("enrolment") ?? "";
        if (!UUID_RE.test(id)) return json({ error: "Choose a course" }, 400);
        const { data: own } = await ctx.sb.from("academy_enrolments").select("id")
          .eq("id", id).eq("learner_id", ctx.learner.learnerId).eq("yacht_id", ctx.learner.yachtId).maybeSingle();
        const file = own ? await certificatePdf(ctx.sb, id) : null;
        return file ? pdfResponse(file) : json({ error: "No certificate for that course" }, 404);
      }
      return json({ error: "Unknown request" }, 400);
    }
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Bad request" }, 400);
    return await post(ctx, body);
  } catch (e: any) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400);
    console.error("[academy]", e);
    return json({ error: e?.message ?? "Something went wrong" }, 500);
  }
}
