/**
 * Communications → Reviews — HTTP handlers (dispatched from worker-entry.ts).
 *
 *   POST /api/reviews/google/connect    the Google sign-in URL                  (global admin)
 *   GET  /api/reviews/google/callback   Google's redirect: store the tokens     (signed state)
 *   GET  /api/reviews/status            connection state for the screens        (any brand access)
 *   GET  /api/reviews/google/locations  every Business Profile the account has  (global admin)
 *   POST /api/reviews/brands/link       link a brand to a location              (global admin)
 *   POST /api/reviews/sync              pull now                                (reviews edit)
 *   POST /api/reviews/reply             post or edit a public reply             (reply on that brand)
 *   POST /api/reviews/reply/remove      remove the reply                        (reply on that brand)
 *   POST /api/reviews/draft             AI suggestion — returns text, never posts (reply on that brand)
 *
 * Replies are public, so nothing here posts on its own: only /reply and
 * /reply/remove talk to Google on a reply's behalf, and only when a person
 * presses the button. Google is asked first; the row and the log are written
 * after, so Polaris never shows a reply Google doesn't have.
 */
import Anthropic from "@anthropic-ai/sdk";
import { requireAccess, type AccessClaims } from "@/lib/auth/requireAccess.server";
import {
  admin, googleClient, redirectUri, authUrl, signState, verifyState, exchangeCode, emailFromIdToken,
  listAccounts, listLocations, putReply, deleteReply, parseStoredError, recordConnectionError,
  GoogleError, CONNECTION_KINDS, REPLY_MAX_BYTES, type GLocation,
} from "@/lib/reviews/google.server";
import { syncReviews } from "@/lib/reviews/sync.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A Google failure as a response the screens can explain. */
function googleFailure(e: unknown): Response {
  if (e instanceof GoogleError) {
    const status = CONNECTION_KINDS.includes(e.kind) ? 409 : e.kind === "rate_limited" ? 429 : e.kind === "not_found" ? 404 : 422;
    return json({ error: e.message, kind: e.kind }, status);
  }
  return json({ error: e instanceof Error ? e.message : String(e) }, 500);
}

type Level = "reply" | "view" | null;

/** What this person may do on a brand — the same rule as review_brand_level() in the database. */
async function brandLevel(db: any, claims: AccessClaims, brandId: string): Promise<Level> {
  if (claims.isGlobalAdmin) return "reply";
  const perm = (lvl: string) => db.rpc("has_module_permission", { p_user_id: claims.userId, p_module_name: "reviews", p_min_level: lvl });
  const [edit, view, member] = await Promise.all([
    perm("edit"),
    perm("view"),
    db.from("review_brand_members").select("can_reply").eq("brand_id", brandId).eq("user_id", claims.userId).maybeSingle(),
  ]);
  if (edit.data === true || member.data?.can_reply) return "reply";
  if (view.data === true || member.data) return "view";
  return null;
}

async function anyBrandAccess(db: any, claims: AccessClaims): Promise<boolean> {
  if (claims.isGlobalAdmin) return true;
  const { data } = await db.rpc("has_module_permission", { p_user_id: claims.userId, p_module_name: "reviews", p_min_level: "view" });
  if (data === true) return true;
  const { data: m } = await db.from("review_brand_members").select("brand_id").eq("user_id", claims.userId).limit(1);
  return !!m?.length;
}

async function body(request: Request): Promise<any> {
  return request.json().catch(() => ({}));
}

// ─── Connection ───────────────────────────────────────────────────────────────

export type ConnectionState = "not_configured" | "not_connected" | "reconnect" | "waiting" | "error" | "connected";

export async function reviewsStatusHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request);
  if (!access.ok) return access.response;
  const db = admin();
  if (!(await anyBrandAccess(db, access.claims))) return json({ error: "You don't have access to Reviews." }, 403);

  const isAdmin = access.claims.isGlobalAdmin;
  const configured = !!googleClient();
  let { data: conn } = await db.from("google_business_connection")
    .select("google_email, connected_at, last_error, last_error_at").eq("id", 1).maybeSingle();

  // Check now (Setup tab): one cheap call to see whether Google answers yet.
  const probe = new URL(request.url).searchParams.get("probe") === "1";
  if (probe && isAdmin && configured && conn) {
    try {
      await listAccounts(db);
      await recordConnectionError(db, null);
    } catch { /* the error is recorded on the connection */ }
    ({ data: conn } = await db.from("google_business_connection")
      .select("google_email, connected_at, last_error, last_error_at").eq("id", 1).maybeSingle());
  }

  const error = parseStoredError(conn?.last_error);
  const state: ConnectionState = !configured ? "not_configured"
    : !conn ? "not_connected"
    : error?.kind === "reconnect" || error?.kind === "not_configured" ? "reconnect"
    : error?.kind === "pending_approval" || error?.kind === "api_disabled" ? "waiting"
    : error ? "error"
    : "connected";

  return json({
    state,
    configured,
    connected: !!conn,
    google_email: conn?.google_email ?? null,
    connected_at: conn?.connected_at ?? null,
    error: error ? { ...error, at: conn?.last_error_at ?? null } : null,
    is_admin: isAdmin,
    // Admin-only setup detail: names of the secrets, never their values.
    ...(isAdmin ? {
      secrets: {
        GOOGLE_BUSINESS_CLIENT_ID: !!process.env.GOOGLE_BUSINESS_CLIENT_ID,
        GOOGLE_BUSINESS_CLIENT_SECRET: !!process.env.GOOGLE_BUSINESS_CLIENT_SECRET,
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      },
      redirect_uri: redirectUri(),
    } : {}),
  });
}

export async function reviewsConnectHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { adminOnly: true });
  if (!access.ok) return access.response;
  if (!googleClient()) {
    return json({ error: "Google isn't set up yet — the Google OAuth client (GOOGLE_BUSINESS_CLIENT_ID / SECRET) still needs adding to Polaris.", kind: "not_configured" }, 409);
  }
  return json({ url: authUrl(await signState(access.claims.userId)) });
}

const page = (title: string, message: string, status = 400) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:0 16px;line-height:1.6;color:#1B2A4A">
<h1 style="font-size:22px">${title}</h1><p>${message.replace(/</g, "&lt;")}</p>
<p><a href="/polaris-redesign?screen=reviews">Back to Reviews</a></p></body>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

export async function reviewsCallbackHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const googleError = url.searchParams.get("error");
  if (googleError) {
    return page("Google wasn't connected", googleError === "access_denied"
      ? "The Google sign-in was cancelled. Nothing changed — try Connect again when you're ready."
      : `Google said: ${googleError}`);
  }
  if (!googleClient()) return page("Google isn't set up yet", "The Google OAuth client still needs adding to Polaris.", 503);

  const userId = await verifyState(url.searchParams.get("state"));
  if (!userId) return page("That link has expired", "The connect link is only valid for 10 minutes. Go back to Reviews → Setup and press Connect again.");
  const db = admin();
  const { data: isAdmin } = await db.rpc("is_polaris_global_admin", { p_user_id: userId });
  if (isAdmin !== true) return page("Not allowed", "Only a Polaris admin can connect the Google account.", 403);

  const code = url.searchParams.get("code");
  if (!code) return page("Google wasn't connected", "Google didn't send back a sign-in code.");

  try {
    const tokens = await exchangeCode(code);
    const { data: existing } = await db.from("google_business_connection").select("refresh_token").eq("id", 1).maybeSingle();
    const refresh = tokens.refresh_token ?? existing?.refresh_token;
    if (!refresh) {
      return page("Google wasn't connected",
        "Google didn't grant offline access. Remove Polaris from the Google account's third-party access, then press Connect again.");
    }
    const { error } = await db.from("google_business_connection").upsert({
      id: 1,
      google_email: emailFromIdToken(tokens.id_token),
      refresh_token: refresh,
      access_token: tokens.access_token,
      access_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      scope: tokens.scope ?? null,
      connected_by: userId,
      connected_at: new Date().toISOString(),
      last_error: null,
      last_error_at: null,
    }, { onConflict: "id" });
    if (error) throw new Error(error.message);
  } catch (e) {
    return page("Google wasn't connected", e instanceof Error ? e.message : String(e), 502);
  }
  return new Response(null, { status: 302, headers: { Location: "/polaris-redesign?screen=reviews" } });
}

// ─── Linking brands ───────────────────────────────────────────────────────────

export async function reviewsLocationsHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { adminOnly: true });
  if (!access.ok) return access.response;
  const db = admin();
  try {
    const accounts = await listAccounts(db);
    const locations: GLocation[] = [];
    for (const a of accounts) locations.push(...await listLocations(db, a.name));
    await recordConnectionError(db, null);
    return json({ accounts: accounts.map((a) => ({ name: a.name, title: a.accountName ?? a.name, type: a.type ?? null })), locations });
  } catch (e) {
    return googleFailure(e);
  }
}

export async function reviewsLinkHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { adminOnly: true });
  if (!access.ok) return access.response;
  const b = await body(request);
  const brandId = typeof b.brand_id === "string" ? b.brand_id : "";
  if (!brandId) return json({ error: "Which brand?" }, 400);
  const db = admin();
  const { data: brand } = await db.from("review_brands").select("id, google_location").eq("id", brandId).maybeSingle();
  if (!brand) return json({ error: "That brand doesn't exist." }, 404);

  const unlink = !b.location;
  const loc = unlink ? null : b.location as Partial<GLocation>;
  if (loc && (typeof loc.account !== "string" || !/^accounts\/[^/]+$/.test(loc.account) || typeof loc.name !== "string" || !/^locations\/[^/]+$/.test(loc.name))) {
    return json({ error: "That isn't a Business Profile location." }, 400);
  }

  const moved = brand.google_location && brand.google_location !== (loc?.name ?? null);
  const { error } = await db.from("review_brands").update({
    google_account: loc?.account ?? null,
    google_location: loc?.name ?? null,
    location_title: loc?.title ?? null,
    location_address: loc?.address ?? null,
    place_id: loc?.place_id ?? null,
    maps_url: loc?.maps_url ?? null,
    new_review_url: loc?.new_review_url ?? null,
    ...(moved || unlink ? { average_rating: null, total_reviews: null, last_synced_at: null, last_sync_error: null } : {}),
    ...(moved || !brand.google_location ? { backfilled: false } : {}),
  }).eq("id", brandId);
  if (error) {
    return json({ error: /duplicate|unique/i.test(error.message) ? "That location is already linked to another brand." : error.message }, 409);
  }
  // Reviews from the old listing stay (with their reply history) but drop out of the inbox.
  if (moved) await db.from("reviews").update({ removed_at: new Date().toISOString() }).eq("brand_id", brandId).is("removed_at", null);

  if (unlink) return json({ ok: true });
  // Pull straight away; Google may still be waiting for approval, which is fine.
  const sync = await syncReviews({ brandId, full: true });
  return json({ ok: true, sync });
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export async function reviewsSyncHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "reviews", level: "edit" });
  if (!access.ok) return access.response;
  return json(await syncReviews({ full: true }));
}

// ─── Replies ──────────────────────────────────────────────────────────────────

async function loadReview(db: any, reviewId: unknown) {
  if (typeof reviewId !== "string" || !reviewId) return null;
  const { data } = await db.from("reviews")
    .select("*, brand:brand_id(id, name, google_account, google_location)").eq("id", reviewId).maybeSingle();
  return data;
}

async function log(db: any, reviewId: string, userId: string, action: "post" | "edit" | "remove", text: string | null, ok: boolean, error?: string) {
  const { error: e } = await db.from("review_reply_log").insert({ review_id: reviewId, user_id: userId, action, text, ok, error: error ?? null });
  if (e) console.error("[reviews] reply log:", e.message);
}

export async function reviewsReplyHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request);
  if (!access.ok) return access.response;
  const b = await body(request);
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text) return json({ error: "Write a reply first." }, 400);
  if (new TextEncoder().encode(text).length > REPLY_MAX_BYTES) return json({ error: "That reply is too long for Google — keep it under about 4,000 characters." }, 400);

  const db = admin();
  const review = await loadReview(db, b.review_id);
  if (!review) return json({ error: "That review doesn't exist." }, 404);
  if ((await brandLevel(db, access.claims, review.brand_id)) !== "reply") return json({ error: "You can read this brand's reviews but not reply to them." }, 403);
  if (review.removed_at) return json({ error: "Google no longer shows this review, so it can't be answered." }, 409);
  if (!review.brand?.google_account || !review.brand?.google_location) return json({ error: "This brand isn't linked to Google any more." }, 409);

  const action = review.reply_text ? "edit" : "post";
  try {
    const reply = await putReply(db, review.brand.google_account, review.brand.google_location, review.google_review_id, text);
    await db.from("reviews").update({
      reply_text: reply.comment,
      reply_updated_at: reply.updateTime ?? new Date().toISOString(),
      replied_by: access.claims.userId,
    }).eq("id", review.id);
    await log(db, review.id, access.claims.userId, action, reply.comment, true);
    return json({ ok: true, reply_text: reply.comment, reply_updated_at: reply.updateTime });
  } catch (e) {
    await log(db, review.id, access.claims.userId, action, text, false, e instanceof Error ? e.message : String(e));
    return googleFailure(e);
  }
}

export async function reviewsReplyRemoveHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request);
  if (!access.ok) return access.response;
  const b = await body(request);
  const db = admin();
  const review = await loadReview(db, b.review_id);
  if (!review) return json({ error: "That review doesn't exist." }, 404);
  if ((await brandLevel(db, access.claims, review.brand_id)) !== "reply") return json({ error: "You can read this brand's reviews but not reply to them." }, 403);
  if (!review.reply_text) return json({ ok: true });
  if (!review.brand?.google_account || !review.brand?.google_location) return json({ error: "This brand isn't linked to Google any more." }, 409);

  try {
    await deleteReply(db, review.brand.google_account, review.brand.google_location, review.google_review_id);
  } catch (e) {
    // Already gone on Google is what we wanted anyway.
    if (!(e instanceof GoogleError && e.kind === "not_found")) {
      await log(db, review.id, access.claims.userId, "remove", review.reply_text, false, e instanceof Error ? e.message : String(e));
      return googleFailure(e);
    }
  }
  await db.from("reviews").update({ reply_text: null, reply_updated_at: null, replied_by: null }).eq("id", review.id);
  await log(db, review.id, access.claims.userId, "remove", review.reply_text, true);
  return json({ ok: true });
}

// ─── AI draft ─────────────────────────────────────────────────────────────────

const BRAND_VOICE: Record<string, string> = {
  "JLS Yacht Training Institute":
    "a maritime training institute in the UAE running yachting and crew courses. Warm, encouraging and professional — proud of its students and instructors.",
  "JLS Yachts":
    "a yacht services company in the UAE (agency, management, crew and support for yachts). Courteous, professional and service-minded.",
  "Superyacht ME":
    "a superyacht agency across the Middle East (port calls, clearances, berthing and local support). Polished, discreet and personal.",
};

const DRAFT_RULES = `Write the public reply the business will post under this Google review.

Rules:
- Reply in the same language the review is written in.
- 2–5 sentences, roughly 40–110 words. Plain text only: no markdown, no quotation marks around the reply, no subject line, no sign-off placeholders like [Name].
- Thank the reviewer. Use their first name only if they gave one.
- Refer to what they actually said. Never invent facts — no names of staff, courses, dates, prices, vessels, places or promises that aren't in the review.
- Never offer discounts, refunds, credits, free services or any compensation, and never admit legal fault.
- For a negative or mixed review: acknowledge it sincerely, apologise for their experience without arguing, and invite them to contact the team directly so it can be put right. Don't invent a phone number, email or person to contact.
- For a rating with no comment: a short, genuine thank-you.
- Never mention that the reply was written by AI.`;

export async function reviewsDraftHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request);
  if (!access.ok) return access.response;
  const b = await body(request);
  const db = admin();
  const review = await loadReview(db, b.review_id);
  if (!review) return json({ error: "That review doesn't exist." }, 404);
  if ((await brandLevel(db, access.claims, review.brand_id)) !== "reply") return json({ error: "You can read this brand's reviews but not reply to them." }, 403);
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "AI drafting isn't set up yet." }, 503);

  const brandName: string = review.brand?.name ?? "the business";
  const guidance = typeof b.guidance === "string" ? b.guidance.trim().slice(0, 500) : "";
  const prompt = [
    `You are replying on behalf of ${brandName}, ${BRAND_VOICE[brandName] ?? "a yachting business in the UAE. Professional and courteous."}`,
    DRAFT_RULES,
    `Review (${review.star_rating ?? "?"} out of 5 stars) by ${review.reviewer_anonymous ? "an anonymous reviewer" : review.reviewer_name ?? "a customer"}:`,
    `<review>\n${(review.comment ?? "").slice(0, 4000) || "(no comment, rating only)"}\n</review>`,
    review.reply_text ? `The current reply, which is being rewritten:\n<current_reply>\n${review.reply_text}\n</current_reply>` : "",
    guidance ? `The team member adds this guidance — follow it unless it breaks a rule above:\n<guidance>\n${guidance}\n</guidance>` : "",
    "Return only the reply text.",
  ].filter(Boolean).join("\n\n");

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 });
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      // A short reply: keep thinking light.
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") return json({ error: "No suggestion for this one — please write the reply yourself." }, 422);
    const text = response.content
      .filter((c): c is Anthropic.Beta.BetaTextBlock => c.type === "text")
      .map((c) => c.text).join("").trim()
      .replace(/^["“]|["”]$/g, "").trim();
    if (!text) return json({ error: "No suggestion came back — try again." }, 502);
    return json({ text });
  } catch (e) {
    return json({ error: `Couldn't draft a reply: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }
}
