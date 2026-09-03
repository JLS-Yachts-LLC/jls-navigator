/**
 * Secure document delivery — the one way a document leaves the business.
 *
 * Instead of putting a storage URL in an email, we issue a *share*: a tokenised
 * pointer at a stored file, with a stated expiry, recorded against whoever it was
 * sent to. The client gets a link to the branded landing page (`/d/<token>`),
 * which names the document before it opens it and records every access.
 *
 * Everything here runs with the service role: the recipient is anonymous, so the
 * unguessable token is the only credential, exactly as the e-Sign signing flow
 * works (see `esign.server.ts`).
 */
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** How long a share stays valid unless the caller says otherwise. */
export const DEFAULT_SHARE_TTL_DAYS = 30;

/**
 * The signed URL behind the button. Deliberately brief: it exists only for the
 * seconds between clicking and the file arriving, and is never the thing we send.
 */
const OPEN_TTL_SECONDS = 5 * 60;

export interface ShareRequest {
  /** "<bucket>/<path>" as stored on the record (see `storageRef`). */
  storageRef: string;
  /** What this document is, e.g. "Navigation License". Shown to the recipient. */
  title: string;
  /** The document's own number — permit no, licence no, invoice ref. */
  reference?: string | null;
  /** Why they are receiving it, in a sentence. */
  purpose?: string | null;
  vesselName?: string | null;
  recipientEmail?: string | null;
  filename?: string | null;
  /** Where it came from, e.g. ("permits", <permit id>). */
  sourceTable?: string | null;
  sourceId?: string | null;
  ttlDays?: number;
  createdBy?: string | null;
}

export interface ShareResult {
  token: string;
  /** The link that goes in the email — the landing page, never storage. */
  url: string;
  expiresAt: string;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function reqMeta(): { ip: string | null; ua: string | null; origin: string | null } {
  try {
    const h = getRequest().headers;
    const ip =
      h.get("cf-connecting-ip") ||
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    let origin: string | null = null;
    try { origin = new URL(getRequest().url).origin; } catch { /* ignore */ }
    return { ip, ua: h.get("user-agent"), origin };
  } catch {
    return { ip: null, ua: null, origin: null };
  }
}

/**
 * The domain client links are built on. `polaris.jlsyachts.com` is the intended
 * public face; until DNS points at the Worker, VITE_APP_URL keeps links working
 * on whatever host is actually serving.
 */
export function shareBaseUrl(origin?: string | null): string {
  return (
    (process.env.DOCUMENT_SHARE_BASE_URL as string | undefined) ||
    (process.env.VITE_APP_URL as string | undefined) ||
    origin ||
    "https://jls-navigator.m-peeters-4a0.workers.dev"
  ).replace(/\/$/, "");
}

function filenameOf(storageRef: string): string {
  const last = storageRef.split("/").pop() ?? "document";
  try { return decodeURIComponent(last.split("?")[0]); } catch { return last.split("?")[0]; }
}

/** Issue a share and return the link to put in front of the client. */
export async function createDocumentShare(req: ShareRequest): Promise<ShareResult> {
  const ttlDays = req.ttlDays ?? DEFAULT_SHARE_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const token = randomToken();

  const { error } = await (supabaseAdmin as any).from("document_shares").insert([{
    token,
    storage_ref: req.storageRef,
    filename: req.filename ?? filenameOf(req.storageRef),
    title: req.title,
    reference: req.reference ?? null,
    purpose: req.purpose ?? null,
    vessel_name: req.vesselName ?? null,
    recipient_email: req.recipientEmail ?? null,
    source_table: req.sourceTable ?? null,
    source_id: req.sourceId ?? null,
    expires_at: expiresAt,
    created_by: req.createdBy ?? null,
  }]);
  if (error) throw new Error(`Could not create the document link: ${error.message}`);

  const { origin } = reqMeta();
  return { token, url: `${shareBaseUrl(origin)}/d/${token}`, expiresAt };
}

export type ShareState = "ok" | "expired" | "revoked" | "not_found";

/** The columns of `document_shares` this module actually reads. */
interface ShareRow {
  id: string;
  storage_ref: string;
  filename: string | null;
  title: string;
  reference: string | null;
  purpose: string | null;
  vessel_name: string | null;
  expires_at: string;
  revoked_at: string | null;
  access_count: number;
  first_accessed_at: string | null;
}

export interface ShareView {
  state: ShareState;
  title?: string;
  reference?: string | null;
  purpose?: string | null;
  vesselName?: string | null;
  filename?: string | null;
  expiresAt?: string;
}

/**
 * What the landing page shows. Records the visit, but does not mint a URL for the
 * file — that only happens when the recipient actually asks for it.
 */
export async function viewDocumentShare(token: string): Promise<ShareView> {
  const share = await loadShare(token);
  if (typeof share === "string") return { state: share };

  await recordAccess(share.id, "viewed");
  return {
    state: "ok",
    title: share.title,
    reference: share.reference,
    purpose: share.purpose,
    vesselName: share.vessel_name,
    filename: share.filename,
    expiresAt: share.expires_at,
  };
}

/**
 * Resolve a share to a short-lived signed URL, recording the download. Returns
 * null when the share is not usable, so callers give nothing away about why.
 */
export async function openDocumentShare(token: string): Promise<{ url: string; filename: string } | null> {
  const share = await loadShare(token);
  if (typeof share === "string") return null;

  const ref = String(share.storage_ref);
  const slash = ref.indexOf("/");
  if (slash <= 0) return null;
  const bucket = ref.slice(0, slash);
  const path = ref.slice(slash + 1);

  const { data, error } = await (supabaseAdmin as any).storage
    .from(bucket)
    .createSignedUrl(path, OPEN_TTL_SECONDS, { download: share.filename ?? undefined });
  if (error || !data?.signedUrl) return null;

  await recordAccess(share.id, "downloaded");
  return { url: data.signedUrl as string, filename: share.filename ?? filenameOf(ref) };
}

async function loadShare(token: string): Promise<ShareRow | ShareState> {
  if (!token || !/^[a-f0-9]{16,96}$/i.test(token)) return "not_found";
  const { data } = await (supabaseAdmin as any)
    .from("document_shares").select("*").eq("token", token).maybeSingle();
  if (!data) return "not_found";
  if (data.revoked_at) return "revoked";
  if (new Date(data.expires_at) < new Date()) return "expired";
  return data;
}

async function recordAccess(shareId: string, action: "viewed" | "downloaded") {
  const { ip, ua } = reqMeta();
  const sb = supabaseAdmin as any;
  // Best-effort: a failure to write the audit row must not stop the client
  // reaching a document they are entitled to.
  try {
    await sb.from("document_share_access").insert([{
      share_id: shareId, action, ip_address: ip, user_agent: ua,
    }]);
    const { data: current } = await sb
      .from("document_shares").select("access_count, first_accessed_at").eq("id", shareId).maybeSingle();
    const now = new Date().toISOString();
    await sb.from("document_shares").update({
      access_count: (current?.access_count ?? 0) + 1,
      first_accessed_at: current?.first_accessed_at ?? now,
      last_accessed_at: now,
    }).eq("id", shareId);
  } catch (e) {
    console.error("[document-share] could not record access:", e);
  }
}

// ── Email presentation ────────────────────────────────────────────────────────

/**
 * The button that replaces the raw URL in outgoing mail. A long storage link
 * reads as suspicious; a named document with a stated expiry does not.
 */
export function documentButtonHtml(opts: {
  url: string;
  title: string;
  reference?: string | null;
  purpose?: string | null;
  expiresAt: string;
}): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const expiry = new Date(opts.expiresAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  return `
  <table cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse;width:100%">
    <tr><td style="padding:16px 18px;border:1px solid #dfe5ea;border-radius:8px;background:#f8fafc">
      <div style="font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#64748b">Secure document</div>
      <div style="margin-top:4px;font-size:15px;font-weight:600;color:#0f172a">${esc(opts.title)}</div>
      ${opts.reference ? `<div style="margin-top:2px;font-size:13px;color:#4a5b68">Reference: ${esc(opts.reference)}</div>` : ""}
      ${opts.purpose ? `<div style="margin-top:6px;font-size:13px;line-height:1.5;color:#4a5b68">${esc(opts.purpose)}</div>` : ""}
      <div style="margin-top:14px">
        <a href="${esc(opts.url)}"
           style="display:inline-block;padding:11px 18px;background:#07435e;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px">
          View or Download Document Securely
        </a>
      </div>
      <div style="margin-top:10px;font-size:12px;color:#7d8b96">
        This link is for you only and expires on ${esc(expiry)}. If it has expired, reply to this email and we will send a new one.
      </div>
    </td></tr>
  </table>`;
}

/** Plain-text equivalent, for the text part of the same message. */
export function documentButtonText(opts: {
  url: string;
  title: string;
  reference?: string | null;
  expiresAt: string;
}): string {
  const expiry = new Date(opts.expiresAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
  return [
    "",
    `Secure document: ${opts.title}${opts.reference ? ` (${opts.reference})` : ""}`,
    `View or download: ${opts.url}`,
    `This link is for you only and expires on ${expiry}.`,
  ].join("\n");
}
