/**
 * Communications → Reviews — the Google Business Profile API, by plain fetch
 * (no googleapis SDK: this runs in a Cloudflare Worker).
 *
 * One Google account manages every JLS brand's Business Profile. Its refresh
 * token lives in google_business_connection (server-only); the access token and
 * its expiry are cached there too, so every request and the 15-minute sync share
 * one token.
 *
 * Until Google approves the project's API access, every call fails with a 429
 * "quota limit 0" (or a 403 "API not enabled"). Those come back as a
 * GoogleError of kind "pending_approval" / "api_disabled" with a plain-English
 * message, so the screens can say "waiting for Google" rather than crash.
 */
import { createClient } from "@supabase/supabase-js";
import { appBaseUrl } from "@/lib/app-url.server";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const ACCOUNTS_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const REVIEWS_API = "https://mybusiness.googleapis.com/v4";

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/business.manage openid email";
/** Google's limit on a reply's length. */
export const REPLY_MAX_BYTES = 4096;

export function admin(): any {
  return createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}

export function googleClient(): { id: string; secret: string } | null {
  const id = process.env.GOOGLE_BUSINESS_CLIENT_ID;
  const secret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

export function redirectUri(): string {
  return process.env.GOOGLE_BUSINESS_REDIRECT_URI ?? `${appBaseUrl()}/api/reviews/google/callback`;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export type GoogleErrorKind =
  | "not_configured"   // the OAuth client secrets aren't in the Worker yet
  | "not_connected"    // nobody has pressed Connect
  | "reconnect"        // the refresh token was revoked or expired
  | "pending_approval" // Google hasn't approved API access (quota 0)
  | "api_disabled"     // an API isn't switched on in Google Cloud
  | "rate_limited"
  | "forbidden"        // the connected account can't manage that listing
  | "not_found"
  | "other";

/** Kinds that mean the whole connection is unusable, not just one request. */
export const CONNECTION_KINDS: GoogleErrorKind[] = ["not_configured", "not_connected", "reconnect", "pending_approval", "api_disabled"];

export class GoogleError extends Error {
  constructor(public kind: GoogleErrorKind, message: string, public status = 0) {
    super(message);
  }
}

const API_NAMES: Record<string, string> = {
  "mybusinessaccountmanagement.googleapis.com": "My Business Account Management API",
  "mybusinessbusinessinformation.googleapis.com": "My Business Business Information API",
  "mybusiness.googleapis.com": "Google My Business API",
};

/** Turn one of Google's error responses into something a person can act on. */
function toGoogleError(status: number, body: any, url: string): GoogleError {
  const err = body?.error ?? {};
  const message: string = typeof err === "string" ? err : err.message ?? "";
  const details: any[] = Array.isArray(err.details) ? err.details : [];
  const info = details.find((d) => typeof d?.reason === "string") ?? {};
  const reason: string = info.reason ?? err.status ?? "";
  const meta = info.metadata ?? {};
  const host = (() => { try { return new URL(url).host; } catch { return ""; } })();
  const api = API_NAMES[meta.service ?? host] ?? "Business Profile API";

  if (status === 429 || reason === "RATE_LIMIT_EXCEEDED" || reason === "RESOURCE_EXHAUSTED") {
    // Before Google approves access, the project's quota is literally 0.
    if (String(meta.quota_limit_value ?? "") === "0" || /limit\s*'?0'?\b|quota.*\b0\b/i.test(message) || status === 429 && !meta.quota_limit_value) {
      return new GoogleError("pending_approval",
        "Waiting for Google to approve API access for Polaris — reviews will appear once it does.", status);
    }
    return new GoogleError("rate_limited", "Google is limiting requests right now — try again in a minute.", status);
  }
  if (status === 403 && (reason === "SERVICE_DISABLED" || reason === "accessNotConfigured" || /has not been used|is disabled/i.test(message))) {
    return new GoogleError("api_disabled",
      `The ${api} isn't switched on in Google Cloud yet — waiting for Google setup.`, status);
  }
  if (status === 401) {
    return new GoogleError("reconnect", "Google signed Polaris out — reconnect the Google account in Reviews → Setup.", status);
  }
  if (status === 403) {
    return new GoogleError("forbidden",
      "The connected Google account isn't allowed to manage this Business Profile — check it's an owner or manager of the listing.", status);
  }
  if (status === 404) return new GoogleError("not_found", "Google couldn't find that listing or review — it may have been removed.", status);
  return new GoogleError("other", `Google returned an error (${status})${message ? `: ${message}` : ""}`, status);
}

/** Store a connection-level error as "[kind] message" so the Setup tab can show it. */
export async function recordConnectionError(db: any, e: GoogleError | null): Promise<void> {
  await db.from("google_business_connection").update(e
    ? { last_error: `[${e.kind}] ${e.message}`, last_error_at: new Date().toISOString() }
    : { last_error: null, last_error_at: null }).eq("id", 1);
}

export function parseStoredError(s: string | null | undefined): { kind: GoogleErrorKind; message: string } | null {
  if (!s) return null;
  const m = /^\[(\w+)\]\s*([\s\S]*)$/.exec(s);
  return m ? { kind: m[1] as GoogleErrorKind, message: m[2] } : { kind: "other", message: s };
}

// ─── OAuth state (the callback is a browser navigation, no Bearer token) ──────

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function hmac(data: string): Promise<string> {
  const c = googleClient();
  if (!c) throw new GoogleError("not_configured", "Google isn't set up yet.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`reviews-oauth:${c.secret}`),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))));
}

export async function signState(userId: string): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ u: userId, exp: Date.now() + 10 * 60_000, n: crypto.randomUUID() })));
  return `${payload}.${await hmac(payload)}`;
}

/** The user id the state was issued to, or null if it's forged or older than 10 minutes. */
export async function verifyState(state: string | null): Promise<string | null> {
  if (!state) return null;
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = await hmac(payload);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return typeof p.u === "string" && typeof p.exp === "number" && p.exp > Date.now() ? p.u : null;
  } catch {
    return null;
  }
}

export function authUrl(state: string): string {
  const c = googleClient();
  if (!c) throw new GoogleError("not_configured", "Google isn't set up yet.");
  const params = new URLSearchParams({
    client_id: c.id,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Swap the callback's code for tokens. */
export async function exchangeCode(code: string): Promise<{
  access_token: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string;
}> {
  const c = googleClient();
  if (!c) throw new GoogleError("not_configured", "Google isn't set up yet.");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri(), grant_type: "authorization_code",
    }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    throw new GoogleError("other", `Google didn't accept the sign-in (${j.error_description ?? j.error ?? res.status}).`, res.status);
  }
  return j;
}

/** The email in Google's id_token (read only — it came straight from Google over TLS). */
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(idToken.split(".")[1] ?? "")));
    return typeof p.email === "string" ? p.email : null;
  } catch {
    return null;
  }
}

// ─── Access token ─────────────────────────────────────────────────────────────

/** A valid access token, refreshing (and caching) it when it's within a minute of expiry. */
export async function accessToken(db: any): Promise<string> {
  const c = googleClient();
  if (!c) throw new GoogleError("not_configured", "Google isn't set up yet — the Google OAuth client hasn't been added to Polaris.");
  const { data: conn } = await db.from("google_business_connection")
    .select("refresh_token, access_token, access_expires_at").eq("id", 1).maybeSingle();
  if (!conn?.refresh_token) throw new GoogleError("not_connected", "No Google account is connected yet.");
  if (conn.access_token && conn.access_expires_at && new Date(conn.access_expires_at).getTime() > Date.now() + 60_000) {
    return conn.access_token;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.id, client_secret: c.secret, refresh_token: conn.refresh_token, grant_type: "refresh_token",
    }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    const e = j.error === "invalid_grant"
      ? new GoogleError("reconnect", "Google no longer accepts Polaris's sign-in (it was revoked or expired) — reconnect the Google account in Reviews → Setup.", res.status)
      : j.error === "invalid_client" || j.error === "unauthorized_client"
        ? new GoogleError("not_configured", "Google didn't recognise Polaris's OAuth client — check GOOGLE_BUSINESS_CLIENT_ID / SECRET.", res.status)
        : new GoogleError("other", `Couldn't refresh the Google sign-in (${j.error_description ?? j.error ?? res.status}).`, res.status);
    await recordConnectionError(db, e);
    throw e;
  }
  await db.from("google_business_connection").update({
    access_token: j.access_token,
    access_expires_at: new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString(),
  }).eq("id", 1);
  return j.access_token;
}

async function call<T = any>(db: any, url: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken(db);
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const text = await res.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return { error: { message: text.slice(0, 300) } }; } })() : {};
  if (!res.ok) {
    const e = toGoogleError(res.status, body, url);
    if (CONNECTION_KINDS.includes(e.kind)) await recordConnectionError(db, e);
    throw e;
  }
  return body as T;
}

// ─── Accounts, locations, reviews ─────────────────────────────────────────────

export interface GAccount { name: string; accountName?: string; type?: string; role?: string }
export interface GLocation {
  account: string;            // accounts/123
  name: string;               // locations/456
  title: string | null;
  address: string | null;
  place_id: string | null;
  maps_url: string | null;
  new_review_url: string | null;
}

export async function listAccounts(db: any): Promise<GAccount[]> {
  const out: GAccount[] = [];
  let pageToken = "";
  for (let i = 0; i < 10; i++) {
    const j: any = await call(db, `${ACCOUNTS_API}/accounts?pageSize=20${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
    out.push(...((j.accounts ?? []) as GAccount[]));
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return out;
}

const addressLine = (a: any): string | null => {
  if (!a) return null;
  const parts = [...(a.addressLines ?? []), a.locality, a.administrativeArea, a.regionCode].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
};

export async function listLocations(db: any, account: string): Promise<GLocation[]> {
  const out: GLocation[] = [];
  let pageToken = "";
  for (let i = 0; i < 10; i++) {
    const j: any = await call(db,
      `${INFO_API}/${account}/locations?readMask=name,title,storefrontAddress,metadata&pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
    for (const l of (j.locations ?? []) as any[]) {
      out.push({
        account,
        name: l.name,
        title: l.title ?? null,
        address: addressLine(l.storefrontAddress),
        place_id: l.metadata?.placeId ?? null,
        maps_url: l.metadata?.mapsUri ?? null,
        new_review_url: l.metadata?.newReviewUri ?? null,
      });
    }
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return out;
}

export interface GReview {
  reviewId: string;
  name?: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
  starRating?: "STAR_RATING_UNSPECIFIED" | "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
}

export interface GReviewPage {
  reviews: GReview[];
  averageRating: number | null;
  totalReviewCount: number | null;
  nextPageToken: string | null;
}

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
export const starNumber = (s: string | undefined): number | null => (s ? STARS[s] ?? null : null);

/** "accounts/1/locations/2" from the stored account + location. */
export const locationPath = (account: string, location: string) =>
  `${account.replace(/\/$/, "")}/${location.replace(/^accounts\/[^/]+\//, "")}`;

/** One page of a location's reviews, newest change first. */
export async function listReviews(db: any, account: string, location: string, pageToken?: string | null): Promise<GReviewPage> {
  const qs = `pageSize=50&orderBy=${encodeURIComponent("updateTime desc")}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
  const j: any = await call(db, `${REVIEWS_API}/${locationPath(account, location)}/reviews?${qs}`);
  return {
    reviews: (j.reviews ?? []) as GReview[],
    averageRating: typeof j.averageRating === "number" ? j.averageRating : null,
    totalReviewCount: typeof j.totalReviewCount === "number" ? j.totalReviewCount : null,
    nextPageToken: j.nextPageToken ?? null,
  };
}

const replyUrl = (account: string, location: string, reviewId: string) =>
  `${REVIEWS_API}/${locationPath(account, location)}/reviews/${encodeURIComponent(reviewId)}/reply`;

/** Post or replace the public reply. Returns Google's copy of it. */
export async function putReply(db: any, account: string, location: string, reviewId: string, comment: string): Promise<{ comment: string; updateTime: string | null }> {
  if (new TextEncoder().encode(comment).length > REPLY_MAX_BYTES) {
    throw new GoogleError("other", "That reply is too long for Google — keep it under about 4,000 characters.");
  }
  const j: any = await call(db, replyUrl(account, location, reviewId), { method: "PUT", body: JSON.stringify({ comment }) });
  return { comment: j.comment ?? comment, updateTime: j.updateTime ?? null };
}

export async function deleteReply(db: any, account: string, location: string, reviewId: string): Promise<void> {
  await call(db, replyUrl(account, location, reviewId), { method: "DELETE" });
}
