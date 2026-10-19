/**
 * Crew Academy — the second sign-in step.
 *
 *   GET  /api/academy/mfa                     → { passed, hasAuthenticator, emailAvailable, email }
 *   POST { op: "send" }                       → email a 6-digit code (10 minutes)
 *   POST { op: "verify", code }               → check it; on a match this sign-in is verified
 *
 * The authenticator-app route is Supabase's own TOTP (done in the browser with
 * supabase.auth.mfa — the session becomes aal2). This route adds the email
 * route, which Supabase doesn't offer: codes are stored only as a SHA-256 hash,
 * expire after 10 minutes, allow 5 tries, and at most one is sent a minute and
 * five an hour per login. A matched code records the token's session_id in
 * academy_mfa_sessions for 30 days — resolveLearner() accepts that or aal2.
 *
 * Email is an outside address, so the mail guard decides whether a code can be
 * sent at all; when it can't, `emailAvailable` is false and crew must use the
 * authenticator app.
 */
import { json, resolveLearner } from "@/lib/academy/academy-auth.server";
import { sendEmail } from "@/lib/ses.server";
import { clientEmailEnabled, isInternalAddress, outboundEmailEnabled } from "@/lib/mail-guard.server";
import { emailBrandLockup } from "@/lib/email/brand-mark";

const CODE_MINUTES = 10;
const MAX_TRIES = 5;
const SESSION_DAYS = 30;

const canEmail = (addr: string) => outboundEmailEnabled() && (clientEmailEnabled() || isInternalAddress(addr));

async function hashCode(userId: string, code: string): Promise<string> {
  const pepper = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const data = new TextEncoder().encode(`${userId}:${code}:${pepper}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sixDigits(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

function codeEmail(code: string, vessel: string) {
  const html = `<!doctype html><html><body style="margin:0;background:#0b1220;padding:24px;font-family:Inter,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#0f1d2e;border:1px solid #1e2d40;border-radius:12px;overflow:hidden">
      <tr><td style="padding:22px 28px;border-bottom:1px solid #1e2d40">
        ${emailBrandLockup('<span style="font-family:Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:.14em;color:#e8edf5">CREW ACADEMY</span>', 28)}
      </td></tr>
      <tr><td style="padding:28px">
        <h1 style="margin:0 0 12px;font-size:18px;color:#e8edf5">Your sign-in code</h1>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#9fb3c8">Enter this code to finish signing in to ${vessel ? `${vessel}'s ` : ""}Crew Academy. It works for ${CODE_MINUTES} minutes.</p>
        <div style="font-family:Consolas,monospace;font-size:32px;letter-spacing:.35em;color:#e8edf5;background:#13243a;border-radius:10px;padding:14px 18px;text-align:center">${code}</div>
        <p style="margin:20px 0 0;font-size:12px;color:#6b8298">Didn't try to sign in? Someone may know your password — change it from the sign-in page ("Forgot your password?").</p>
      </td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:11px;color:#5f7488">JLS Yachts · Crew Academy</p>
  </td></tr></table></body></html>`;
  const text = `Your Crew Academy sign-in code is ${code}. It works for ${CODE_MINUTES} minutes.`;
  return { html, text };
}

export async function academyMfaHandler(request: Request): Promise<Response> {
  const auth = await resolveLearner(request, { mfa: false });
  if (!auth.ok) return auth.response;
  const { sb, learner, sessionId } = auth;

  try {
    if (request.method === "GET") {
      const { data: factors } = await sb.auth.admin.mfa.listFactors({ userId: learner.userId });
      const hasAuthenticator = (factors?.factors ?? []).some((f: any) => f.factor_type === "totp" && f.status === "verified");
      const masked = learner.email.replace(/^(.)(.*)(@.*)$/, (_m: string, a: string, b: string, c: string) => `${a}${"•".repeat(Math.min(b.length, 6))}${c}`);
      return json({ passed: auth.mfa, hasAuthenticator, emailAvailable: canEmail(learner.email), email: masked });
    }
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const body = await request.json().catch(() => ({})) as any;

    if (body.op === "send") {
      if (!canEmail(learner.email)) return json({ error: "Codes can't be emailed at the moment — use an authenticator app instead." }, 400);
      const minuteAgo = new Date(Date.now() - 60_000).toISOString();
      const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
      const [{ count: lastMinute }, { count: lastHour }] = await Promise.all([
        sb.from("academy_mfa_codes").select("id", { count: "exact", head: true }).eq("user_id", learner.userId).gte("created_at", minuteAgo),
        sb.from("academy_mfa_codes").select("id", { count: "exact", head: true }).eq("user_id", learner.userId).gte("created_at", hourAgo),
      ]);
      if ((lastMinute ?? 0) > 0) return json({ error: "A code was sent less than a minute ago — check your inbox (and junk)." }, 429);
      if ((lastHour ?? 0) >= 5) return json({ error: "Too many codes this hour. Try again later, or use an authenticator app." }, 429);

      const code = sixDigits();
      await sb.from("academy_mfa_codes").insert({
        user_id: learner.userId, code_hash: await hashCode(learner.userId, code),
        expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
        ip_address: request.headers.get("cf-connecting-ip"),
      });
      const { html, text } = codeEmail(code, learner.vesselName);
      try {
        await sendEmail({
          from: process.env.POLARIS_MAIL_SENDER ?? "polaris@jlsyachts.com",
          to: [learner.email], subject: `Your Crew Academy sign-in code: ${code}`, html, text,
        });
      } catch (e: any) {
        return json({ error: `The code couldn't be emailed (${e?.message ?? "send failed"}). Use an authenticator app instead.` }, 502);
      }
      return json({ ok: true });
    }

    if (body.op === "verify") {
      const code = String(body.code ?? "").replace(/\D/g, "");
      if (code.length !== 6) return json({ error: "Enter the 6-digit code." }, 400);
      if (!sessionId) return json({ error: "Please sign in again." }, 401);
      const { data: row } = await sb.from("academy_mfa_codes").select("id, code_hash, attempts, expires_at")
        .eq("user_id", learner.userId).is("used_at", null).gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!row) return json({ error: "That code has expired — send a new one." }, 400);
      if (row.attempts >= MAX_TRIES) return json({ error: "Too many wrong tries — send a new code." }, 400);
      if ((await hashCode(learner.userId, code)) !== row.code_hash) {
        await sb.from("academy_mfa_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
        return json({ error: "That code didn't match — try again." }, 400);
      }
      await sb.from("academy_mfa_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
      await sb.from("academy_mfa_sessions").upsert({
        session_id: sessionId, user_id: learner.userId, method: "email",
        verified_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString(),
      }, { onConflict: "session_id" });
      return json({ ok: true });
    }

    return json({ error: "Unknown request" }, 400);
  } catch (e: any) {
    console.error("[academy-mfa]", e);
    return json({ error: e?.message ?? "Something went wrong" }, 500);
  }
}
