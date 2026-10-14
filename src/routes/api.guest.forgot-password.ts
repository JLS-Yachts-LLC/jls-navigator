/**
 * Public "Forgot your password" for guest logins.
 *
 *   POST /api/guest/forgot-password   { email } → always { ok: true }
 *
 * Same shape as the Client Portal's: never reveals whether an address has a
 * login, only emails an ACTIVE guest, and is rate limited per address and per IP
 * through portal_auth_requests (kind = 'guest_recovery'). The link lands back on
 * /guest, where they choose a new password.
 */
import { createClient } from "@supabase/supabase-js";
import { sendAuthLinkViaSES } from "@/lib/admin/auth-email.server";
import { guestPortalUrl } from "@/lib/guest/guest-email.server";

const generic = () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });

export async function guestForgotPasswordHandler(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return generic();

    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
    const ip = request.headers.get("cf-connecting-ip");
    const since10 = new Date(Date.now() - 10 * 60_000).toISOString();
    const sinceHour = new Date(Date.now() - 3_600_000).toISOString();
    const [{ count: recentForEmail }, { count: recentForIp }] = await Promise.all([
      sb.from("portal_auth_requests").select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", since10),
      ip ? sb.from("portal_auth_requests").select("id", { count: "exact", head: true }).eq("ip_address", ip).gte("created_at", sinceHour)
         : Promise.resolve({ count: 0 }),
    ]);
    const limited = (recentForEmail ?? 0) > 0 || (recentForIp ?? 0) >= 10;

    const { data: acct } = limited ? { data: null } : await sb.from("guest_accounts")
      .select("id").ilike("email", email).eq("active", true).not("user_id", "is", null).limit(1).maybeSingle();

    let sent = false;
    if (acct) {
      const res = await sendAuthLinkViaSES(sb, {
        email, type: "recovery", redirectTo: guestPortalUrl(),
        subject: "Reset your JLS Yachts guest password",
        heading: "Reset your password",
        intro: "We received a request to reset the password for your JLS Yachts guest login. Click below to choose a new one. If you didn’t ask for this, you can ignore this email.",
        cta: "Choose a new password",
      });
      sent = res.sent;
      if (!res.sent) console.error("[guest-forgot-password] not sent:", res.error);
    }
    await sb.from("portal_auth_requests").insert({ email, ip_address: ip, kind: "guest_recovery", sent });
    return generic();
  } catch (e) {
    console.error("[guest-forgot-password]", e);
    return generic();
  }
}
