/**
 * Crew Academy — the JLS course library (staff).
 *
 *   GET  /api/academy-admin?op=courses              → JLS courses
 *   GET  /api/academy-admin?op=course&id=           → one course: details, draft, versions, offers, files
 *   GET  /api/academy-admin?op=vessels              → vessels a course can be offered to
 *   GET  /api/academy-admin?op=media-url&id=        → { url }: a JLS course file, or one in a course shared with JLS
 *   GET  /api/academy-admin?op=shared               → what vessels and crew have shared with JLS for review
 *   GET  /api/academy-admin?op=shared-course&id=    → a vessel's course shared with JLS (read-only, for preview)
 *   GET  /api/academy-admin?op=certificate&enrolment= → the certificate of a crew member who shared their results
 *   POST { op: "create", title }                                    (Create)
 *   POST { op: "save", id, title, summary, category, minutes, passMark, refreshMonths, content }   (Create)
 *   POST { op: "upload-url", courseId, fileName, mimeType, size }   (Create) → signed upload for one file
 *   POST { op: "publish" | "archive" | "restore", id }              (Edit)
 *   POST { op: "offer", id, offerAll, yachtIds }                    (Edit)
 *
 * Permission: the "Crew Academy" module (View / Create / Edit); global admins
 * pass. A vessel's own courses, crew and results are private to the vessel —
 * staff see them only while the vessel (or the crew member) has shared them with
 * JLS (academy_jls_shares, live = not revoked).
 */
import { createClient } from "@supabase/supabase-js";
import { requireAccess } from "@/lib/auth/requireAccess.server";
import { PERMISSION_ORDER, type PermissionLevel } from "@/lib/auth/claims";
import { normalizeContent } from "@/lib/academy/content";
import { UUID_RE, certificatePdf, pdfResponse, signedMediaUrl } from "@/lib/academy/academy.server";
import {
  AuthoringError, authoringPost, courseForEditing, listCourses, mediaUrlFor, scopedCourse, type CourseScope,
} from "@/lib/academy/authoring.server";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function admin(): any {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

const JLS: CourseScope = { owner: "jls" };

/** Live shares, keyed for lookups. */
async function liveShares(sb: any) {
  const { data } = await sb.from("academy_jls_shares")
    .select("id, yacht_id, resource_type, resource_id, shared_by_kind, shared_by_name, note, created_at, yachts(vessel_name)")
    .is("revoked_at", null).order("created_at", { ascending: false });
  return (data ?? []) as any[];
}

export async function academyAdminHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "academy", level: "view" });
  if (!access.ok) return access.response;
  const { claims } = access;
  const level = claims.moduleLevels.academy as PermissionLevel | undefined;
  const can = (want: PermissionLevel) =>
    claims.isGlobalAdmin || (!!level && PERMISSION_ORDER.indexOf(level) >= PERMISSION_ORDER.indexOf(want));

  const sb = admin();
  const { data: me } = await sb.from("user_profiles").select("display_name").eq("user_id", claims.userId).maybeSingle();
  const actor = { userId: claims.userId, name: (me?.display_name ?? claims.email) as string };

  try {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const op = url.searchParams.get("op") ?? "courses";

      if (op === "courses") {
        const shares = await liveShares(sb);
        return json({ canCreate: can("create"), canEdit: can("edit"), courses: await listCourses(sb, JLS), sharedCount: shares.length });
      }
      if (op === "course") {
        return json({ canCreate: can("create"), canEdit: can("edit"), ...(await courseForEditing(sb, JLS, url.searchParams.get("id"))) });
      }
      if (op === "vessels") {
        const { data } = await sb.from("yachts").select("id, vessel_name").order("vessel_name");
        return json({ vessels: (data ?? []).filter((y: any) => y.vessel_name) });
      }

      if (op === "media-url") {
        const id = url.searchParams.get("id");
        try { return json(await mediaUrlFor(sb, JLS, id)); } catch { /* not a JLS file — maybe a shared vessel course's */ }
        if (!id || !UUID_RE.test(id)) return json({ error: "Choose a file" }, 400);
        const { data: row } = await sb.from("academy_media").select("storage_path, kind, file_name, mime_type, course_id").eq("id", id).maybeSingle();
        const shared = row?.course_id && (await liveShares(sb)).some((s) => s.resource_type === "course" && s.resource_id === row.course_id);
        if (!row || !shared) return json({ error: "File not found" }, 404);
        return json({ url: await signedMediaUrl(sb, row), name: row.file_name, mimeType: row.mime_type });
      }

      if (op === "shared") {
        const shares = await liveShares(sb);
        const courseIds = shares.filter((s) => s.resource_type === "course").map((s) => s.resource_id);
        const learnerIds = shares.filter((s) => s.resource_type === "learner").map((s) => s.resource_id);
        const [{ data: courses }, { data: learners }, { data: enrolments }] = await Promise.all([
          courseIds.length ? sb.from("academy_courses").select("id, title, summary, status, updated_at").in("id", courseIds) : { data: [] },
          learnerIds.length ? sb.from("academy_learners").select("id, email, display_name, active").in("id", learnerIds) : { data: [] },
          learnerIds.length ? sb.from("academy_enrolments")
            .select("id, learner_id, status, mandatory, due_date, completed_at, score, expires_at, academy_courses(title, owner_type), academy_certificates(number)")
            .in("learner_id", learnerIds).neq("status", "cancelled") : { data: [] },
        ]);
        const courseById = new Map((courses ?? []).map((c: any) => [c.id, c]));
        const learnerById = new Map((learners ?? []).map((l: any) => [l.id, l]));
        const base = (s: any) => ({
          shareId: s.id, vessel: s.yachts?.vessel_name ?? "", sharedBy: s.shared_by_name, sharedByKind: s.shared_by_kind,
          note: s.note, sharedAt: s.created_at,
        });
        return json({
          courses: shares.filter((s) => s.resource_type === "course" && courseById.has(s.resource_id)).map((s) => {
            const c: any = courseById.get(s.resource_id);
            return { ...base(s), courseId: c.id, title: c.title, summary: c.summary, status: c.status, updatedAt: c.updated_at };
          }),
          people: shares.filter((s) => s.resource_type === "learner" && learnerById.has(s.resource_id)).map((s) => {
            const l: any = learnerById.get(s.resource_id);
            return {
              ...base(s), learnerId: l.id, name: l.display_name || l.email, email: l.email, active: l.active,
              results: (enrolments ?? []).filter((e: any) => e.learner_id === l.id).map((e: any) => ({
                enrolmentId: e.id,
                certificate: (Array.isArray(e.academy_certificates) ? e.academy_certificates[0] : e.academy_certificates)?.number ?? null,
                course: e.academy_courses?.title ?? "Course", from: e.academy_courses?.owner_type === "jls" ? "JLS" : "Vessel",
                status: e.status, mandatory: e.mandatory, dueDate: e.due_date, completedAt: e.completed_at, score: e.score, expiresAt: e.expires_at,
              })),
            };
          }),
        });
      }

      if (op === "certificate") {
        const id = url.searchParams.get("enrolment") ?? "";
        if (!UUID_RE.test(id)) return json({ error: "Choose an enrolment" }, 400);
        const { data: e } = await sb.from("academy_enrolments").select("learner_id").eq("id", id).maybeSingle();
        const shared = e && (await liveShares(sb)).some((s) => s.resource_type === "learner" && s.resource_id === e.learner_id);
        const file = shared ? await certificatePdf(sb, id) : null;
        return file ? pdfResponse(file) : json({ error: "Not shared with JLS" }, 404);
      }

      if (op === "shared-course") {
        const id = url.searchParams.get("id");
        const share = (await liveShares(sb)).find((s) => s.resource_type === "course" && s.resource_id === id);
        if (!share) return json({ error: "That course isn't shared with JLS" }, 404);
        const course = await scopedCourse(sb, { owner: "vessel", yachtId: share.yacht_id }, id);
        return json({ title: course.title, passMark: course.pass_mark, vessel: share.yachts?.vessel_name ?? "", content: normalizeContent(course.draft_content) });
      }
      return json({ error: "Unknown request" }, 400);
    }

    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const body = await request.json().catch(() => null) as any;
    if (!body || typeof body !== "object") return json({ error: "Bad request" }, 400);

    if (body.op === "offer") {
      if (!can("edit")) return json({ error: "This needs Edit permission on Crew Academy." }, 403);
      const course = await scopedCourse(sb, JLS, body.id);
      const yachtIds: string[] = Array.isArray(body.yachtIds)
        ? [...new Set((body.yachtIds as unknown[]).filter((y): y is string => typeof y === "string" && UUID_RE.test(y)))]
        : [];
      await sb.from("academy_courses").update({ offer_all: !!body.offerAll }).eq("id", course.id);
      await sb.from("academy_course_offers").delete().eq("course_id", course.id);
      if (yachtIds.length) {
        const { error } = await sb.from("academy_course_offers").insert(
          yachtIds.map((yacht_id) => ({ course_id: course.id, yacht_id, offered_by: actor.userId, offered_by_name: actor.name })),
        );
        if (error) throw error;
      }
      return json({ ok: true });
    }

    if (!can("create")) return json({ error: "This needs Create permission on Crew Academy." }, 403);
    const result = await authoringPost(sb, JLS, actor, body, can("edit"));
    if (result) return json(result);
    return json({ error: "Unknown request" }, 400);
  } catch (e: any) {
    if (e instanceof AuthoringError) return json({ error: e.message, problems: e.problems, conflict: e.conflict || undefined }, e.conflict ? 409 : 400);
    console.error("[academy-admin]", e);
    return json({ error: e?.message ?? "Something went wrong" }, 500);
  }
}

