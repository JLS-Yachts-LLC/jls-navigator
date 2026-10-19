/**
 * Client Portal — Crew Academy, the vessel managers' side.
 *
 *   GET  /api/portal/academy                        → crew signed up, courses available, who's enrolled on what,
 *                                                     and the vessel's crew list to invite from
 *   POST { op: "invite", crewMemberId?, email, name }   → give a crew member a Crew Academy login
 *   POST { op: "resend", learnerId }                    → send the invitation again
 *   POST { op: "remove" | "restore", learnerId }        → take someone off (records stay) / put them back
 *   POST { op: "enrol", courseId, learnerIds, dueDate?, mandatory }
 *   POST { op: "cancel", enrolmentId }                  → take a course off someone (not once completed)
 *
 * Needs the vessel's Crew Academy module, a position that sees it, and — for any
 * change — canManageAcademy() and not an admin preview. Everything is scoped to
 * the caller's vessel: learners, enrolments and crew must all be on it, and a
 * course must be one the vessel can use (courseForVessel).
 *
 * Records stay with the vessel (decided 19 Oct 2026): a learner row is one
 * person on one vessel. Inviting someone who is active on another vessel moves
 * their login here; the other vessel keeps their history and is told only that
 * they moved on, never where.
 */
import { createClient } from "@supabase/supabase-js";
import { resolvePortalYacht, portalModulesFor, type PortalYacht } from "@/lib/portal/portal-auth.server";
import { canManageAcademy, hiddenSections } from "@/lib/portal/portal-positions";
import { sectionEnabled } from "@/lib/portal/portal-modules";
import {
  EMAIL_RE, UUID_RE, courseForVessel, coursesForVessel, logActivity, sendLearnerInvite,
} from "@/lib/academy/academy.server";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function admin(): any {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

class BadRequest extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const crewName = (c: any) => c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || null;

async function callerName(sb: any, yacht: PortalYacht): Promise<string> {
  const { data } = await sb.from("captain_accounts").select("display_name")
    .eq("user_id", yacht.userId).eq("yacht_id", yacht.yachtId).eq("active", true).maybeSingle();
  return data?.display_name || yacht.email || "Your captain";
}

async function findUserByEmail(sb: any, email: string): Promise<any | null> {
  for (let page = 1; page <= 20; page++) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    const users = data?.users ?? [];
    const hit = users.find((u: any) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit;
    if (users.length < 1000) return null;
  }
  return null;
}

/** Staff identity rows the auth.users triggers could have made — a learner must have none. */
async function stripStaffIdentity(sb: any, userId: string) {
  await Promise.all([
    sb.from("user_profiles").delete().eq("user_id", userId),
    sb.from("user_roles").delete().eq("user_id", userId),
    sb.from("profiles").delete().eq("id", userId),
  ]);
}

async function ownLearner(sb: any, yacht: PortalYacht, id: unknown) {
  if (typeof id !== "string" || !UUID_RE.test(id)) throw new BadRequest("Choose a crew member");
  const { data } = await sb.from("academy_learners").select("*").eq("id", id).eq("yacht_id", yacht.yachtId).maybeSingle();
  if (!data) throw new BadRequest("That person isn't in this vessel's Crew Academy");
  return data;
}

async function overview(sb: any, yacht: PortalYacht, canManage: boolean) {
  const [{ data: learners }, courses, { data: enrolments }, { data: crew }] = await Promise.all([
    sb.from("academy_learners")
      .select("id, email, display_name, crew_member_id, active, user_id, invite_sent_at, invite_error, last_seen_at, left_at, created_at")
      .eq("yacht_id", yacht.yachtId).order("display_name"),
    coursesForVessel(sb, yacht.yachtId),
    sb.from("academy_enrolments")
      .select("id, learner_id, course_id, status, mandatory, due_date, started_at, completed_at, score, expires_at, created_at")
      .eq("yacht_id", yacht.yachtId).neq("status", "cancelled"),
    sb.from("crew_members").select("id, full_name, first_name, last_name, rank, email, status")
      .eq("yacht_id", yacht.yachtId).neq("status", "off_signed"),
  ]);
  return {
    canManage,
    vessel: yacht.vesselName,
    learners: (learners ?? []).map((l: any) => ({
      id: l.id, email: l.email, name: l.display_name, crewMemberId: l.crew_member_id, active: l.active,
      hasSignedIn: !!l.last_seen_at, lastSeenAt: l.last_seen_at, inviteSentAt: l.invite_sent_at,
      inviteError: l.invite_error, leftAt: l.left_at,
    })),
    courses: courses.map((c: any) => ({
      id: c.id, title: c.title, summary: c.summary, category: c.category, minutes: c.estimated_minutes,
      passMark: c.pass_mark, refreshMonths: c.refresh_months, from: c.owner_type === "jls" ? "JLS Yachts" : yacht.vesselName,
    })),
    enrolments: (enrolments ?? []).map((e: any) => ({
      id: e.id, learnerId: e.learner_id, courseId: e.course_id, status: e.status, mandatory: e.mandatory,
      dueDate: e.due_date, startedAt: e.started_at, completedAt: e.completed_at, score: e.score, expiresAt: e.expires_at,
    })),
    crew: (crew ?? []).map((c: any) => ({ id: c.id, name: crewName(c), rank: c.rank, email: c.email || null })),
  };
}

export async function portalAcademyHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request);
  if (!auth.ok) return auth.response;
  const yacht = auth.yacht;
  const modules = await portalModulesFor(yacht.yachtId);
  if (!sectionEnabled("academy", modules)) return json({ error: "Crew Academy isn't switched on for your vessel." }, 403);
  if (hiddenSections(yacht.position).has("academy")) return json({ error: "Your position doesn't include Crew Academy." }, 403);
  if (!yacht.mfaVerified) return json({ error: "Verify your sign-in code first." }, 403);

  const sb = admin();
  const canManage = canManageAcademy(yacht.position) && !yacht.preview;

  try {
    if (request.method === "GET") return json(await overview(sb, yacht, canManage));
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (yacht.preview) return json({ error: "Read-only preview — sign in as the client to make changes." }, 403);
    if (!canManageAcademy(yacht.position)) return json({ error: "Your position can see Crew Academy but not change it." }, 403);

    const body = await request.json().catch(() => null) as any;
    if (!body || typeof body !== "object") return json({ error: "Bad request" }, 400);
    const actor = await callerName(sb, yacht);
    const activity = (row: { learner_id?: string; course_id?: string; action: string; detail?: unknown }) =>
      logActivity(sb, { yacht_id: yacht.yachtId, actor_user_id: yacht.userId, actor_name: actor, ...row });

    if (body.op === "invite") {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!EMAIL_RE.test(email) || email.length > 254) throw new BadRequest("Enter a valid email address");
      let name = typeof body.name === "string" ? body.name.trim().slice(0, 120) || null : null;
      let crewMemberId: string | null = null;
      if (body.crewMemberId) {
        if (typeof body.crewMemberId !== "string" || !UUID_RE.test(body.crewMemberId)) throw new BadRequest("Choose a crew member");
        const { data: c } = await sb.from("crew_members").select("id, full_name, first_name, last_name")
          .eq("id", body.crewMemberId).eq("yacht_id", yacht.yachtId).maybeSingle();
        if (!c) throw new BadRequest("That crew member is not on this vessel");
        crewMemberId = c.id;
        name = name ?? crewName(c);
      }

      // The login: reuse one that exists (unless it's JLS staff), otherwise create it.
      const existing = await findUserByEmail(sb, email);
      let userId: string;
      let existingLogin = false;
      if (existing) {
        const { data: profile } = await sb.from("user_profiles").select("user_id").eq("user_id", existing.id).maybeSingle();
        if (profile) throw new BadRequest(`${email} belongs to a JLS Yachts staff login, so it can't be used for Crew Academy. Use a personal email address.`);
        userId = existing.id;
        existingLogin = !!existing.last_sign_in_at;
        await sb.auth.admin.updateUserById(userId, {
          ban_duration: "none",
          user_metadata: { ...(existing.user_metadata ?? {}), portal: existing.user_metadata?.portal ?? "learner", display_name: existing.user_metadata?.display_name ?? name },
        });
      } else {
        const { data: created, error } = await sb.auth.admin.createUser({
          email, email_confirm: true, user_metadata: { portal: "learner", display_name: name },
        });
        if (error || !created?.user) throw new Error(error?.message ?? "Could not create the login");
        userId = created.user.id;
      }
      await stripStaffIdentity(sb, userId);

      // Active on another vessel? Records stay there; the login moves here.
      const { data: elsewhere } = await sb.from("academy_learners").select("id, yacht_id")
        .eq("user_id", userId).eq("active", true).neq("yacht_id", yacht.yachtId);
      for (const other of elsewhere ?? []) {
        await sb.from("academy_learners").update({ active: false, left_at: new Date().toISOString() }).eq("id", other.id);
        await logActivity(sb, { yacht_id: other.yacht_id, learner_id: other.id, action: "moved_to_another_vessel" });
      }

      const { data: prior } = await sb.from("academy_learners").select("id")
        .eq("yacht_id", yacht.yachtId).ilike("email", email).maybeSingle();
      const row = {
        user_id: userId, yacht_id: yacht.yachtId, email, display_name: name, active: true, left_at: null,
        invited_by: yacht.userId, invited_by_name: actor,
        ...(crewMemberId ? { crew_member_id: crewMemberId } : {}),
      };
      const { data: learner, error: upErr } = prior
        ? await sb.from("academy_learners").update(row).eq("id", prior.id).select("id").single()
        : await sb.from("academy_learners").insert(row).select("id").single();
      if (upErr || !learner) throw new Error(upErr?.message ?? "Could not save");

      const sent = await sendLearnerInvite(sb, { email, name, vesselName: yacht.vesselName, invitedBy: actor, existingLogin });
      await sb.from("academy_learners").update({
        invite_sent_at: sent.sent ? new Date().toISOString() : null,
        invite_error: sent.sent ? null : (sent.error ?? "Email not sent").slice(0, 500),
      }).eq("id", learner.id);
      await activity({ learner_id: learner.id, action: prior ? "reinvited" : "invited", detail: { email, emailSent: sent.sent } });
      return json({
        ok: true, learnerId: learner.id, emailSent: sent.sent, link: sent.sent ? undefined : sent.link,
        warning: sent.sent ? undefined : "The invitation email wasn't sent. Copy the link below and send it to them another way (WhatsApp, text).",
      });
    }

    if (body.op === "resend") {
      const learner = await ownLearner(sb, yacht, body.learnerId);
      if (!learner.active) throw new BadRequest("Put them back first");
      const { data: u } = learner.user_id ? await sb.auth.admin.getUserById(learner.user_id) : { data: null };
      const sent = await sendLearnerInvite(sb, {
        email: learner.email, name: learner.display_name, vesselName: yacht.vesselName, invitedBy: actor,
        existingLogin: !!u?.user?.last_sign_in_at,
      });
      await sb.from("academy_learners").update({
        invite_sent_at: sent.sent ? new Date().toISOString() : learner.invite_sent_at,
        invite_error: sent.sent ? null : (sent.error ?? "Email not sent").slice(0, 500),
      }).eq("id", learner.id);
      return json({ ok: true, emailSent: sent.sent, link: sent.sent ? undefined : sent.link });
    }

    if (body.op === "remove" || body.op === "restore") {
      const learner = await ownLearner(sb, yacht, body.learnerId);
      if (body.op === "restore" && learner.user_id) {
        const { data: other } = await sb.from("academy_learners").select("id")
          .eq("user_id", learner.user_id).eq("active", true).neq("id", learner.id).limit(1);
        if (other?.length) throw new BadRequest("They've since joined another vessel's Crew Academy. Invite them again to bring them back here.");
      }
      await sb.from("academy_learners").update(body.op === "remove"
        ? { active: false, left_at: new Date().toISOString() }
        : { active: true, left_at: null }).eq("id", learner.id);
      await activity({ learner_id: learner.id, action: body.op === "remove" ? "removed" : "restored" });
      return json({ ok: true });
    }

    if (body.op === "enrol") {
      const course = await courseForVessel(sb, String(body.courseId ?? ""), yacht.yachtId);
      if (!course) throw new BadRequest("That course isn't available to your vessel");
      const ids: string[] = Array.isArray(body.learnerIds)
        ? [...new Set((body.learnerIds as unknown[]).filter((x): x is string => typeof x === "string" && UUID_RE.test(x)))]
        : [];
      if (!ids.length) throw new BadRequest("Choose who to enrol");
      const { data: learners } = await sb.from("academy_learners").select("id")
        .eq("yacht_id", yacht.yachtId).eq("active", true).in("id", ids);
      if ((learners ?? []).length !== ids.length) throw new BadRequest("Everyone enrolled must be in this vessel's Crew Academy");
      const dueDate = typeof body.dueDate === "string" && DATE_RE.test(body.dueDate) ? body.dueDate : null;
      const mandatory = body.mandatory !== false;

      const { data: live } = await sb.from("academy_enrolments").select("learner_id")
        .eq("course_id", course.id).in("learner_id", ids).not("status", "in", "(expired,cancelled)");
      const already = new Set((live ?? []).map((e: any) => e.learner_id));
      let added = 0;
      for (const learnerId of ids) {
        if (already.has(learnerId)) continue;
        const { data: rule } = await sb.from("academy_enrolment_rules").insert({
          yacht_id: yacht.yachtId, course_id: course.id, learner_id: learnerId, mandatory, due_date: dueDate,
          created_by: yacht.userId, created_by_name: actor,
        }).select("id").single();
        const { error } = await sb.from("academy_enrolments").insert({
          learner_id: learnerId, course_id: course.id, yacht_id: yacht.yachtId, rule_id: rule?.id ?? null,
          mandatory, due_date: dueDate,
        });
        if (error) throw new Error(error.message);
        await activity({ learner_id: learnerId, course_id: course.id, action: "enrolled", detail: { dueDate, mandatory } });
        added++;
      }
      return json({ ok: true, added, alreadyEnrolled: already.size });
    }

    if (body.op === "cancel") {
      if (typeof body.enrolmentId !== "string" || !UUID_RE.test(body.enrolmentId)) throw new BadRequest("Choose an enrolment");
      const { data: e } = await sb.from("academy_enrolments").select("id, status, learner_id, course_id, rule_id")
        .eq("id", body.enrolmentId).eq("yacht_id", yacht.yachtId).maybeSingle();
      if (!e) throw new BadRequest("Enrolment not found");
      if (e.status === "completed") throw new BadRequest("A completed course stays on their record");
      await sb.from("academy_enrolments").update({ status: "cancelled" }).eq("id", e.id);
      if (e.rule_id) await sb.from("academy_enrolment_rules").update({ revoked_at: new Date().toISOString(), revoked_by_name: actor }).eq("id", e.rule_id);
      await activity({ learner_id: e.learner_id, course_id: e.course_id, action: "unenrolled" });
      return json({ ok: true });
    }

    return json({ error: "Unknown request" }, 400);
  } catch (e: any) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400);
    console.error("[portal-academy]", e);
    return json({ error: e?.message ?? "Something went wrong" }, 500);
  }
}
