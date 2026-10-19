/**
 * Crew Academy — the learner's side (crew on a vessel taking their training).
 *
 *   GET /api/academy?op=home  → who they are, their vessel, and their courses
 *
 * Every request: resolveLearner() (an ACTIVE learner login) → only then the
 * service role reads data, and only the learner's own enrolments on their own
 * vessel. A learner never reads a table directly — RLS fences them out.
 *
 * The course player (lessons, progress, quizzes) arrives in Phase 2; answer keys
 * stay on the server and are never sent before an answer is submitted.
 */
import { json, resolveLearner, type LearnerCaller } from "@/lib/academy/academy-auth.server";

type Ctx = { sb: any; learner: LearnerCaller };

const ACTIVE_STATUSES = ["not_started", "in_progress", "failed"];

async function home(ctx: Ctx): Promise<Response> {
  const { sb, learner } = ctx;
  const { data: rows, error } = await sb.from("academy_enrolments")
    .select("id, status, mandatory, due_date, started_at, completed_at, score, expires_at, academy_courses(id, title, summary, category, estimated_minutes, owner_type)")
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

  return json({
    me: { displayName: learner.displayName, email: learner.email },
    vessel: { name: learner.vesselName, logo: learner.vesselLogo },
    todo: courses.filter((c: any) => ACTIVE_STATUSES.includes(c.status)),
    done: courses.filter((c: any) => c.status === "completed" || c.status === "expired"),
  });
}

export async function academyHandler(request: Request): Promise<Response> {
  const auth = await resolveLearner(request);
  if (!auth.ok) return auth.response;
  try {
    const ctx: Ctx = { sb: auth.sb, learner: auth.learner };
    const url = new URL(request.url);
    if (request.method === "GET") {
      const op = url.searchParams.get("op") ?? "home";
      if (op === "home") return home(ctx);
      return json({ error: "Unknown request" }, 400);
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (e: any) {
    return json({ error: e?.message ?? "Something went wrong" }, 500);
  }
}
