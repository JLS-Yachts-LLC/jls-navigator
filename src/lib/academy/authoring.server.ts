/**
 * Crew Academy — writing courses. One implementation for both owners:
 *
 *   { owner: "jls" }                      JLS's library   (/api/academy-admin)
 *   { owner: "vessel", yachtId }          a vessel's own  (/api/portal/academy)
 *
 * The caller has already checked who may do what; every function here keeps to
 * the scope it is given (a vessel can only ever touch its own courses and files).
 */
import { ContentError, emptyContent, normalizeContent, publishProblems } from "@/lib/academy/content";
import { MAX_UPLOAD_BYTES, MEDIA_BUCKET, MEDIA_TYPES, UUID_RE, signedMediaUrl } from "@/lib/academy/academy.server";
import { draftQuizQuestions } from "@/lib/academy/quiz-draft.server";

export type CourseScope = { owner: "jls" } | { owner: "vessel"; yachtId: string };
export type Actor = { userId: string; name: string };

export class AuthoringError extends Error {
  constructor(message: string, public problems?: string[]) { super(message); }
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
};
const int = (v: unknown, min: number, max: number): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) throw new AuthoringError(`Enter a number from ${min} to ${max}`);
  return n;
};

function scoped(q: any, scope: CourseScope) {
  return scope.owner === "jls" ? q.eq("owner_type", "jls") : q.eq("owner_type", "vessel").eq("yacht_id", scope.yachtId);
}

/** A course in this scope, or an error. */
export async function scopedCourse(sb: any, scope: CourseScope, id: unknown) {
  if (typeof id !== "string" || !UUID_RE.test(id)) throw new AuthoringError("Choose a course");
  const { data } = await scoped(sb.from("academy_courses").select("*").eq("id", id), scope).maybeSingle();
  if (!data) throw new AuthoringError("Course not found");
  return data;
}

export async function listCourses(sb: any, scope: CourseScope) {
  const { data, error } = await scoped(sb.from("academy_courses")
    .select("id, title, summary, category, status, offer_all, current_version_id, updated_at, academy_course_offers(yacht_id), academy_course_versions!academy_course_versions_course_id_fkey(version)"), scope)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c: any) => ({
    id: c.id, title: c.title, summary: c.summary, category: c.category, status: c.status,
    offerAll: c.offer_all, offeredTo: (c.academy_course_offers ?? []).length,
    versions: (c.academy_course_versions ?? []).length,
    published: !!c.current_version_id, updatedAt: c.updated_at,
  }));
}

/** Everything the course creator needs for one course. */
export async function courseForEditing(sb: any, scope: CourseScope, id: unknown) {
  const course = await scopedCourse(sb, scope, id);
  const [{ data: versions }, { data: offers }, { data: files }] = await Promise.all([
    sb.from("academy_course_versions").select("id, version, published_at, published_by_name")
      .eq("course_id", course.id).order("version", { ascending: false }),
    sb.from("academy_course_offers").select("yacht_id").eq("course_id", course.id),
    sb.from("academy_media").select("id, kind, file_name, mime_type, size_bytes, created_at")
      .eq("course_id", course.id).order("created_at", { ascending: false }),
  ]);
  return {
    course: {
      id: course.id, title: course.title, summary: course.summary, category: course.category,
      minutes: course.estimated_minutes, passMark: course.pass_mark, refreshMonths: course.refresh_months,
      status: course.status, offerAll: course.offer_all, currentVersionId: course.current_version_id,
      content: normalizeContent(course.draft_content), updatedAt: course.updated_at,
    },
    versions: versions ?? [],
    offeredTo: (offers ?? []).map((o: any) => o.yacht_id),
    files: files ?? [],
    maxUploadBytes: MAX_UPLOAD_BYTES,
  };
}

export async function createCourse(sb: any, scope: CourseScope, actor: Actor, rawTitle: unknown) {
  const title = text(rawTitle, 200);
  if (!title) throw new AuthoringError("Give the course a title");
  const { data, error } = await sb.from("academy_courses").insert({
    owner_type: scope.owner, yacht_id: scope.owner === "vessel" ? scope.yachtId : null,
    title, draft_content: emptyContent(), created_by: actor.userId, created_by_name: actor.name,
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function saveCourse(sb: any, scope: CourseScope, body: any) {
  const course = await scopedCourse(sb, scope, body.id);
  const title = text(body.title, 200);
  if (!title) throw new AuthoringError("Give the course a title");
  let content;
  try { content = normalizeContent(body.content); } catch (e) {
    if (e instanceof ContentError) throw new AuthoringError(e.message);
    throw e;
  }
  const { error } = await sb.from("academy_courses").update({
    title, summary: text(body.summary, 2000), category: text(body.category, 100),
    estimated_minutes: int(body.minutes, 1, 1000), pass_mark: int(body.passMark, 0, 100) ?? 80,
    refresh_months: int(body.refreshMonths, 1, 120), draft_content: content,
  }).eq("id", course.id);
  if (error) throw error;
  return content;
}

/** A signed upload for one course file, and its academy_media row. */
export async function uploadUrl(sb: any, scope: CourseScope, actor: Actor, body: any) {
  const course = await scopedCourse(sb, scope, body.courseId);
  const mimeType = String(body.mimeType ?? "");
  const kind = MEDIA_TYPES[mimeType];
  if (!kind) throw new AuthoringError("Use an MP4 video, a JPG / PNG / WebP / GIF picture or a PDF.");
  const size = Number(body.size) || 0;
  if (size <= 0) throw new AuthoringError("That file is empty");
  if (size > MAX_UPLOAD_BYTES) {
    throw new AuthoringError(`That file is ${(size / 1048576).toFixed(0)} MB — the limit is ${MAX_UPLOAD_BYTES / 1048576} MB. Export videos at 720p (H.264 MP4) to keep them small.`);
  }
  const fileName = (text(body.fileName, 200) ?? "file").replace(/[^\w.\- ]+/g, "_");
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase().slice(0, 8) : kind === "document" ? "pdf" : kind === "video" ? "mp4" : "jpg";
  const prefix = scope.owner === "jls" ? `jls/${course.id}` : `vessel/${scope.yachtId}/${course.id}`;
  const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
  const { data: signed, error: signErr } = await sb.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (signErr || !signed) throw signErr ?? new Error("Could not prepare the upload");
  const { data: media, error } = await sb.from("academy_media").insert({
    owner_type: scope.owner, yacht_id: scope.owner === "vessel" ? scope.yachtId : null, course_id: course.id,
    kind, storage_path: path, file_name: fileName, mime_type: mimeType, size_bytes: size,
    uploaded_by: actor.userId, uploaded_by_name: actor.name,
  }).select("id").single();
  if (error) throw error;
  return { mediaId: media.id, kind, path, token: signed.token, bucket: MEDIA_BUCKET };
}

/** Snapshot the draft as a new immutable version and make it the live one. */
export async function publishCourse(sb: any, scope: CourseScope, actor: Actor, id: unknown) {
  const course = await scopedCourse(sb, scope, id);
  const content = normalizeContent(course.draft_content);
  const problems = publishProblems(content);
  if (problems.length) throw new AuthoringError("The course isn't ready to publish yet.", problems);
  const { data: last } = await sb.from("academy_course_versions").select("version")
    .eq("course_id", course.id).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (last?.version ?? 0) + 1;
  const { data: v, error } = await sb.from("academy_course_versions").insert({
    course_id: course.id, version, content, published_by: actor.userId, published_by_name: actor.name,
  }).select("id").single();
  if (error) throw error;
  await sb.from("academy_courses").update({ status: "published", current_version_id: v.id }).eq("id", course.id);
  return version;
}

export async function setArchived(sb: any, scope: CourseScope, id: unknown, archived: boolean) {
  const course = await scopedCourse(sb, scope, id);
  const status = archived ? "archived" : course.current_version_id ? "published" : "draft";
  await sb.from("academy_courses").update({ status }).eq("id", course.id);
  return status;
}

/** A short-lived link to a file of a course in this scope (for the editor and preview). */
export async function mediaUrlFor(sb: any, scope: CourseScope, mediaId: unknown) {
  if (typeof mediaId !== "string" || !UUID_RE.test(mediaId)) throw new AuthoringError("Choose a file");
  let q = sb.from("academy_media").select("storage_path, kind, file_name, mime_type").eq("id", mediaId).eq("owner_type", scope.owner);
  if (scope.owner === "vessel") q = q.eq("yacht_id", scope.yachtId);
  const { data: row } = await q.maybeSingle();
  if (!row) throw new AuthoringError("File not found");
  return { url: await signedMediaUrl(sb, row), name: row.file_name, mimeType: row.mime_type };
}

/**
 * The editor's POST operations, shared by both routes. Returns null for an op
 * this doesn't handle. `canPublish` gates publish / archive / restore.
 */
export async function authoringPost(sb: any, scope: CourseScope, actor: Actor, body: any, canPublish: boolean): Promise<Record<string, unknown> | null> {
  const needPublish = () => { if (!canPublish) throw new AuthoringError("You can write courses but not publish them."); };
  switch (body.op) {
    case "create": return { id: await createCourse(sb, scope, actor, body.title) };
    case "save": return { ok: true, content: await saveCourse(sb, scope, body) };
    case "upload-url": return await uploadUrl(sb, scope, actor, body);
    case "publish": needPublish(); return { ok: true, version: await publishCourse(sb, scope, actor, body.id) };
    case "archive": needPublish(); return { ok: true, status: await setArchived(sb, scope, body.id, true) };
    case "restore": needPublish(); return { ok: true, status: await setArchived(sb, scope, body.id, false) };
    case "draft-quiz": {
      // AI-drafted questions from the SAVED lesson, returned for review — nothing is stored here.
      const course = await scopedCourse(sb, scope, body.id);
      const count = Math.min(10, Math.max(3, Math.round(Number(body.count) || 5)));
      try {
        return { questions: await draftQuizQuestions(sb, normalizeContent(course.draft_content), String(body.lessonId ?? ""), count) };
      } catch (e: any) {
        throw new AuthoringError(e?.message ?? "Questions couldn't be drafted");
      }
    }
    default: return null;
  }
}
