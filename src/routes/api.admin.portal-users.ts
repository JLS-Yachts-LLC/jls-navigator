/**
 * Vessel (captain) portal login management — admin only.
 *   POST /api/admin/portal-users
 *     { action: "create-login",  accountId, email }  → creates/links the auth user,
 *        returns { tempPassword } when a fresh login was created
 *     { action: "reset-password", accountId }        → new temp password, returned
 *     { action: "unlink",         accountId }        → detaches the login (row kept)
 *
 * Safety: refuses to link an email that belongs to a STAFF account — a staff
 * user converted to captain would instantly lose all staff data access (RLS).
 */
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/access";
import { logAuditEvent } from "@/lib/admin/audit";

function getAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

function tempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  const s = [...buf].map((b) => chars[b % chars.length]).join("");
  return `Vessel-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

/**
 * Make sure a portal login carries no staff identity.
 *
 * "Staff" is defined across the app — and in every storage policy — as *having a
 * user_profiles row*, and the triggers on auth.users create one for every new
 * user because they were written when every user was a JLS employee. A captain
 * that kept those rows would read as staff and sidestep the whole isolation
 * layer. The triggers now stand down for `portal: 'captain'` metadata; this is
 * the backstop for a login created any other way (the Supabase dashboard, say),
 * and it runs on every create/link so it is self-healing.
 */
async function stripStaffIdentity(sb: any, userId: string): Promise<void> {
  await Promise.all([
    sb.from("user_profiles").delete().eq("user_id", userId),
    sb.from("user_roles").delete().eq("user_id", userId),
    sb.from("profiles").delete().eq("id", userId),
  ]);
}

async function findUserByEmail(sb: any, email: string): Promise<any | null> {
  const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users ?? []).find((u: any) => (u.email ?? "").toLowerCase() === email.toLowerCase()) ?? null;
}

export async function adminPortalUsersHandler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const session = await requireAdminAccess(request);
  if (!session.ok) return session.response;

  const body = await request.json() as { action: string; accountId: string; email?: string };
  const sb = getAdmin();

  const { data: account } = await sb
    .from("captain_accounts")
    .select("id, user_id, email, display_name, yacht_id, yachts(vessel_name)")
    .eq("id", body.accountId).maybeSingle();
  if (!account) return json({ error: "Captain account not found" }, 404);
  const vessel = (account as any).yachts?.vessel_name ?? "vessel";

  const audit = (detail: string) => logAuditEvent({
    event_type: "PERM",
    actor_id: session.user.id, actor_email: session.user.email, actor_role: session.user.role,
    target_type: "captain_account", target_label: `${account.display_name ?? account.email} (${vessel})`,
    detail, ip_address: request.headers.get("x-forwarded-for"), result: "success",
  });

  if (body.action === "unlink") {
    await sb.from("captain_accounts").update({ user_id: null, active: false }).eq("id", account.id);
    await audit("Portal login unlinked / deactivated");
    return json({ success: true });
  }

  if (body.action === "reset-password") {
    if (!account.user_id) return json({ error: "No login linked to this captain yet" }, 400);
    const pwd = tempPassword();
    const { error } = await sb.auth.admin.updateUserById(account.user_id, { password: pwd });
    if (error) return json({ error: error.message }, 500);
    await audit("Portal password reset");
    return json({ success: true, tempPassword: pwd });
  }

  // Change the login email — e.g. the captain lost access to the old mailbox.
  if (body.action === "change-email") {
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email) return json({ error: "A new email address is required" }, 400);
    const existing = await findUserByEmail(sb, email);
    if (existing && existing.id !== account.user_id) {
      return json({ error: `${email} already belongs to another account` }, 400);
    }
    if (account.user_id) {
      const { error } = await sb.auth.admin.updateUserById(account.user_id, { email, email_confirm: true });
      if (error) return json({ error: error.message }, 500);
    }
    const { error: linkErr } = await sb.from("captain_accounts").update({ email }).eq("id", account.id);
    if (linkErr) return json({ error: linkErr.message }, 500);
    await audit(`Portal login email changed to ${email}`);
    return json({ success: true });
  }

  if (body.action === "create-login") {
    const email = (body.email ?? account.email ?? "").trim().toLowerCase();
    if (!email) return json({ error: "An email address is required to create the login" }, 400);

    let userId: string;
    let pwd: string | undefined;
    const existing = await findUserByEmail(sb, email);
    if (existing) {
      // Never convert a staff account into a captain login.
      //
      // An account that is ALREADY a captain somewhere is not staff, even if it
      // carries profile rows — those get auto-created by the auth.users triggers,
      // which is exactly what stripStaffIdentity() below cleans up. Without this
      // exception, re-linking a captain login would be refused as "staff".
      const [{ data: profile }, { data: roles }, { data: captain }] = await Promise.all([
        sb.from("user_profiles").select("user_id").eq("user_id", existing.id).maybeSingle(),
        sb.from("user_roles").select("user_id").eq("user_id", existing.id).limit(1),
        sb.from("captain_accounts").select("id").eq("user_id", existing.id).limit(1),
      ]);
      if ((profile || roles?.length) && !captain?.length) {
        return json({ error: `${email} is a STAFF account — captains need their own dedicated email/login.` }, 400);
      }
      userId = existing.id;
      pwd = tempPassword();
      // Tag it the same way a freshly created login is tagged, so the auth.users
      // triggers keep standing down for it.
      const { error } = await sb.auth.admin.updateUserById(userId, {
        password: pwd, email_confirm: true,
        user_metadata: { ...(existing.user_metadata ?? {}), portal: "captain", vessel },
      });
      if (error) return json({ error: error.message }, 500);
    } else {
      pwd = tempPassword();
      const { data: created, error } = await sb.auth.admin.createUser({
        email, password: pwd, email_confirm: true,
        user_metadata: { portal: "captain", vessel },
      });
      if (error || !created?.user) return json({ error: error?.message ?? "Could not create the login" }, 500);
      userId = created.user.id;
    }

    // Before the account is usable as a captain, and before anything is told the
    // password, make certain it is not also a staff identity.
    await stripStaffIdentity(sb, userId);

    const { error: linkErr } = await sb.from("captain_accounts")
      .update({ user_id: userId, email, active: true }).eq("id", account.id);
    if (linkErr) return json({ error: linkErr.message }, 500);
    await audit(`Portal login ${existing ? "linked" : "created"} for ${email}`);
    return json({ success: true, tempPassword: pwd });
  }

  return json({ error: `Unknown action: ${body.action}` }, 400);
}
