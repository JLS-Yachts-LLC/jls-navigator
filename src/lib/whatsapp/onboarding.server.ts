/**
 * Connecting another WhatsApp number, and managing who can use each number.
 *
 * Onboarding is Meta's Embedded Signup with Coexistence
 * (featureType whatsapp_business_app_onboarding): a number already in the
 * WhatsApp Business app on a phone joins the Cloud API and keeps working on the
 * phone. Global admins only.
 *
 *   POST /api/whatsapp/onboard/start     → a session row + what the browser needs (app id, config id)
 *   POST /api/whatsapp/onboard/event     ← every WA_EMBEDDED_SIGNUP message the popup posts
 *   POST /api/whatsapp/onboard/complete  ← the code from FB.login: exchange → find the number →
 *                                          subscribe our app → save the line → request the syncs
 *   POST /api/whatsapp/onboard/sync      retry the contacts or history sync (once each, 24 h)
 *   POST /api/whatsapp/lines/adopt       a number already linked in WhatsApp Manager (Meta's own
 *                                        route, no Embedded Signup): find it under the WhatsApp
 *                                        accounts the Worker's System User can reach, take over the
 *                                        pending entry with that number, then request the syncs
 *
 * Coexistence numbers are already registered: /register is never called.
 * The Business Integration token never reaches the browser; it is stored in
 * wa_line_tokens, which only the server can read.
 *
 *   POST /api/whatsapp/lines/members     { lineId, userId, level: view|send|null } — Communications admin
 *   POST /api/whatsapp/lines/update      { lineId, label?, autoReplies?, pauseHours? } — Communications admin
 */
import { createClient } from "@supabase/supabase-js";
import { requireAccess } from "@/lib/auth/requireAccess.server";
import { logAuditEvent } from "@/lib/admin/audit";
import {
  MetaError, exchangeSignupCode, grantedWabaIds, graphVersion, phoneDetails, registerNumber, requestSmbSync, subscribeWaba, wabaPhoneNumbers,
} from "@/lib/whatsapp/cloud-api.server";
import { loadLines, type WaLine } from "@/lib/whatsapp/lines.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const env = (k: string) => ((process.env[k] as string | undefined) ?? "").trim();

function admin(): any {
  return createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}

/** Meta's error in the shape we log and store: what it said, its code, and the trace id their support asks for. */
function metaFailure(e: unknown) {
  const m = e instanceof MetaError ? e : null;
  return {
    message: (e instanceof Error ? e.message : String(e)).slice(0, 500),
    code: m?.code != null ? String(m.code) : null,
    subcode: m?.subcode != null ? String(m.subcode) : null,
    fbtrace_id: m?.fbtraceId ?? null,
  };
}

const SYNC_WINDOW_MS = 24 * 3_600_000;

// ─── Onboarding ───────────────────────────────────────────────────────────────

export async function onboardStartHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { adminOnly: true });
  if (!access.ok) return access.response;
  const appId = env("WHATSAPP_APP_ID");
  const configId = env("WHATSAPP_ES_CONFIG_ID");
  if (!appId) return json({ error: "WHATSAPP_APP_ID isn't set on the Worker." }, 409);
  if (!configId) {
    return json({
      error: "The Embedded Signup configuration id isn't set yet. Create it in the Meta app (Facebook Login for Business → Configurations) and set WHATSAPP_ES_CONFIG_ID on the Worker.",
    }, 409);
  }
  if (!env("WHATSAPP_APP_SECRET")) return json({ error: "WHATSAPP_APP_SECRET isn't set on the Worker." }, 409);
  const db = admin();
  const { data, error } = await db.from("wa_onboarding_sessions")
    .insert({ started_by: access.claims.userId, started_by_email: access.claims.email }).select("id").single();
  if (error) return json({ error: error.message }, 500);
  return json({ sessionId: data.id, appId, configId, graphVersion: graphVersion() });
}

/** Everything the popup reports, kept for diagnosis — including Meta's error codes. */
export async function onboardEventHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { adminOnly: true });
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => ({}))) as { sessionId?: string; message?: any };
  if (!body.sessionId || !body.message) return json({ error: "Nothing to record" }, 400);
  const db = admin();
  const { data: s } = await db.from("wa_onboarding_sessions").select("id, events, status").eq("id", body.sessionId).maybeSingle();
  if (!s) return json({ error: "Session not found" }, 404);

  const msg = body.message;
  const event = String(msg?.event ?? "");
  const data = msg?.data ?? {};
  const patch: Record<string, unknown> = {
    events: [...((s.events as any[]) ?? []), { at: new Date().toISOString(), event, data }].slice(-50),
  };
  if (data.waba_id) patch.waba_id = String(data.waba_id);
  if (data.phone_number_id) patch.phone_number_id = String(data.phone_number_id);
  if (data.session_id) patch.meta_session_id = String(data.session_id);
  if (event === "CANCEL" && (data.error_message || data.error_code)) {
    // A user-reported error comes back as a CANCEL carrying error_code / error_message.
    Object.assign(patch, { status: "error", error_code: data.error_code != null ? String(data.error_code) : null,
      error_message: String(data.error_message ?? "").slice(0, 500), finished_at: new Date().toISOString() });
    console.error("[wa-onboard] signup error", data.error_code, data.error_message, "meta session", data.session_id);
  } else if (event === "CANCEL") {
    if (s.status === "started") Object.assign(patch, { status: "cancelled", error_message: data.current_step ? `Closed at: ${data.current_step}` : null, finished_at: new Date().toISOString() });
  } else if (event === "ERROR") {
    Object.assign(patch, { status: "error", error_message: String(data.error_message ?? "Embedded Signup reported an error").slice(0, 500),
      error_code: data.error_code != null ? String(data.error_code) : null, finished_at: new Date().toISOString() });
    console.error("[wa-onboard] signup ERROR event", JSON.stringify(data).slice(0, 500));
  } else if (event.startsWith("FINISH") && s.status === "started") {
    patch.status = "finished";
  }
  await db.from("wa_onboarding_sessions").update(patch).eq("id", s.id);
  return json({ ok: true });
}

/** Ask for one of the two Coexistence syncs — once only, claimed before Meta is called. */
async function runSync(db: any, line: WaLine, token: string, kind: "contacts" | "history"): Promise<{ ok: boolean; error?: string; skipped?: string }> {
  const col = kind === "contacts" ? "contacts_sync_requested_at" : "history_sync_requested_at";
  const errCol = kind === "contacts" ? "contacts_sync_error" : "history_sync_error";
  if (line.onboarded_at && Date.now() - Date.parse(line.onboarded_at) > SYNC_WINDOW_MS) {
    return { ok: false, error: "The 24-hour window for this sync has passed. Meta only allows it right after onboarding." };
  }
  const { data: claimed } = await db.from("wa_lines").update({ [col]: new Date().toISOString(), [errCol]: null })
    .eq("id", line.id).is(col, null).select("id");
  if (!(claimed ?? []).length) return { ok: true, skipped: "already requested" };
  try {
    await requestSmbSync(token, line.phone_number_id!, kind === "contacts" ? "smb_app_state_sync" : "history");
    return { ok: true };
  } catch (e) {
    const f = metaFailure(e);
    console.error(`[wa-onboard] ${kind} sync failed`, f.code, f.subcode, f.message, "fbtrace", f.fbtrace_id);
    // Meta refused it, so it wasn't used up — free the claim so it can be retried.
    await db.from("wa_lines").update({
      [col]: null,
      [errCol]: `${f.message}${f.code ? ` (code ${f.code}${f.subcode ? `/${f.subcode}` : ""})` : ""}${f.fbtrace_id ? ` · fbtrace ${f.fbtrace_id}` : ""}`.slice(0, 500),
    }).eq("id", line.id);
    return { ok: false, error: f.message };
  }
}

export async function onboardCompleteHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { adminOnly: true });
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string; code?: string; wabaId?: string; phoneNumberId?: string; label?: string;
  };
  if (!body.sessionId || !body.code) return json({ error: "The signup didn't return a code." }, 400);
  const db = admin();
  const { data: session } = await db.from("wa_onboarding_sessions").select("*").eq("id", body.sessionId).maybeSingle();
  if (!session) return json({ error: "Session not found" }, 404);

  const fail = async (step: string, e: unknown, status = 502) => {
    const f = metaFailure(e);
    console.error(`[wa-onboard] ${step} failed`, f.code, f.subcode, f.message, "fbtrace", f.fbtrace_id);
    await db.from("wa_onboarding_sessions").update({
      status: "error", error_code: f.code, error_message: `${step}: ${f.message}`.slice(0, 500), fbtrace_id: f.fbtrace_id,
      finished_at: new Date().toISOString(),
    }).eq("id", session.id);
    return json({ error: `${step}: ${f.message}`, code: f.code, subcode: f.subcode, fbtrace_id: f.fbtrace_id }, status);
  };

  // 1. The code lives about 30 seconds — swap it for the token first.
  let token: string;
  try { token = await exchangeSignupCode(body.code); } catch (e) { return fail("Exchanging the signup code", e); }

  const lines = await loadLines(db);
  const known = new Set(lines.map((l) => l.waba_id).filter(Boolean));

  // 2. Which WhatsApp Business Account and number.
  let wabaId = body.wabaId || session.waba_id || null;
  if (!wabaId) {
    try {
      const granted = await grantedWabaIds(token);
      wabaId = granted.find((id) => !known.has(id)) ?? granted[0] ?? null;
    } catch (e) { return fail("Finding the WhatsApp Business Account", e); }
  }
  if (!wabaId) return fail("Finding the WhatsApp Business Account", new Error("Meta didn't say which account was connected."), 422);

  let phoneNumberId = body.phoneNumberId || session.phone_number_id || null;
  let numbers: Awaited<ReturnType<typeof wabaPhoneNumbers>> = [];
  try { numbers = await wabaPhoneNumbers(token, wabaId); } catch (e) { return fail("Listing the account's numbers", e); }
  if (!phoneNumberId) {
    const fresh = numbers.filter((n) => !lines.some((l) => l.phone_number_id === n.id));
    phoneNumberId = (fresh[0] ?? numbers[0])?.id ?? null;
  }
  if (!phoneNumberId) return fail("Finding the phone number", new Error("The account has no phone number yet."), 422);
  const office = lines.find((l) => l.is_default);
  if (phoneNumberId === env("WHATSAPP_PHONE_NUMBER_ID") || (office && office.phone_number_id === phoneNumberId)) {
    return fail("Saving the number", new Error("That's the office number, which is already connected."), 409);
  }

  // 3. Confirm it's a Coexistence number on the Cloud API. Never /register it.
  let details: Record<string, any> = {};
  try { details = await phoneDetails(token, phoneNumberId); } catch (e) { return fail("Reading the number's details", e); }
  const listed = numbers.find((n) => n.id === phoneNumberId);
  const display = String(details.display_phone_number ?? listed?.display_phone_number ?? "");
  const verifiedName = String(details.verified_name ?? listed?.verified_name ?? "") || null;

  // 4. Send this account's webhooks to Polaris.
  try { await subscribeWaba(token, wabaId); } catch (e) { return fail("Subscribing Polaris to the account", e); }

  // 5. Save the line and its token. A number set up ahead as "pending" (so its
  // people could be chosen before connecting) is taken over — same number,
  // matched on its digits — and keeps its name and members.
  const digits = (x: unknown) => String(x ?? "").replace(/\D/g, "");
  const pending = lines.find((l) => !l.is_default && !l.phone_number_id && l.status === "pending"
    && digits(l.display_phone).length > 6 && digits(l.display_phone) === digits(display));
  if (pending) await db.from("wa_lines").update({ phone_number_id: phoneNumberId }).eq("id", pending.id);
  const label = pending?.label || (body.label ?? "").trim() || verifiedName || display || "WhatsApp number";
  const { data: line, error: lineErr } = await db.from("wa_lines").upsert({
    phone_number_id: phoneNumberId, waba_id: wabaId, label, display_phone: display || null, verified_name: verifiedName,
    is_default: false, token_source: "stored", coexistence: details.is_on_biz_app !== false, status: "connected",
    onboarded_at: new Date().toISOString(), onboarded_by: access.claims.userId,
    disconnected_at: null, disconnect_reason: null,
    // A fresh onboarding gets fresh syncs.
    contacts_sync_requested_at: null, contacts_sync_error: null,
    history_sync_requested_at: null, history_sync_error: null, history_progress: null, history_declined: false,
  }, { onConflict: "phone_number_id" }).select("*").single();
  if (lineErr || !line) return fail("Saving the number", new Error(lineErr?.message ?? "not saved"), 500);
  const { error: tokErr } = await db.from("wa_line_tokens").upsert(
    { line_id: line.id, access_token: token, token_kind: "business_integration", updated_at: new Date().toISOString() },
    { onConflict: "line_id" });
  if (tokErr) return fail("Saving the number's token", new Error(tokErr.message), 500);

  // 6. The Business app's contacts, then its chat history — each once, within 24 h.
  const contacts = await runSync(db, line as WaLine, token, "contacts");
  const history = await runSync(db, line as WaLine, token, "history");

  await db.from("wa_onboarding_sessions").update({
    status: "connected", waba_id: wabaId, phone_number_id: phoneNumberId, line_id: line.id, finished_at: new Date().toISOString(),
  }).eq("id", session.id);
  await logAuditEvent({
    event_type: "ADMIN", module: "communications",
    actor_id: access.claims.userId, actor_email: access.claims.email, actor_role: (access.claims.roleName ?? "admin") as any,
    target_type: "whatsapp_line", target_label: `${label} ${display}`.trim(),
    detail: `WhatsApp number connected by Embedded Signup (Coexistence) — WABA ${wabaId}, phone ${phoneNumberId}; contacts sync ${contacts.ok ? "requested" : "failed"}, history sync ${history.ok ? "requested" : "failed"}`,
    ip_address: request.headers.get("x-forwarded-for"), result: "success",
  } as any);

  return json({
    ok: true,
    line: { id: line.id, label, display_phone: display, waba_id: wabaId, phone_number_id: phoneNumberId },
    platform_type: details.platform_type ?? null,
    is_on_biz_app: details.is_on_biz_app ?? null,
    contacts, history,
  });
}

export async function onboardSyncHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { adminOnly: true });
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => ({}))) as { lineId?: string; kind?: "contacts" | "history" };
  if (!body.lineId || (body.kind !== "contacts" && body.kind !== "history")) return json({ error: "Which number, and which sync?" }, 400);
  const db = admin();
  const { data: line } = await db.from("wa_lines").select("*").eq("id", body.lineId).maybeSingle();
  if (!line || line.is_default) return json({ error: "Number not found" }, 404);
  let token: string | null = null;
  if (line.token_source === "env") token = env("WHATSAPP_ACCESS_TOKEN") || null;
  else {
    const { data: tok } = await db.from("wa_line_tokens").select("access_token").eq("line_id", line.id).maybeSingle();
    token = tok?.access_token ?? null;
  }
  if (!token) return json({ error: "This number has no working connection — connect it again." }, 409);
  const out = await runSync(db, line as WaLine, token, body.kind);
  return json(out, out.ok ? 200 : 502);
}

/**
 * Take over a pending number once it has been linked in WhatsApp Manager.
 *
 * Looks in every WhatsApp Business Account the Worker's System User token can
 * reach (the office account first) for a number with the pending entry's
 * digits. Found → the entry becomes that number (same token as the office,
 * token_source 'env'), Polaris is subscribed to its account's webhooks, and the
 * contacts + history imports are requested at once — Meta allows them only once,
 * within 24 hours of linking. Not found → the numbers it could see, so the admin
 * knows what's missing (usually the System User needs access to a new account).
 */
export async function lineAdoptHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { adminOnly: true });
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => ({}))) as { lineId?: string };
  const token = env("WHATSAPP_ACCESS_TOKEN");
  if (!token) return json({ error: "WHATSAPP_ACCESS_TOKEN isn't set on the Worker." }, 409);
  const db = admin();
  const { data: pending } = await db.from("wa_lines").select("*").eq("id", body.lineId ?? "").maybeSingle();
  if (!pending || pending.is_default) return json({ error: "Number not found" }, 404);
  const digits = (x: unknown) => String(x ?? "").replace(/\D/g, "");
  const want = digits(pending.display_phone);
  if (want.length < 7) return json({ error: "This entry has no phone number to look for." }, 400);

  // Which accounts can the token reach? The office account, plus any it was granted.
  // A WhatsApp account id already noted on the pending entry is checked first.
  const wabas = new Set<string>([pending.waba_id, env("WHATSAPP_WABA_ID")].filter(Boolean));
  try { for (const id of await grantedWabaIds(token)) wabas.add(id); } catch (e) {
    console.warn("[wa-adopt] couldn't list the token's accounts", metaFailure(e));
  }
  const lines = await loadLines(db);
  const seen: Array<{ waba: string; id: string; number: string; name?: string }> = [];
  let found: { waba: string; id: string; number: string; name?: string } | null = null;
  const refused: string[] = [];
  for (const waba of wabas) {
    let numbers: Awaited<ReturnType<typeof wabaPhoneNumbers>> = [];
    try { numbers = await wabaPhoneNumbers(token, waba); } catch (e) {
      const f = metaFailure(e);
      console.warn("[wa-adopt] couldn't list numbers for", waba, f);
      refused.push(`${waba} (${f.message}${f.code ? `, code ${f.code}` : ""})`);
      continue;
    }
    for (const n of numbers) {
      const row = { waba, id: n.id, number: n.display_phone_number, name: n.verified_name };
      seen.push(row);
      if (!found && digits(n.display_phone_number) === want) found = row;
    }
  }
  if (!found) {
    const visible = seen.length ? seen.map((n) => `${n.number}${n.name ? ` (${n.name})` : ""}`).join(", ") : "none";
    return json({
      error: `${pending.display_phone} isn't under the WhatsApp accounts Polaris can reach yet. Link it in WhatsApp Manager first; if Meta put it in a new WhatsApp account, give the System User access to that account (Business settings → System users → Assign assets), then try again. Polaris can see ${wabas.size} WhatsApp account${wabas.size === 1 ? "" : "s"} (${[...wabas].join(", ") || "none"}) with these numbers: ${visible}.${refused.length ? ` Meta refused to list the numbers in: ${refused.join("; ")} — the access token probably predates that account; generate a new one for the System User and update WHATSAPP_ACCESS_TOKEN.` : ""}`,
      seen: seen.map((n) => `${n.number}${n.name ? ` (${n.name})` : ""}`),
    }, 404);
  }
  const clash = lines.find((l) => l.phone_number_id === found!.id && l.id !== pending.id);
  if (clash) return json({ error: `That number is already in Polaris as "${clash.label}".` }, 409);

  let details: Record<string, any> = {};
  try { details = await phoneDetails(token, found.id); } catch (e) { console.warn("[wa-adopt] details", metaFailure(e)); }
  // Shared with the WhatsApp Business app (Coexistence), or moved fully onto the API?
  const coexist = details.is_on_biz_app === true;
  if (!coexist && String(details.code_verification_status ?? "").toUpperCase() === "NOT_VERIFIED") {
    return json({
      error: `${pending.display_phone} is in WhatsApp Manager but not verified yet. Verify it there with the SMS or call code first, then press this again.`,
    }, 409);
  }
  try { await subscribeWaba(token, found.waba); } catch (e) {
    const f = metaFailure(e);
    return json({ error: `Couldn't subscribe Polaris to that WhatsApp account: ${f.message}`, code: f.code, fbtrace_id: f.fbtrace_id }, 502);
  }

  // A number moved fully onto the API must be registered before it can send or
  // receive. Polaris sets its two-step PIN and keeps it (server-only) for any
  // later re-registration. Never for a Coexistence number — it's registered already.
  let registered = false;
  if (!coexist && details.platform_type !== "CLOUD_API") {
    const { data: kept } = await db.from("wa_line_tokens").select("two_step_pin").eq("line_id", pending.id).maybeSingle();
    const pin = kept?.two_step_pin
      || String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    try {
      await registerNumber(token, found.id, pin);
    } catch (e) {
      const f = metaFailure(e);
      console.error("[wa-adopt] register failed", f.code, f.subcode, f.message, "fbtrace", f.fbtrace_id);
      return json({
        error: `Meta wouldn't register the number: ${f.message}${f.code ? ` (code ${f.code})` : ""}`,
        code: f.code, fbtrace_id: f.fbtrace_id,
      }, 502);
    }
    await db.from("wa_line_tokens").upsert(
      { line_id: pending.id, access_token: null, token_kind: "system_user_env", two_step_pin: pin, updated_at: new Date().toISOString() },
      { onConflict: "line_id" });
    registered = true;
  }

  const { data: line, error } = await db.from("wa_lines").update({
    phone_number_id: found.id, waba_id: found.waba, token_source: "env", status: "connected",
    display_phone: details.display_phone_number ?? found.number ?? pending.display_phone,
    verified_name: details.verified_name ?? found.name ?? null,
    coexistence: coexist,
    onboarded_at: new Date().toISOString(), onboarded_by: access.claims.userId,
    disconnected_at: null, disconnect_reason: null,
    contacts_sync_requested_at: null, contacts_sync_error: null,
    history_sync_requested_at: null, history_sync_error: null, history_progress: null, history_declined: false,
  }).eq("id", pending.id).select("*").single();
  if (error || !line) return json({ error: error?.message ?? "Couldn't save the number" }, 500);

  // The phone's contacts and chat history can only be imported for a number that
  // still runs in the WhatsApp Business app (Coexistence).
  const notCoexist = { ok: false, error: "only for a number still in the WhatsApp Business app" };
  const contacts = coexist ? await runSync(db, line as WaLine, token, "contacts") : notCoexist;
  const history = coexist ? await runSync(db, line as WaLine, token, "history") : notCoexist;
  await logAuditEvent({
    event_type: "ADMIN", module: "communications",
    actor_id: access.claims.userId, actor_email: access.claims.email, actor_role: (access.claims.roleName ?? "admin") as any,
    target_type: "whatsapp_line", target_label: `${line.label} ${line.display_phone ?? ""}`.trim(),
    detail: `WhatsApp number added from WhatsApp Manager — WABA ${found.waba}, phone ${found.id}; ${coexist ? `Coexistence; contacts sync ${contacts.ok ? "requested" : "failed"}, history sync ${history.ok ? "requested" : "failed"}` : `API only${registered ? ", registered by Polaris" : ""}`}`,
    ip_address: request.headers.get("x-forwarded-for"), result: "success",
  } as any);
  return json({
    ok: true, line: { id: line.id, label: line.label, display_phone: line.display_phone },
    platform_type: details.platform_type ?? null, is_on_biz_app: details.is_on_biz_app ?? null, registered, coexistence: coexist,
    contacts, history,
  });
}

// ─── Who can use each number ──────────────────────────────────────────────────

export async function lineMembersHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "communications", level: "admin" });
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => ({}))) as { lineId?: string; userId?: string; level?: "view" | "send" | null };
  if (!body.lineId || !body.userId) return json({ error: "Which number and which person?" }, 400);
  const db = admin();
  const [{ data: line }, { data: person }] = await Promise.all([
    db.from("wa_lines").select("id, label").eq("id", body.lineId).maybeSingle(),
    db.from("user_profiles").select("user_id, display_name, email").eq("user_id", body.userId).maybeSingle(),
  ]);
  if (!line) return json({ error: "Number not found" }, 404);
  if (!person) return json({ error: "Only staff can be given access to a WhatsApp number." }, 400);

  if (body.level === "view" || body.level === "send") {
    const { error } = await db.from("wa_line_members").upsert(
      { line_id: line.id, user_id: person.user_id, level: body.level, added_by: access.claims.userId, added_at: new Date().toISOString() },
      { onConflict: "line_id,user_id" });
    if (error) return json({ error: error.message }, 500);
  } else {
    const { error } = await db.from("wa_line_members").delete().eq("line_id", line.id).eq("user_id", person.user_id);
    if (error) return json({ error: error.message }, 500);
  }
  await logAuditEvent({
    event_type: "PERM", module: "communications",
    actor_id: access.claims.userId, actor_email: access.claims.email, actor_role: (access.claims.roleName ?? "staff") as any,
    target_type: "user", target_label: person.email ?? person.display_name ?? person.user_id,
    detail: `WhatsApp ${line.label}: ${body.level === "send" ? "can read and send" : body.level === "view" ? "can read" : "access removed"}`,
    ip_address: request.headers.get("x-forwarded-for"), result: "success",
  } as any);
  return json({ ok: true });
}

export async function lineUpdateHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "communications", level: "admin" });
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => ({}))) as { lineId?: string; label?: string; autoReplies?: boolean; pauseHours?: number };
  if (!body.lineId) return json({ error: "Which number?" }, 400);
  const patch: Record<string, unknown> = {};
  if (typeof body.label === "string") {
    const label = body.label.trim().slice(0, 80);
    if (!label) return json({ error: "Give the number a name." }, 400);
    patch.label = label;
  }
  if (typeof body.autoReplies === "boolean") patch.auto_replies_enabled = body.autoReplies;
  if (typeof body.pauseHours === "number") {
    if (!Number.isInteger(body.pauseHours) || body.pauseHours < 0 || body.pauseHours > 168) return json({ error: "Pause must be 0–168 hours." }, 400);
    patch.human_pause_hours = body.pauseHours;
  }
  if (!Object.keys(patch).length) return json({ ok: true });
  const { error } = await admin().from("wa_lines").update(patch).eq("id", body.lineId);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
