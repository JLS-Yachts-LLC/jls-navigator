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

  if (body.action === "create-login") {
    const email = (body.email ?? account.email ?? "").trim().toLowerCase();
    if (!email) return json({ error: "An email address is required to create the login" }, 400);

    let userId: string;
    let pwd: string | undefined;
    const existing = await findUserByEmail(sb, email);
    if (existing) {
      // Never convert a staff account into a captain login.
      const [{ data: profile }, { data: roles }] = await Promise.all([
        sb.from("user_profiles").select("user_id").eq("user_id", existing.id).maybeSingle(),
        sb.from("user_roles").select("user_id").eq("user_id", existing.id).limit(1),
      ]);
      if (profile || roles?.length) {
        return json({ error: `${email} is a STAFF account — captains need their own dedicated email/login.` }, 400);
      }
      userId = existing.id;
      pwd = tempPassword();
      const { error } = await sb.auth.admin.updateUserById(userId, { password: pwd, email_confirm: true });
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

    const { error: linkErr } = await sb.from("captain_accounts")
      .update({ user_id: userId, email, active: true }).eq("id", account.id);
    if (linkErr) return json({ error: linkErr.message }, 500);
    await audit(`Portal login ${existing ? "linked" : "created"} for ${email}`);
    return json({ success: true, tempPassword: pwd });
  }

  return json({ error: `Unknown action: ${body.action}` }, 400);
}
