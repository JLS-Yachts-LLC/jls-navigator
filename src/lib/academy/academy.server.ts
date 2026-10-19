/**
 * Crew Academy — server helpers shared by the three routes:
 *   /api/academy        crew (learners)
 *   /api/portal/academy vessel managers in the Client Portal
 *   /api/academy-admin  JLS staff (the JLS course library)
 *
 * All of them run with the service role (academy tables have no permissive RLS),
 * so each caller's scope is enforced by the route before it calls these.
 */
import { sendAuthLinkViaSES, type AuthLinkResult } from "@/lib/admin/auth-email.server";
import { appBaseUrl } from "@/lib/app-url.server";
import { courseOutcome, type BlockProgress, type CourseContent } from "@/lib/academy/content";

export const MEDIA_BUCKET = "academy-media";
/**
 * Upload ceiling: 500 MB, matching the academy-media bucket and the Supabase
 * project's global Storage limit (raised from 50 MB on 19 Oct 2026). All three
 * must agree — the lowest wins.
 */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const MEDIA_TYPES: Record<string, "video" | "image" | "document"> = {
  "video/mp4": "video",
  "image/jpeg": "image", "image/png": "image", "image/webp": "image", "image/gif": "image",
  "application/pdf": "document",
};

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** A short-lived link to one course file. Videos get longer: every seek re-checks the token. */
export async function signedMediaUrl(sb: any, media: { storage_path: string; kind: string }): Promise<string | null> {
  const seconds = media.kind === "video" ? 4 * 3600 : 15 * 60;
  const { data } = await sb.storage.from(MEDIA_BUCKET).createSignedUrl(media.storage_path, seconds);
  return data?.signedUrl ?? null;
}

export async function logActivity(sb: any, row: {
  yacht_id?: string | null; learner_id?: string | null; course_id?: string | null;
  actor_user_id?: string | null; actor_name?: string | null; action: string; detail?: unknown;
}) {
  await sb.from("academy_activity").insert({ ...row, detail: row.detail ?? null });
}

/** A course a vessel may enrol crew on: published, and either the vessel's own or a JLS course offered to it. */
export async function courseForVessel(sb: any, courseId: string, yachtId: string): Promise<any | null> {
  if (!UUID_RE.test(courseId)) return null;
  const { data: course } = await sb.from("academy_courses")
    .select("id, owner_type, yacht_id, title, status, offer_all, current_version_id, pass_mark, refresh_months")
    .eq("id", courseId).maybeSingle();
  if (!course || course.status !== "published" || !course.current_version_id) return null;
  if (course.owner_type === "vessel") return course.yacht_id === yachtId ? course : null;
  if (course.offer_all) return course;
  const { data: offer } = await sb.from("academy_course_offers").select("course_id")
    .eq("course_id", courseId).eq("yacht_id", yachtId).maybeSingle();
  return offer ? course : null;
}

/** Every published course a vessel can use. */
export async function coursesForVessel(sb: any, yachtId: string): Promise<any[]> {
  const cols = "id, owner_type, title, summary, category, estimated_minutes, pass_mark, refresh_months, current_version_id";
  const [{ data: all }, { data: offered }, { data: own }] = await Promise.all([
    sb.from("academy_courses").select(cols).eq("owner_type", "jls").eq("status", "published").eq("offer_all", true),
    sb.from("academy_course_offers").select(`academy_courses!inner(${cols}, status)`)
      .eq("yacht_id", yachtId).eq("academy_courses.status", "published"),
    sb.from("academy_courses").select(cols).eq("owner_type", "vessel").eq("yacht_id", yachtId).eq("status", "published"),
  ]);
  const byId = new Map<string, any>();
  for (const c of [...(all ?? []), ...((offered ?? []).map((o: any) => o.academy_courses)), ...(own ?? [])]) {
    if (c?.current_version_id) byId.set(c.id, c);
  }
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * The invitation a crew member receives. A new login gets a set-your-password
 * link; someone who already has a login (e.g. they are also on the vessel's
 * portal) gets a sign-in link instead, so their password is left alone. Both
 * land on /academy. Crew are outside addresses, so CLIENT_EMAIL_ENABLED decides
 * delivery — when it's off the link comes back for the manager to pass on.
 */
export function sendLearnerInvite(sb: any, opts: {
  email: string; name: string | null; vesselName: string; invitedBy: string; existingLogin: boolean;
}): Promise<AuthLinkResult> {
  const hello = opts.name ? `Hello ${opts.name.split(" ")[0]}, you` : "You";
  return sendAuthLinkViaSES(sb, {
    email: opts.email,
    type: opts.existingLogin ? "magiclink" : "recovery",
    redirectTo: `${appBaseUrl()}/academy`,
    subject: `${opts.vesselName} — your Crew Academy training`,
    heading: `${hello} have been added to ${opts.vesselName}'s Crew Academy`,
    intro: `${opts.invitedBy} has signed you up to Crew Academy, where you'll find the training ${opts.vesselName} has given you — on your phone or any computer. ${opts.existingLogin ? "Use the button below to sign in." : "Choose a password to get started."} Your login only opens your own training.`,
    cta: opts.existingLogin ? "Open Crew Academy" : "Set my password",
  });
}

/**
 * Re-work an enrolment's result from its progress rows; mark it completed (with
 * score, date and refresher expiry) the first time every block is done.
 */
export async function refreshEnrolment(sb: any, enrolment: any, content: CourseContent, course: { refresh_months: number | null }) {
  const { data: rows } = await sb.from("academy_progress")
    .select("block_id, viewed_at, completed_at, video_percent, score").eq("enrolment_id", enrolment.id);
  const outcome = courseOutcome(content, (rows ?? []) as BlockProgress[]);
  if (outcome.complete && enrolment.status !== "completed") {
    const now = new Date();
    const expires = course.refresh_months ? new Date(now) : null;
    if (expires) expires.setMonth(expires.getMonth() + course.refresh_months!);
    await sb.from("academy_enrolments").update({
      status: "completed", score: outcome.score, completed_at: now.toISOString(), expires_at: expires?.toISOString() ?? null,
    }).eq("id", enrolment.id);
    await logActivity(sb, {
      yacht_id: enrolment.yacht_id, learner_id: enrolment.learner_id, course_id: enrolment.course_id,
      action: "completed", detail: { score: outcome.score },
    });
    return { ...outcome, status: "completed" as const };
  }
  return { ...outcome, status: enrolment.status as string };
}
