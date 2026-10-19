/**
 * Crew Academy — the JLS course library (staff).
 *
 *   GET  /api/academy-admin?op=courses              → JLS courses
 *   GET  /api/academy-admin?op=course&id=           → one course: details, draft, versions, offers, files
 *   GET  /api/academy-admin?op=vessels              → vessels a course can be offered to
 *   GET  /api/academy-admin?op=media-url&id=        → { url }: a short-lived link to one JLS course file
 *   POST { op: "create", title }                                    (Create)
 *   POST { op: "save", id, title, summary, category, minutes, passMark, refreshMonths, content }   (Create)
 *   POST { op: "upload-url", courseId, fileName, mimeType, size }   (Create) → signed upload for one file
 *   POST { op: "publish", id }                                      (Edit) → snapshot the draft as a new version
 *   POST { op: "archive" | "restore", id }                          (Edit)
 *   POST { op: "offer", id, offerAll, yachtIds }                    (Edit)
 *
 * Permission: the "Crew Academy" module (View / Create / Edit); global admins
 * pass. Only JLS courses are reachable here — a vessel's own courses, crew and
 * results are private to the vessel unless it shares them (academy_jls_shares,
 * later phase), so nothing in this route lists learners or results.
 */
import { createClient } from "@supabase/supabase-js";
import { requireAccess } from "@/lib/auth/requireAccess.server";
import { PERMISSION_ORDER, type PermissionLevel } from "@/lib/auth/claims";
import { normalizeContent, publishProblems, emptyContent, ContentError } from "@/lib/academy/content";
import { MAX_UPLOAD_BYTES, MEDIA_BUCKET, MEDIA_TYPES, UUID_RE, signedMediaUrl } from "@/lib/academy/academy.server";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function admin(): any {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

class BadRequest extends Error {}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
};
const int = (v: unknown, min: number, max: number): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) throw new BadRequest(`Enter a number from ${min} to ${max}`);
  return n;
};

async function jlsCourse(sb: any, id: unknown) {
  if (typeof id !== "string" || !UUID_RE.test(id)) throw new BadRequest("Choose a course");
  const { data } = await sb.from("academy_courses").select("*").eq("id", id).eq("owner_type", "jls").maybeSingle();
  if (!data) throw new BadRequest("Course not found");
  return data;
}

export async function academyAdminHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "academy", level: "view" });
  if (!access.ok) return access.response;
  const { claims } = access;
  const level = claims.moduleLevels.academy as PermissionLevel | undefined;
  const can = (want: PermissionLevel) =>
    claims.isGlobalAdmin || (!!level && PERMISSION_ORDER.indexOf(level) >= PERMISSION_ORDER.indexOf(want));
  const need = (want: PermissionLevel) => {
    if (!can(want)) throw Object.assign(new Error(`This needs ${want} permission on Crew Academy.`), { status: 403 });
  };

  const sb = admin();
  const { data: me } = await sb.from("user_profiles").select("display_name").eq("user_id", claims.userId).maybeSingle();
  const actorName: string = me?.display_name ?? claims.email;

  try {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const op = url.searchParams.get("op") ?? "courses";

      if (op === "courses") {
        const { data, error } = await sb.from("academy_courses")
          .select("id, title, summary, category, status, offer_all, current_version_id, updated_at, academy_course_offers(yacht_id), academy_course_versions!academy_course_versions_course_id_fkey(version)")
          .eq("owner_type", "jls").order("updated_at", { ascending: false });
        if (error) throw error;
        return json({
          canCreate: can("create"), canEdit: can("edit"),
          courses: (data ?? []).map((c: any) => ({
            id: c.id, title: c.title, summary: c.summary, category: c.category, status: c.status,
            offerAll: c.offer_all, offeredTo: (c.academy_course_offers ?? []).length,
            versions: (c.academy_course_versions ?? []).length,
            published: !!c.current_version_id, updatedAt: c.updated_at,
          })),
        });
      }

      if (op === "course") {
        const course = await jlsCourse(sb, url.searchParams.get("id"));
        const [{ data: versions }, { data: offers }, { data: files }] = await Promise.all([
          sb.from("academy_course_versions").select("id, version, published_at, published_by_name")
            .eq("course_id", course.id).order("version", { ascending: false }),
          sb.from("academy_course_offers").select("yacht_id").eq("course_id", course.id),
          sb.from("academy_media").select("id, kind, file_name, mime_type, size_bytes, created_at")
            .eq("course_id", course.id).eq("owner_type", "jls").order("created_at", { ascending: false }),
        ]);
        return json({
          canCreate: can("create"), canEdit: can("edit"),
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
        });
      }

      if (op === "vessels") {
        const { data } = await sb.from("yachts").select("id, vessel_name").order("vessel_name");
        return json({ vessels: (data ?? []).filter((y: any) => y.vessel_name) });
      }

      if (op === "media-url") {
        const id = url.searchParams.get("id");
        if (!id || !UUID_RE.test(id)) throw new BadRequest("Choose a file");
        const { data: row } = await sb.from("academy_media").select("storage_path, kind, file_name, mime_type")
          .eq("id", id).eq("owner_type", "jls").maybeSingle();
        if (!row) return json({ error: "File not found" }, 404);
        return json({ url: await signedMediaUrl(sb, row), name: row.file_name, mimeType: row.mime_type });
      }
      return json({ error: "Unknown request" }, 400);
    }

    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const body = await request.json().catch(() => null) as any;
    if (!body || typeof body !== "object") return json({ error: "Bad request" }, 400);

    if (body.op === "create") {
      need("create");
      const title = text(body.title, 200);
      if (!title) throw new BadRequest("Give the course a title");
      const { data, error } = await sb.from("academy_courses").insert({
        owner_type: "jls", yacht_id: null, title, draft_content: emptyContent(),
        created_by: claims.userId, created_by_name: actorName,
      }).select("id").single();
      if (error) throw error;
      return json({ id: data.id });
    }

    if (body.op === "save") {
      need("create");
      const course = await jlsCourse(sb, body.id);
      const title = text(body.title, 200);
      if (!title) throw new BadRequest("Give the course a title");
      const content = normalizeContent(body.content);
      const { error } = await sb.from("academy_courses").update({
        title, summary: text(body.summary, 2000), category: text(body.category, 100),
        estimated_minutes: int(body.minutes, 1, 1000), pass_mark: int(body.passMark, 0, 100) ?? 80,
        refresh_months: int(body.refreshMonths, 1, 120), draft_content: content,
      }).eq("id", course.id);
      if (error) throw error;
      return json({ ok: true, content });
    }

    if (body.op === "upload-url") {
      need("create");
      const course = await jlsCourse(sb, body.courseId);
      const mimeType = String(body.mimeType ?? "");
      const kind = MEDIA_TYPES[mimeType];
      if (!kind) throw new BadRequest("Use an MP4 video, a JPG / PNG / WebP / GIF picture or a PDF.");
      const size = Number(body.size) || 0;
      if (size <= 0) throw new BadRequest("That file is empty");
      if (size > MAX_UPLOAD_BYTES) {
        throw new BadRequest(`That file is ${(size / 1048576).toFixed(0)} MB — the limit is ${MAX_UPLOAD_BYTES / 1048576} MB. Export videos at 720p (H.264 MP4) to keep them small.`);
      }
      const fileName = (text(body.fileName, 200) ?? "file").replace(/[^\w.\- ]+/g, "_");
      const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase().slice(0, 8) : kind === "document" ? "pdf" : kind === "video" ? "mp4" : "jpg";
      const path = `jls/${course.id}/${crypto.randomUUID()}.${ext}`;
      const { data: signed, error: signErr } = await sb.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
      if (signErr || !signed) throw signErr ?? new Error("Could not prepare the upload");
      const { data: media, error } = await sb.from("academy_media").insert({
        owner_type: "jls", yacht_id: null, course_id: course.id, kind, storage_path: path,
        file_name: fileName, mime_type: mimeType, size_bytes: size,
        uploaded_by: claims.userId, uploaded_by_name: actorName,
      }).select("id").single();
      if (error) throw error;
      return json({ mediaId: media.id, kind, path, token: signed.token, bucket: MEDIA_BUCKET });
    }

    if (body.op === "publish") {
      need("edit");
      const course = await jlsCourse(sb, body.id);
      const content = normalizeContent(course.draft_content);
      const problems = publishProblems(content);
      if (problems.length) return json({ error: "The course isn't ready to publish yet.", problems }, 400);
      const { data: last } = await sb.from("academy_course_versions").select("version")
        .eq("course_id", course.id).order("version", { ascending: false }).limit(1).maybeSingle();
      const version = (last?.version ?? 0) + 1;
      const { data: v, error } = await sb.from("academy_course_versions").insert({
        course_id: course.id, version, content, published_by: claims.userId, published_by_name: actorName,
      }).select("id").single();
      if (error) throw error;
      await sb.from("academy_courses").update({ status: "published", current_version_id: v.id }).eq("id", course.id);
      return json({ ok: true, version });
    }

    if (body.op === "archive" || body.op === "restore") {
      need("edit");
      const course = await jlsCourse(sb, body.id);
      const status = body.op === "archive" ? "archived" : course.current_version_id ? "published" : "draft";
      await sb.from("academy_courses").update({ status }).eq("id", course.id);
      return json({ ok: true, status });
    }

    if (body.op === "offer") {
      need("edit");
      const course = await jlsCourse(sb, body.id);
      const yachtIds: string[] = Array.isArray(body.yachtIds)
        ? [...new Set((body.yachtIds as unknown[]).filter((y): y is string => typeof y === "string" && UUID_RE.test(y)))]
        : [];
      await sb.from("academy_courses").update({ offer_all: !!body.offerAll }).eq("id", course.id);
      await sb.from("academy_course_offers").delete().eq("course_id", course.id);
      if (yachtIds.length) {
        const { error } = await sb.from("academy_course_offers").insert(
          yachtIds.map((yacht_id) => ({ course_id: course.id, yacht_id, offered_by: claims.userId, offered_by_name: actorName })),
        );
        if (error) throw error;
      }
      return json({ ok: true });
    }

    return json({ error: "Unknown request" }, 400);
  } catch (e: any) {
    if (e instanceof BadRequest || e instanceof ContentError) return json({ error: e.message }, 400);
    if (e?.status === 403) return json({ error: e.message }, 403);
    console.error("[academy-admin]", e);
    return json({ error: e?.message ?? "Something went wrong" }, 500);
  }
}
