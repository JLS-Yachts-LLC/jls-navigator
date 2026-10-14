/**
 * Guest accounts and guest groups — admins, and staff given the "Guest Access"
 * permission (Settings → Manage Users → the person → Modules):
 *   Create or higher → everything below except set-active;
 *   Edit or higher   → set-active too (deactivate / reactivate).
 *
 *   POST /api/admin/guests
 *     { action: "invite", email, displayName?, company?, groupIds? }
 *          → creates (or re-activates) the guest login and emails a set-your-
 *            password link. The link is returned too, for when email is off or
 *            doesn't arrive.
 *     { action: "resend-invite", guestId }
 *     { action: "update", guestId, displayName?, company? }
 *     { action: "set-active", guestId, active }   — deactivating also blocks sign-in
 *     { action: "group-create", name, description?, guestIds? }
 *     { action: "group-update", groupId, name?, description? }
 *     { action: "group-members", groupId, guestIds }   — replaces the member list
 *     { action: "group-delete", groupId }
 *
 * Reads happen in the browser (staff RLS on the guest tables). Writes come here
 * so the login, the email and the audit trail always happen together.
 *
 * Safety: never turns a staff or Client Portal login into a guest — a staff
 * account converted to a guest would instantly lose all staff access (RLS), and
 * its staff record (user_profiles) is referenced by its history, so it can't
 * simply be removed. A JLS / New Horizon address IS allowed as a guest, as long
 * as it has no staff login: ad-hoc people are sometimes given a company mailbox
 * but should still see only what is shared with them.
 */
import { requireAdminAccess } from "@/lib/admin/access";
import { requireAccess } from "@/lib/auth/requireAccess.server";
import { PERMISSION_ORDER, type PermissionLevel } from "@/lib/auth/claims";
import { logAuditEvent } from "@/lib/admin/audit";
import { guestAdmin, json } from "@/lib/guest/guest-auth.server";
import { sendGuestInvite } from "@/lib/guest/guest-email.server";

/** Staff identity rows the auth.users triggers would create — a guest must have none. */
async function stripStaffIdentity(sb: any, userId: string): Promise<void> {
  await Promise.all([
    sb.from("user_profiles").delete().eq("user_id", userId),
    sb.from("user_roles").delete().eq("user_id", userId),
    sb.from("profiles").delete().eq("id", userId),
  ]);
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

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Effectively "until reactivated". */
const BAN_FOREVER = "876000h";

type Manager = { id: string; email: string; role: string; canDeactivate: boolean };

/**
 * Who may manage guests: an admin (global / org), or a staff member holding the
 * Guest Access module at Create or above. Both checks refuse portal and guest
 * logins outright.
 */
async function guestManager(request: Request): Promise<{ ok: true; actor: Manager } | { ok: false; response: Response }> {
  const admin = await requireAdminAccess(request);
  if (admin.ok) return { ok: true, actor: { ...admin.user, canDeactivate: true } };
  const access = await requireAccess(request, { module: "guest_access", level: "create" });
  if (!access.ok) {
    return { ok: false, response: json({ error: "Managing guests needs the Guest Access permission. Ask an admin to switch it on for you." }, 403) };
  }
  const level = access.claims.moduleLevels.guest_access as PermissionLevel | undefined;
  const atLeast = (want: PermissionLevel) => !!level && PERMISSION_ORDER.indexOf(level) >= PERMISSION_ORDER.indexOf(want);
  return {
    ok: true,
    actor: {
      id: access.claims.userId, email: access.claims.email, role: access.claims.roleName ?? "staff",
      canDeactivate: access.claims.isGlobalAdmin || atLeast("edit"),
    },
  };
}

export async function adminGuestsHandler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const session = await guestManager(request);
  if (!session.ok) return session.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, any>;
  const sb = guestAdmin();
  const actor = session.actor;
  const { data: me } = await sb.from("user_profiles").select("display_name").eq("user_id", actor.id).maybeSingle();
  const actorName: string = me?.display_name ?? actor.email;

  const audit = (label: string, detail: string, targetType = "guest_account") => logAuditEvent({
    event_type: "PERM",
    actor_id: actor.id, actor_email: actor.email, actor_role: actor.role as any,
    target_type: targetType, target_label: label, detail,
    ip_address: request.headers.get("x-forwarded-for"), result: "success",
  });

  async function setGroups(guestId: string, groupIds: string[] | undefined) {
    if (!Array.isArray(groupIds)) return;
    await sb.from("guest_group_members").delete().eq("guest_id", guestId);
    if (groupIds.length) {
      await sb.from("guest_group_members").insert(groupIds.map((g) => ({ group_id: g, guest_id: guestId, added_by: actor.id })));
    }
  }

  async function invite(guest: { id: string; email: string; display_name: string | null }) {
    const attempt = await sendGuestInvite(sb, { email: guest.email, invitedBy: actorName, name: guest.display_name });
    await sb.from("guest_accounts").update({
      invite_sent_at: attempt.sent ? new Date().toISOString() : null,
      invite_error: attempt.sent ? null : (attempt.error ?? "Email send failed").slice(0, 500),
    }).eq("id", guest.id);
    return {
      emailSent: attempt.sent,
      link: attempt.link,
      warning: attempt.sent ? undefined
        : `The invite email was not sent${attempt.error ? ` (${attempt.error})` : ""}. Copy the link below and send it to them another way.`,
    };
  }

  // ── Guests ──────────────────────────────────────────────────────────────────
  if (body.action === "invite") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid email address." }, 400);
    const displayName = String(body.displayName ?? "").trim() || null;
    const company = String(body.company ?? "").trim() || null;

    let userId: string;
    const existing = await findUserByEmail(sb, email);
    if (existing) {
      const [{ data: profile }, { data: captain }, { data: guestRow }] = await Promise.all([
        sb.from("user_profiles").select("user_id").eq("user_id", existing.id).maybeSingle(),
        sb.from("captain_accounts").select("id").eq("user_id", existing.id).limit(1),
        sb.from("guest_accounts").select("id").eq("user_id", existing.id).limit(1),
      ]);
      if (captain?.length) return json({ error: `${email} is a Client Portal login — a guest needs its own email address.` }, 400);
      if (profile && !guestRow?.length) {
        return json({
          error: `${email} already has a staff login, so it can't also be a guest. Remove their staff access first, or invite them with a different email address.`,
        }, 400);
      }
      userId = existing.id;
      await sb.auth.admin.updateUserById(userId, {
        ban_duration: "none",
        user_metadata: { ...(existing.user_metadata ?? {}), portal: "guest", display_name: displayName ?? existing.user_metadata?.display_name },
      });
    } else {
      const { data: created, error } = await sb.auth.admin.createUser({
        email, email_confirm: true,
        user_metadata: { portal: "guest", display_name: displayName },
      });
      if (error || !created?.user) return json({ error: error?.message ?? "Could not create the login" }, 500);
      userId = created.user.id;
    }
    // Before anything can sign in with it, make certain it carries no staff identity.
    await stripStaffIdentity(sb, userId);

    const { data: prior } = await sb.from("guest_accounts").select("id").ilike("email", email).maybeSingle();
    const row = {
      user_id: userId, email, active: true,
      display_name: displayName, company,
      invited_by: actor.id, invited_by_name: actorName,
    };
    const { data: guest, error: upErr } = prior
      ? await sb.from("guest_accounts").update(row).eq("id", prior.id).select("id, email, display_name").single()
      : await sb.from("guest_accounts").insert(row).select("id, email, display_name").single();
    if (upErr || !guest) return json({ error: upErr?.message ?? "Could not save the guest" }, 500);

    await setGroups(guest.id, body.groupIds);
    const result = await invite(guest);
    await audit(email, `Guest invited${company ? ` (${company})` : ""}${result.emailSent ? "" : " — email NOT delivered"}`);
    return json({ success: true, guestId: guest.id, ...result });
  }

  if (["resend-invite", "update", "set-active"].includes(body.action)) {
    const { data: guest } = await sb.from("guest_accounts")
      .select("id, user_id, email, display_name, active").eq("id", body.guestId).maybeSingle();
    if (!guest) return json({ error: "Guest not found" }, 404);

    if (body.action === "resend-invite") {
      if (!guest.active) return json({ error: "This guest is deactivated — reactivate them first." }, 400);
      const result = await invite(guest);
      await audit(guest.email, `Guest invite re-sent${result.emailSent ? "" : " — email NOT delivered"}`);
      return json({ success: true, ...result });
    }

    if (body.action === "update") {
      const patch: Record<string, unknown> = {};
      if ("displayName" in body) patch.display_name = String(body.displayName ?? "").trim() || null;
      if ("company" in body) patch.company = String(body.company ?? "").trim() || null;
      if (Object.keys(patch).length) {
        const { error } = await sb.from("guest_accounts").update(patch).eq("id", guest.id);
        if (error) return json({ error: error.message }, 500);
      }
      await setGroups(guest.id, body.groupIds);
      await audit(guest.email, "Guest details updated");
      return json({ success: true });
    }

    // set-active: the flag stops every /api/guest call at once; the ban stops new sign-ins.
    if (!actor.canDeactivate) {
      return json({ error: "Deactivating guests needs Guest Access at Edit or above." }, 403);
    }
    const active = !!body.active;
    const { error } = await sb.from("guest_accounts").update({ active }).eq("id", guest.id);
    if (error) return json({ error: error.message }, 500);
    if (guest.user_id) {
      await sb.auth.admin.updateUserById(guest.user_id, { ban_duration: active ? "none" : BAN_FOREVER });
    }
    await audit(guest.email, active ? "Guest reactivated" : "Guest deactivated (sign-in blocked)");
    return json({ success: true });
  }

  // ── Groups ──────────────────────────────────────────────────────────────────
  if (body.action === "group-create") {
    const name = String(body.name ?? "").trim();
    if (!name) return json({ error: "A group needs a name." }, 400);
    const { data: group, error } = await sb.from("guest_groups")
      .insert({ name, description: String(body.description ?? "").trim() || null, created_by: actor.id })
      .select("id").single();
    if (error) {
      return json({ error: error.code === "23505" ? `There is already a group called “${name}”.` : error.message }, 400);
    }
    const ids: string[] = Array.isArray(body.guestIds) ? body.guestIds : [];
    if (ids.length) {
      await sb.from("guest_group_members").insert(ids.map((g) => ({ group_id: group.id, guest_id: g, added_by: actor.id })));
    }
    await audit(name, `Guest group created with ${ids.length} member${ids.length === 1 ? "" : "s"}`, "guest_group");
    return json({ success: true, groupId: group.id });
  }

  if (["group-update", "group-members", "group-delete"].includes(body.action)) {
    const { data: group } = await sb.from("guest_groups").select("id, name").eq("id", body.groupId).maybeSingle();
    if (!group) return json({ error: "Group not found" }, 404);

    if (body.action === "group-update") {
      const patch: Record<string, unknown> = {};
      if ("name" in body) {
        const n = String(body.name ?? "").trim();
        if (!n) return json({ error: "A group needs a name." }, 400);
        patch.name = n;
      }
      if ("description" in body) patch.description = String(body.description ?? "").trim() || null;
      const { error } = await sb.from("guest_groups").update(patch).eq("id", group.id);
      if (error) return json({ error: error.code === "23505" ? "Another group already has that name." : error.message }, 400);
      await audit(group.name, "Guest group renamed / updated", "guest_group");
      return json({ success: true });
    }

    if (body.action === "group-members") {
      const ids: string[] = Array.isArray(body.guestIds) ? body.guestIds : [];
      await sb.from("guest_group_members").delete().eq("group_id", group.id);
      if (ids.length) {
        const { error } = await sb.from("guest_group_members")
          .insert(ids.map((g) => ({ group_id: group.id, guest_id: g, added_by: actor.id })));
        if (error) return json({ error: error.message }, 500);
      }
      await audit(group.name, `Guest group members set (${ids.length})`, "guest_group");
      return json({ success: true });
    }

    // group-delete: its shares go with it (members keep anything shared to them directly).
    const { count } = await sb.from("guest_shares").select("id", { count: "exact", head: true })
      .eq("group_id", group.id).is("revoked_at", null);
    const { error } = await sb.from("guest_groups").delete().eq("id", group.id);
    if (error) return json({ error: error.message }, 500);
    await audit(group.name, `Guest group deleted (${count ?? 0} live share${count === 1 ? "" : "s"} removed)`, "guest_group");
    return json({ success: true });
  }

  return json({ error: `Unknown action: ${body.action}` }, 400);
}
