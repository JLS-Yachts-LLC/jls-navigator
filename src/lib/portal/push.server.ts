/**
 * Client Portal phone notifications.
 *
 *   GET    /api/portal/push?endpoint=…  → { available, publicKey, subscribed }
 *   POST   /api/portal/push              { endpoint, keys: { p256dh, auth } } → this device on
 *   DELETE /api/portal/push              { endpoint } → this device off
 *   POST   /api/portal/push/flush        (staff) send what's waiting now, not at the next tick
 *
 * What gets sent is decided by the database: triggers drop a row in
 * portal_push_outbox when JLS writes in a client's chat, replies on or moves a
 * request, or finishes a boat job. sendPortalPushes() runs on the worker's
 * 5-minute tick (and right after a staff action, via flush), and delivers each
 * row to every device its people switched notifications on for.
 *
 * Off until VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are set on the Worker.
 */
import { createClient } from "@supabase/supabase-js";
import { requireAccess } from "@/lib/auth/requireAccess.server";
import { sendWebPush, vapidConfigured, vapidPublicKey } from "./web-push.server";
import { HELD, allowed, autoMessageTargets } from "@/lib/client-auto-messages.server";

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } }) as any;
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const BATCH = 50;
/** Older than this, a notification is news nobody needs — e.g. waiting for keys to be set. */
const STALE_MS = 24 * 3600_000;
const MAX_FAILURES = 5;

/** The signed-in portal user (yacht or boat), from their Supabase token. */
async function portalUser(request: Request): Promise<{ id: string } | null> {
  const authz = request.headers.get("Authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) return null;
  const sb = admin();
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return null;
  const { data: acct } = await sb.from("captain_accounts").select("id").eq("user_id", user.id).eq("active", true).limit(1).maybeSingle();
  return acct ? { id: user.id } : null;
}

const validEndpoint = (u: unknown): u is string => {
  if (typeof u !== "string" || u.length > 1000) return false;
  try { return new URL(u).protocol === "https:"; } catch { return false; }
};

export async function portalPushHandler(request: Request): Promise<Response> {
  const user = await portalUser(request);
  if (!user) return json({ error: "Not signed in" }, 401);
  const sb = admin();

  if (request.method === "GET") {
    const endpoint = new URL(request.url).searchParams.get("endpoint");
    let subscribed = false;
    if (endpoint) {
      const { data } = await sb.from("portal_push_subscriptions").select("id").eq("endpoint", endpoint).eq("user_id", user.id).maybeSingle();
      subscribed = !!data;
    }
    return json({ available: vapidConfigured(), publicKey: vapidPublicKey(), subscribed });
  }

  const body: any = await request.json().catch(() => ({}));
  if (!validEndpoint(body?.endpoint)) return json({ error: "Bad subscription" }, 400);

  if (request.method === "DELETE") {
    await sb.from("portal_push_subscriptions").delete().eq("endpoint", body.endpoint).eq("user_id", user.id);
    return json({ ok: true });
  }
  if (request.method === "POST") {
    if (!vapidConfigured()) return json({ error: "Notifications aren't switched on yet." }, 409);
    const p256dh = String(body?.keys?.p256dh ?? ""), auth = String(body?.keys?.auth ?? "");
    if (!/^[\w-]{80,100}$/.test(p256dh) || !/^[\w-]{16,30}$/.test(auth)) return json({ error: "Bad subscription keys" }, 400);
    // A device belongs to whoever subscribed it last (a shared phone changing hands).
    const { error } = await sb.from("portal_push_subscriptions").upsert({
      endpoint: body.endpoint, user_id: user.id, p256dh, auth,
      user_agent: (request.headers.get("User-Agent") ?? "").slice(0, 300), failures: 0,
    }, { onConflict: "endpoint" });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}

/** Staff just did something a client may hear about — send it now. */
export async function portalPushFlushHandler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const access = await requireAccess(request);
  if (!access.ok) return access.response;
  const sb = admin();
  // Staff only: requireAccess admits any signed-in user, portal clients included.
  const [{ data: profile }, { data: captain }] = await Promise.all([
    sb.from("user_profiles").select("user_id").eq("user_id", access.claims.userId).maybeSingle(),
    sb.from("captain_accounts").select("user_id").eq("user_id", access.claims.userId).eq("active", true).limit(1).maybeSingle(),
  ]);
  if (!profile || captain) return json({ error: "Forbidden" }, 403);
  const r = await sendPortalPushes();
  return json({ ok: true, ...r });
}

/** Deliver waiting notifications. Rows are claimed first, so overlapping runs can't double-send. */
export async function sendPortalPushes(): Promise<{ sent: number; devices: number; failed: number; skipped?: string }> {
  if (!vapidConfigured()) return { sent: 0, devices: 0, failed: 0, skipped: "VAPID keys not set" };
  const sb = admin();
  const now = new Date().toISOString();

  await sb.from("portal_push_outbox").update({ sent_at: now, sent_count: 0, error: "Too old to send" })
    .is("sent_at", null).lt("created_at", new Date(Date.now() - STALE_MS).toISOString());

  const { data: pending } = await sb.from("portal_push_outbox").select("id")
    .is("sent_at", null).order("created_at").limit(BATCH);
  if (!pending?.length) return { sent: 0, devices: 0, failed: 0 };
  const { data: rows } = await sb.from("portal_push_outbox").update({ sent_at: now })
    .in("id", pending.map((p: any) => p.id)).is("sent_at", null)
    .select("id, yacht_id, boat_id, captain_account_id, kind, title, body, tab");
  if (!rows?.length) return { sent: 0, devices: 0, failed: 0 };

  // Only clients staff have switched on get these. A row addressed to one person
  // carries no vessel, so look up which vessel or boat that person belongs to.
  const targets = await autoMessageTargets();
  const personIds = [...new Set((rows as any[]).map((r) => r.captain_account_id).filter(Boolean))];
  const { data: persons } = personIds.length
    ? await sb.from("captain_accounts").select("id, yacht_id, boat_id").in("id", personIds)
    : { data: [] as any[] };
  const vesselOf = new Map(((persons ?? []) as any[]).map((p) => [p.id, p]));

  let sent = 0, devices = 0, failed = 0;
  for (const n of rows as any[]) {
    const person = n.captain_account_id ? vesselOf.get(n.captain_account_id) : null;
    if (!allowed(targets, { yachtId: n.yacht_id ?? person?.yacht_id, boatId: n.boat_id ?? person?.boat_id })) {
      await sb.from("portal_push_outbox").update({ sent_count: 0, error: HELD }).eq("id", n.id);
      continue;
    }
    let q = sb.from("captain_accounts").select("user_id").eq("active", true).not("user_id", "is", null);
    if (n.captain_account_id) q = q.eq("id", n.captain_account_id);
    else if (n.yacht_id) q = q.eq("yacht_id", n.yacht_id);
    else if (n.boat_id) q = q.eq("boat_id", n.boat_id);
    else continue;
    const { data: people } = await q;
    const userIds = [...new Set((people ?? []).map((p: any) => p.user_id))];
    if (!userIds.length) { await sb.from("portal_push_outbox").update({ sent_count: 0, error: "No portal users" }).eq("id", n.id); continue; }
    const { data: subs } = await sb.from("portal_push_subscriptions").select("id, endpoint, p256dh, auth, failures").in("user_id", userIds);

    const payload = {
      title: n.title, body: n.body ?? "", tab: n.tab ?? "home",
      url: `/portal?tab=${encodeURIComponent(n.tab ?? "home")}`,
      tag: `${n.kind}:${n.captain_account_id ?? n.yacht_id ?? n.boat_id}`,
    };
    let delivered = 0, lastError: string | null = null;
    for (const s of (subs ?? []) as any[]) {
      const r = await sendWebPush(s, payload, { urgency: n.kind === "chat" ? "high" : "normal" });
      if (r.ok) {
        delivered++;
        await sb.from("portal_push_subscriptions").update({ last_sent_at: now, failures: 0 }).eq("id", s.id);
      } else if (r.gone || s.failures + 1 >= MAX_FAILURES) {
        await sb.from("portal_push_subscriptions").delete().eq("id", s.id);
      } else {
        lastError = `${r.status} ${r.error}`.slice(0, 300);
        await sb.from("portal_push_subscriptions").update({ failures: s.failures + 1 }).eq("id", s.id);
      }
    }
    devices += delivered;
    if (delivered) sent++; else if (lastError) failed++;
    await sb.from("portal_push_outbox").update({
      sent_count: delivered, error: delivered ? null : (lastError ?? ((subs ?? []).length ? null : "No devices switched on")),
    }).eq("id", n.id);
  }
  return { sent, devices, failed };
}
