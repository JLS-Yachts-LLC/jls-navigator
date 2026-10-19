/**
 * Client Portal — Crew Academy, the vessel managers' side.
 *
 *   GET  /api/portal/academy                 → crew, groups, courses (available + the vessel's own),
 *                                              enrolments, group rules, shares with JLS, the crew list
 *   GET  ?op=course&id=                      → one of the vessel's own courses, for the course creator
 *   GET  ?op=media-url&id=                   → a file of one of the vessel's own courses
 *   GET  ?op=certificate&enrolment=          → a crew member's certificate PDF
 *   GET  ?op=analysis&courseId=              → which questions / exercise items the vessel's crew get wrong
 *   GET  ?op=summary                         → overdue / due-this-week counts for Alerts
 *
 *   Crew      POST { op: "invite", crewMemberId?, email, name, groupIds? } · "resend" · "remove" · "restore" { learnerId }
 *   Groups    POST { op: "group-save", id?, name, description } · "group-delete" { id } · "group-members" { groupId, learnerIds }
 *   Enrol     POST { op: "enrol", courseId, learnerIds?, groupIds?, dueDate?, dueDays?, mandatory }
 *             POST { op: "cancel", enrolmentId } · "rule-revoke" { ruleId }
 *   Courses   POST { op: "create" | "save" | "upload-url" | "publish" | "archive" | "restore", … }  (the vessel's own)
 *   Sharing   POST { op: "share", type: "course" | "learner", id, note? } · "unshare" { shareId }
 *
 * Needs the vessel's Crew Academy module, a position that sees it, and — for any
 * change — canManageAcademy() and not an admin preview. Everything is scoped to
 * the caller's vessel.
 *
 * Group enrolment is live: a group rule enrols today's members and anyone who
 * joins later; leaving the group takes off the courses from it that they hadn't
 * started. Records stay with the vessel (decided 19 Oct 2026). Private to the
 * vessel unless it shares a course or a crew member's results with JLS.
 */
import { createClient } from "@supabase/supabase-js";
import { resolvePortalYacht, portalModulesFor, type PortalYacht } from "@/lib/portal/portal-auth.server";
import { canManageAcademy, hiddenSections } from "@/lib/portal/portal-positions";
import { sectionEnabled } from "@/lib/portal/portal-modules";
import {
  EMAIL_RE, UUID_RE, certificatePdf, courseForVessel, coursesForVessel, dropGroupEnrolments, enrolFromGroupRules, ensureDefaultGroups,
  logActivity, pdfResponse, questionAnalysis, sendLearnerInvite,
} from "@/lib/academy/academy.server";
import {
  AuthoringError, authoringPost, courseForEditing, listCourses, mediaUrlFor, scopedCourse, type CourseScope,
} from "@/lib/academy/authoring.server";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function admin(): any {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

class BadRequest extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const crewName = (c: any) => c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
const uuids = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set((v as unknown[]).filter((x): x is string => typeof x === "string" && UUID_RE.test(x)))] : [];

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

async function ownGroups(sb: any, yacht: PortalYacht, ids: string[]) {
  if (!ids.length) return [];
  const { data } = await sb.from("academy_groups").select("id, name").eq("yacht_id", yacht.yachtId).in("id", ids);
  if ((data ?? []).length !== ids.length) throw new BadRequest("Choose groups on this vessel");
  return data as { id: string; name: string }[];
}

async function overview(sb: any, yacht: PortalYacht, canManage: boolean) {
  await ensureDefaultGroups(sb, yacht.yachtId);
  const scope: CourseScope = { owner: "vessel", yachtId: yacht.yachtId };
  const [{ data: learners }, courses, own, { data: enrolments }, { data: crew }, { data: groups }, { data: rules }, { data: shares }] = await Promise.all([
    sb.from("academy_learners")
      .select("id, email, display_name, crew_member_id, active, user_id, invite_sent_at, invite_error, last_seen_at, left_at, created_at")
      .eq("yacht_id", yacht.yachtId).order("display_name"),
    coursesForVessel(sb, yacht.yachtId),
    listCourses(sb, scope),
    sb.from("academy_enrolments")
      .select("id, learner_id, course_id, rule_id, status, mandatory, due_date, started_at, completed_at, score, expires_at, created_at, academy_certificates(number)")
      .eq("yacht_id", yacht.yachtId).neq("status", "cancelled"),
    sb.from("crew_members").select("id, full_name, first_name, last_name, rank, email, status")
      .eq("yacht_id", yacht.yachtId).neq("status", "off_signed"),
    sb.from("academy_groups").select("id, name, description, sort_order, academy_group_members(learner_id)")
      .eq("yacht_id", yacht.yachtId).order("sort_order").order("name"),
    sb.from("academy_enrolment_rules").select("id, course_id, group_id, mandatory, due_date, due_days, created_at, created_by_name")
      .eq("yacht_id", yacht.yachtId).is("revoked_at", null).not("group_id", "is", null),
    sb.from("academy_jls_shares").select("id, resource_type, resource_id, shared_by_kind, shared_by_name, note, created_at")
      .eq("yacht_id", yacht.yachtId).is("revoked_at", null),
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
      passMark: c.pass_mark, refreshMonths: c.refresh_months, own: c.owner_type === "vessel",
      from: c.owner_type === "jls" ? "JLS Yachts" : yacht.vesselName,
    })),
    ownCourses: own,
    enrolments: (enrolments ?? []).map((e: any) => ({
      id: e.id, learnerId: e.learner_id, courseId: e.course_id, ruleId: e.rule_id, status: e.status, mandatory: e.mandatory,
      dueDate: e.due_date, startedAt: e.started_at, completedAt: e.completed_at, score: e.score, expiresAt: e.expires_at,
      certificate: (Array.isArray(e.academy_certificates) ? e.academy_certificates[0] : e.academy_certificates)?.number ?? null,
    })),
    groups: (groups ?? []).map((g: any) => ({
      id: g.id, name: g.name, description: g.description, memberIds: (g.academy_group_members ?? []).map((m: any) => m.learner_id),
    })),
    groupRules: (rules ?? []).map((r: any) => ({
      id: r.id, courseId: r.course_id, groupId: r.group_id, mandatory: r.mandatory, dueDate: r.due_date, dueDays: r.due_days,
      createdAt: r.created_at, createdBy: r.created_by_name,
    })),
    shares: (shares ?? []).map((s: any) => ({
      id: s.id, type: s.resource_type, resourceId: s.resource_id, byKind: s.shared_by_kind, by: s.shared_by_name, note: s.note, at: s.created_at,
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
  const scope: CourseScope = { owner: "vessel", yachtId: yacht.yachtId };

  try {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const op = url.searchParams.get("op");
      if (op === "course") {
        return json({ canCreate: canManage, canEdit: canManage, ...(await courseForEditing(sb, scope, url.searchParams.get("id"))) });
      }
      if (op === "media-url") return json(await mediaUrlFor(sb, scope, url.searchParams.get("id")));
      if (op === "certificate") {
        const id = url.searchParams.get("enrolment") ?? "";
        if (!UUID_RE.test(id)) return json({ error: "Choose an enrolment" }, 400);
        const { data: own } = await sb.from("academy_enrolments").select("id").eq("id", id).eq("yacht_id", yacht.yachtId).maybeSingle();
        const file = own ? await certificatePdf(sb, id) : null;
        return file ? pdfResponse(file) : json({ error: "No certificate for that course" }, 404);
      }
      if (op === "analysis") {
        const course = await courseForVessel(sb, String(url.searchParams.get("courseId") ?? ""), yacht.yachtId);
        if (!course) return json({ error: "That course isn't available to your vessel" }, 400);
        return json(await questionAnalysis(sb, course.id, yacht.yachtId));
      }
      if (op === "summary") {
        // For the portal's Alerts: required training overdue or due within a week, among crew still signed up.
        const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
        const { data: rows } = await sb.from("academy_enrolments")
          .select("due_date, academy_learners!inner(active)")
          .eq("yacht_id", yacht.yachtId).eq("mandatory", true).in("status", ["not_started", "in_progress", "failed"])
          .eq("academy_learners.active", true).not("due_date", "is", null).lte("due_date", soon);
        const todayIso = new Date().toISOString().slice(0, 10);
        const overdue = (rows ?? []).filter((r: any) => r.due_date < todayIso).length;
        return json({ overdue, dueSoon: (rows ?? []).length - overdue });
      }
      return json(await overview(sb, yacht, canManage));
    }
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (yacht.preview) return json({ error: "Read-only preview — sign in as the client to make changes." }, 403);
    if (!canManageAcademy(yacht.position)) return json({ error: "Your position can see Crew Academy but not change it." }, 403);

    const body = await request.json().catch(() => null) as any;
    if (!body || typeof body !== "object") return json({ error: "Bad request" }, 400);
    const actor = await callerName(sb, yacht);
    const activity = (row: { learner_id?: string; course_id?: string; action: string; detail?: unknown }) =>
      logActivity(sb, { yacht_id: yacht.yachtId, actor_user_id: yacht.userId, actor_name: actor, ...row });

    // The vessel's own courses — the same course creator JLS uses.
    const authored = await authoringPost(sb, scope, { userId: yacht.userId, name: actor }, body, true);
    if (authored) {
      if (body.op === "publish") await activity({ course_id: body.id, action: "course_published", detail: { version: authored.version } });
      return json(authored);
    }

    // ── Crew ──────────────────────────────────────────────────────────────────
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
      const groups = await ownGroups(sb, yacht, uuids(body.groupIds));

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

      if (groups.length) {
        await sb.from("academy_group_members").upsert(
          groups.map((g) => ({ group_id: g.id, learner_id: learner.id, added_by: yacht.userId })), { onConflict: "group_id,learner_id" });
      }
      const enrolled = await enrolFromGroupRules(sb, yacht.yachtId, learner.id);

      const sent = await sendLearnerInvite(sb, { email, name, vesselName: yacht.vesselName, invitedBy: actor, existingLogin });
      await sb.from("academy_learners").update({
        invite_sent_at: sent.sent ? new Date().toISOString() : null,
        invite_error: sent.sent ? null : (sent.error ?? "Email not sent").slice(0, 500),
      }).eq("id", learner.id);
      await activity({ learner_id: learner.id, action: prior ? "reinvited" : "invited", detail: { email, emailSent: sent.sent, groups: groups.map((g) => g.name) } });
      return json({
        ok: true, learnerId: learner.id, emailSent: sent.sent, enrolled, link: sent.sent ? undefined : sent.link,
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
      if (body.op === "restore") await enrolFromGroupRules(sb, yacht.yachtId, learner.id);
      await activity({ learner_id: learner.id, action: body.op === "remove" ? "removed" : "restored" });
      return json({ ok: true });
    }

    // ── Groups ────────────────────────────────────────────────────────────────
    if (body.op === "group-save") {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
      if (!name) throw new BadRequest("Give the group a name");
      const description = typeof body.description === "string" ? body.description.trim().slice(0, 300) || null : null;
      if (body.id) {
        const [g] = await ownGroups(sb, yacht, uuids([body.id]));
        const { error } = await sb.from("academy_groups").update({ name, description }).eq("id", g.id);
        if (error) throw new BadRequest(error.code === "23505" ? "There's already a group with that name" : error.message);
        return json({ ok: true, id: g.id });
      }
      const { data, error } = await sb.from("academy_groups").insert({ yacht_id: yacht.yachtId, name, description, created_by: yacht.userId, sort_order: 100 })
        .select("id").single();
      if (error) throw new BadRequest(error.code === "23505" ? "There's already a group with that name" : error.message);
      return json({ ok: true, id: data.id });
    }

    if (body.op === "group-delete") {
      const [g] = await ownGroups(sb, yacht, uuids([body.id]));
      await dropGroupEnrolments(sb, { groupId: g.id });
      await sb.from("academy_enrolment_rules").update({ revoked_at: new Date().toISOString(), revoked_by_name: actor })
        .eq("group_id", g.id).is("revoked_at", null);
      await sb.from("academy_groups").delete().eq("id", g.id);
      await activity({ action: "group_deleted", detail: { name: g.name } });
      return json({ ok: true });
    }

    if (body.op === "group-members") {
      const [g] = await ownGroups(sb, yacht, uuids([body.groupId]));
      const want = uuids(body.learnerIds);
      if (want.length) {
        const { data: ok } = await sb.from("academy_learners").select("id").eq("yacht_id", yacht.yachtId).in("id", want);
        if ((ok ?? []).length !== want.length) throw new BadRequest("Everyone in a group must be in this vessel's Crew Academy");
      }
      const { data: current } = await sb.from("academy_group_members").select("learner_id").eq("group_id", g.id);
      const have = new Set<string>((current ?? []).map((m: any) => m.learner_id as string));
      const added = want.filter((id) => !have.has(id));
      const removed = [...have].filter((id) => !want.includes(id));
      if (added.length) await sb.from("academy_group_members").insert(added.map((learner_id) => ({ group_id: g.id, learner_id, added_by: yacht.userId })));
      if (removed.length) await sb.from("academy_group_members").delete().eq("group_id", g.id).in("learner_id", removed);
      let enrolled = 0;
      for (const id of added) enrolled += await enrolFromGroupRules(sb, yacht.yachtId, id, [g.id]);
      let dropped = 0;
      for (const id of removed) dropped += await dropGroupEnrolments(sb, { groupId: g.id, learnerId: id });
      return json({ ok: true, added: added.length, removed: removed.length, enrolled, dropped });
    }

    // ── Enrolment ─────────────────────────────────────────────────────────────
    if (body.op === "enrol") {
      const course = await courseForVessel(sb, String(body.courseId ?? ""), yacht.yachtId);
      if (!course) throw new BadRequest("That course isn't available to your vessel");
      const learnerIds = uuids(body.learnerIds);
      const groups = await ownGroups(sb, yacht, uuids(body.groupIds));
      if (!learnerIds.length && !groups.length) throw new BadRequest("Choose who to enrol");
      if (learnerIds.length) {
        const { data: ok } = await sb.from("academy_learners").select("id").eq("yacht_id", yacht.yachtId).eq("active", true).in("id", learnerIds);
        if ((ok ?? []).length !== learnerIds.length) throw new BadRequest("Everyone enrolled must be in this vessel's Crew Academy");
      }
      const dueDate = typeof body.dueDate === "string" && DATE_RE.test(body.dueDate) ? body.dueDate : null;
      const dueDays = !dueDate && Number(body.dueDays) > 0 ? Math.min(365, Math.round(Number(body.dueDays))) : null;
      const mandatory = body.mandatory !== false;

      let added = 0;
      // Groups: a live rule each, then today's members.
      for (const g of groups) {
        const { data: existingRule } = await sb.from("academy_enrolment_rules").select("id")
          .eq("course_id", course.id).eq("group_id", g.id).is("revoked_at", null).maybeSingle();
        if (!existingRule) {
          await sb.from("academy_enrolment_rules").insert({
            yacht_id: yacht.yachtId, course_id: course.id, group_id: g.id, mandatory, due_date: dueDate, due_days: dueDays,
            created_by: yacht.userId, created_by_name: actor,
          });
        }
        const { data: members } = await sb.from("academy_group_members").select("learner_id, academy_learners!inner(active)")
          .eq("group_id", g.id).eq("academy_learners.active", true);
        for (const m of members ?? []) added += await enrolFromGroupRules(sb, yacht.yachtId, m.learner_id, [g.id]);
        await activity({ course_id: course.id, action: "group_enrolled", detail: { group: g.name, dueDate, dueDays, mandatory } });
      }
      // Individuals.
      const { data: live } = learnerIds.length ? await sb.from("academy_enrolments").select("learner_id")
        .eq("course_id", course.id).in("learner_id", learnerIds).not("status", "in", "(expired,cancelled)") : { data: [] };
      const already = new Set((live ?? []).map((e: any) => e.learner_id));
      for (const learnerId of learnerIds) {
        if (already.has(learnerId)) continue;
        const { data: rule } = await sb.from("academy_enrolment_rules").insert({
          yacht_id: yacht.yachtId, course_id: course.id, learner_id: learnerId, mandatory, due_date: dueDate, due_days: dueDays,
          created_by: yacht.userId, created_by_name: actor,
        }).select("id").single();
        const due = dueDate ?? (dueDays ? new Date(Date.now() + dueDays * 86_400_000).toISOString().slice(0, 10) : null);
        const { error } = await sb.from("academy_enrolments").insert({
          learner_id: learnerId, course_id: course.id, yacht_id: yacht.yachtId, rule_id: rule?.id ?? null, mandatory, due_date: due,
        });
        if (error) throw new Error(error.message);
        await activity({ learner_id: learnerId, course_id: course.id, action: "enrolled", detail: { dueDate: due, mandatory } });
        added++;
      }
      return json({ ok: true, added });
    }

    if (body.op === "cancel") {
      if (typeof body.enrolmentId !== "string" || !UUID_RE.test(body.enrolmentId)) throw new BadRequest("Choose an enrolment");
      const { data: e } = await sb.from("academy_enrolments").select("id, status, learner_id, course_id, rule_id")
        .eq("id", body.enrolmentId).eq("yacht_id", yacht.yachtId).maybeSingle();
      if (!e) throw new BadRequest("Enrolment not found");
      if (e.status === "completed") throw new BadRequest("A completed course stays on their record");
      await sb.from("academy_enrolments").update({ status: "cancelled" }).eq("id", e.id);
      // An individual's own rule goes with it; a group rule stays for the rest of the group.
      if (e.rule_id) {
        await sb.from("academy_enrolment_rules").update({ revoked_at: new Date().toISOString(), revoked_by_name: actor })
          .eq("id", e.rule_id).not("learner_id", "is", null);
      }
      await activity({ learner_id: e.learner_id, course_id: e.course_id, action: "unenrolled" });
      return json({ ok: true });
    }

    if (body.op === "rule-revoke") {
      if (typeof body.ruleId !== "string" || !UUID_RE.test(body.ruleId)) throw new BadRequest("Choose a group enrolment");
      const { data: r } = await sb.from("academy_enrolment_rules").select("id, course_id, group_id")
        .eq("id", body.ruleId).eq("yacht_id", yacht.yachtId).is("revoked_at", null).maybeSingle();
      if (!r) throw new BadRequest("Group enrolment not found");
      await sb.from("academy_enrolment_rules").update({ revoked_at: new Date().toISOString(), revoked_by_name: actor }).eq("id", r.id);
      const dropped = await dropGroupEnrolments(sb, { ruleId: r.id });
      await activity({ course_id: r.course_id, action: "group_unenrolled", detail: { groupId: r.group_id, dropped } });
      return json({ ok: true, dropped });
    }

    // ── Sharing with JLS ──────────────────────────────────────────────────────
    if (body.op === "share") {
      const type = body.type === "learner" ? "learner" : body.type === "course" ? "course" : null;
      if (!type) throw new BadRequest("Choose what to share");
      if (type === "course") await scopedCourse(sb, scope, body.id);
      else await ownLearner(sb, yacht, body.id);
      const { data: live } = await sb.from("academy_jls_shares").select("id")
        .eq("resource_type", type).eq("resource_id", body.id).is("revoked_at", null).maybeSingle();
      if (!live) {
        await sb.from("academy_jls_shares").insert({
          yacht_id: yacht.yachtId, resource_type: type, resource_id: body.id, shared_by_kind: "vessel",
          shared_by: yacht.userId, shared_by_name: actor,
          note: typeof body.note === "string" ? body.note.trim().slice(0, 1000) || null : null,
        });
        await activity({ action: "shared_with_jls", detail: { type, id: body.id }, ...(type === "learner" ? { learner_id: body.id } : { course_id: body.id }) });
      }
      return json({ ok: true });
    }

    if (body.op === "unshare") {
      if (typeof body.shareId !== "string" || !UUID_RE.test(body.shareId)) throw new BadRequest("Choose a share");
      const { data: s } = await sb.from("academy_jls_shares").select("id, resource_type, resource_id")
        .eq("id", body.shareId).eq("yacht_id", yacht.yachtId).is("revoked_at", null).maybeSingle();
      if (!s) throw new BadRequest("Share not found");
      await sb.from("academy_jls_shares").update({ revoked_at: new Date().toISOString(), revoked_by_name: actor }).eq("id", s.id);
      await activity({ action: "unshared_with_jls", detail: { type: s.resource_type, id: s.resource_id } });
      return json({ ok: true });
    }

    return json({ error: "Unknown request" }, 400);
  } catch (e: any) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400);
    if (e instanceof AuthoringError) return json({ error: e.message, problems: e.problems }, 400);
    console.error("[portal-academy]", e);
    return json({ error: e?.message ?? "Something went wrong" }, 500);
  }
}
