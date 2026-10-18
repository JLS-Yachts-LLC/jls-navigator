/**
 * Signatory authorisation — a JLS signatory's stored signature is only ever put on a
 * document with their permission. Server-only (service role).
 *
 * Every company-signature stamp in Polaris goes through here:
 *   • requestSignatoryUse  — when a document is sent / a form submitted / a campaign
 *     goes out. The signatory themself and (for a signatory set to "authorised users")
 *     their authorised users are approved at once; in "every use needs my approval"
 *     mode the signatory gets an approve-use request (email + bell) and nothing is
 *     stamped until they approve; anyone else is refused.
 *   • findApprovedUse      — at the moment of stamping. No approved use for THIS
 *     signatory, THIS document and THIS exact file (fingerprint) → no signature.
 *     Editing the document's fields or swapping its file afterwards gets nowhere.
 *   • markApplied / logRefusedUse — the usage log shown on the signatory's page.
 *
 * jls_signatory_uses has no write policy for staff, so a row can't be forged from
 * the browser.
 */
import { sendEmail } from "@/lib/ses.server";

const ANCHOR_SENDER = process.env.ANCHOR_MAIL_SENDER ?? "anchor@jlsyachts.com";
const ESIGN_BUCKET = "esign-documents";

export type UseTarget =
  | { kind: "esign"; documentId: string }
  | { kind: "form"; submissionId: string }
  | { kind: "campaign"; campaignId: string };

export type Requester = { userId: string; email: string; name?: string | null };

export type UseResult = {
  status: "approved" | "pending" | "refused";
  signatoryId: string;
  signatoryName: string;
  useId?: string;
  reason?: string;
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function targetColumns(t: UseTarget) {
  return {
    esign_document_id: t.kind === "esign" ? t.documentId : null,
    form_submission_id: t.kind === "form" ? t.submissionId : null,
    campaign_id: t.kind === "campaign" ? t.campaignId : null,
  };
}

function scopeToTarget(q: any, t: UseTarget) {
  if (t.kind === "esign") return q.eq("esign_document_id", t.documentId);
  if (t.kind === "form") return q.eq("form_submission_id", t.submissionId);
  return q.eq("campaign_id", t.campaignId).is("esign_document_id", null);
}

// ── fingerprints ─────────────────────────────────────────────────────────────

export async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fileHash(sb: any, bucket: string, path: string): Promise<string> {
  const { data, error } = await sb.storage.from(bucket).download(path);
  if (error || !data) throw new Error("Could not read the document to check the signature permission.");
  return sha256Hex(new Uint8Array(await data.arrayBuffer()));
}

/** The pack's structure + every template file it pulls in (forms are filled by the vessel). */
export async function packHash(sb: any, pack: unknown): Promise<string> {
  if (!Array.isArray(pack) || !pack.length) return "";
  const parts: string[] = [];
  for (const p of pack as any[]) {
    const h = p?.kind === "template" && p.file_path ? await fileHash(sb, ESIGN_BUCKET, p.file_path) : "";
    parts.push(`${p?.kind}:${p?.key}:${h}`);
  }
  return sha256Hex(parts.join("|"));
}

/** Fingerprint of an e-sign document as stored: its file + (for campaign packs) its parts. */
export async function esignFingerprint(sb: any, doc: { file_path: string; pack?: unknown }, fileBytes?: Uint8Array): Promise<string> {
  const f = fileBytes ? await sha256Hex(fileBytes) : await fileHash(sb, ESIGN_BUCKET, doc.file_path);
  return sha256Hex(`file:${f}|pack:${await packHash(sb, doc.pack)}`);
}

/** Fingerprint of a form submission's PDF. */
export async function formFingerprint(sb: any, pdfPath: string): Promise<string> {
  return sha256Hex(`form:${await fileHash(sb, ESIGN_BUCKET, pdfPath)}`);
}

/** Fingerprint of what a campaign sends: the documents in it (templates by file). */
export async function campaignFingerprint(sb: any, pack: unknown): Promise<string> {
  return sha256Hex(`campaign:${await packHash(sb, pack)}`);
}

/** Every JLS signatory a document's signature spots (and its pack's templates) would stamp. */
export function companySignatoryIds(fields: unknown, pack?: unknown): string[] {
  const all: any[] = [
    ...(Array.isArray(fields) ? fields : []),
    ...(Array.isArray(pack) ? (pack as any[]).flatMap((p) => (p?.kind === "template" && Array.isArray(p.fields) ? p.fields : [])) : []),
  ];
  return [...new Set(all.filter((f) => f?.role === "company" && f?.signatory_id).map((f) => String(f.signatory_id)))];
}

// ── requests ─────────────────────────────────────────────────────────────────

async function loadSignatory(sb: any, id: string) {
  const { data } = await sb.from("jls_signatories")
    .select("id, full_name, email, user_id, use_policy, active, signature_path, confidential").eq("id", id).maybeSingle();
  return data as null | {
    id: string; full_name: string; email: string | null; user_id: string | null; use_policy: string;
    active: boolean; signature_path: string | null; confidential: boolean;
  };
}

async function signatoryContact(sb: any, sig: { user_id: string | null; email: string | null }) {
  if (sig.user_id) {
    const { data } = await sb.from("user_profiles").select("email").eq("user_id", sig.user_id).maybeSingle();
    if (data?.email) return data.email as string;
  }
  return sig.email;
}

export function appBase(origin?: string | null): string {
  return ((process.env.VITE_APP_URL as string | undefined) || (process.env.PUBLIC_APP_URL as string | undefined) || origin || "https://polaris.jlsyachts.com").replace(/\/$/, "");
}

/** Bell + email to one staff member. Best-effort — never blocks the action. */
export async function notifyStaff(sb: any, opts: {
  userId?: string | null; email?: string | null; type: string; urgency?: string;
  title: string; body: string; actionUrl: string; metadata?: Record<string, unknown>; origin?: string | null;
}) {
  if (opts.userId) {
    try {
      await sb.from("notifications").insert({
        user_id: opts.userId, type: opts.type, urgency: opts.urgency ?? "warning",
        title: opts.title, body: opts.body, action_url: opts.actionUrl, metadata: opts.metadata ?? {},
      });
    } catch { /* bell is best-effort */ }
  }
  if (opts.email) {
    const link = `${appBase(opts.origin)}${opts.actionUrl}`;
    try {
      await sendEmail({
        from: ANCHOR_SENDER, to: [opts.email],
        subject: opts.title,
        html: `<p>${esc(opts.body)}</p><p><a href="${link}">Open in Polaris</a></p><p style="color:#94a3b8;font-size:12px;">JLS Yachts · Anchor</p>`,
        text: `${opts.body}\n\nOpen in Polaris: ${link}`,
      });
    } catch (e) { console.error("[signatory-auth] email failed:", e instanceof Error ? e.message : e); }
  }
}

/**
 * Ask to put a signatory's signature on a document. Re-asking for the same document
 * and file returns the earlier answer (no duplicate requests on a resend / retry).
 */
export async function requestSignatoryUse(sb: any, opts: {
  signatoryId: string; target: UseTarget; fingerprint: string; title: string; requester: Requester; origin?: string | null;
}): Promise<UseResult> {
  const sig = await loadSignatory(sb, opts.signatoryId);
  const name = sig?.full_name ?? "this signatory";
  const base = { signatoryId: opts.signatoryId, signatoryName: name };
  if (!sig) return { ...base, status: "refused", reason: "That signatory no longer exists." };
  if (!sig.active) return { ...base, status: "refused", reason: `${name} is not an active signatory.` };
  if (!sig.signature_path) return { ...base, status: "refused", reason: `${name} has no signature on file.` };

  // An earlier answer for this exact document + file.
  const { data: prior } = await scopeToTarget(
    sb.from("jls_signatory_uses").select("id, status, decided_by_email")
      .eq("signatory_id", sig.id).eq("fingerprint", opts.fingerprint).in("status", ["approved", "applied", "pending", "denied"]),
    opts.target,
  ).order("created_at", { ascending: false }).limit(1);
  const last = prior?.[0];
  if (last?.status === "approved" || last?.status === "applied") return { ...base, status: "approved", useId: last.id };
  if (last?.status === "pending") return { ...base, status: "pending", useId: last.id };
  if (last?.status === "denied") return { ...base, status: "refused", useId: last.id, reason: `${name} declined the use of their signature on this document.` };

  const { data: access } = await sb.rpc("signatory_access", { p_signatory_id: sig.id, p_user_id: opts.requester.userId });
  const row = {
    signatory_id: sig.id, ...targetColumns(opts.target), document_title: opts.title, fingerprint: opts.fingerprint,
    requested_by: opts.requester.userId, requested_by_email: opts.requester.email, confidential: !!sig.confidential,
  };

  if (access === "own" || access === "authorised") {
    const { data, error } = await sb.from("jls_signatory_uses").insert({
      ...row, status: "approved", basis: access,
      decided_by: opts.requester.userId, decided_by_email: opts.requester.email, decided_at: new Date().toISOString(),
    }).select("id").single();
    if (error) throw new Error(`Could not record the signature use: ${error.message}`);
    return { ...base, status: "approved", useId: data.id };
  }

  if (access === "approval" && sig.user_id) {
    const { data, error } = await sb.from("jls_signatory_uses").insert({ ...row, status: "pending" }).select("id").single();
    if (error) throw new Error(`Could not record the signature request: ${error.message}`);
    const who = opts.requester.name || opts.requester.email;
    await notifyStaff(sb, {
      userId: sig.user_id, email: await signatoryContact(sb, sig), type: "signatory_use_request",
      title: `Approve use of your signature: ${opts.title}`,
      body: `${who} asks to put your signature on “${opts.title}”. Nothing is signed until you approve it in Polaris → Anchor → Signatories.`,
      actionUrl: "/esign?tab=signatories", metadata: { use_id: data.id, signatory_id: sig.id }, origin: opts.origin,
    });
    return { ...base, status: "pending", useId: data.id };
  }

  const reason = access === "approval"
    ? `${name}'s signature needs their approval, but they have no Polaris login linked — ask a global admin to link it.`
    : `You're not authorised to use ${name}'s signature. Ask ${name} (or a global admin) to add you as an authorised user.`;
  await sb.from("jls_signatory_uses").insert({ ...row, status: "refused", note: reason });
  return { ...base, status: "refused", reason };
}

/** The approved, not-yet-used permission for this signatory on this document + file. */
export async function findApprovedUse(sb: any, signatoryId: string, target: UseTarget, fingerprint: string) {
  const { data } = await scopeToTarget(
    sb.from("jls_signatory_uses").select("id, decided_by_email, basis")
      .eq("signatory_id", signatoryId).eq("fingerprint", fingerprint).eq("status", "approved"),
    target,
  ).order("created_at", { ascending: false }).limit(1);
  return (data?.[0] ?? null) as null | { id: string; decided_by_email: string | null; basis: string | null };
}

/** Record that a campaign's approval covers one document it sent. */
export async function recordCampaignDocumentUse(sb: any, opts: {
  campaignUseId: string; documentId: string; fingerprint: string; title: string; requester: Requester;
}) {
  const { data: parent } = await sb.from("jls_signatory_uses").select("*").eq("id", opts.campaignUseId).maybeSingle();
  if (!parent || !["approved", "applied"].includes(parent.status)) throw new Error("The campaign's signature permission is missing.");
  await sb.from("jls_signatory_uses").insert({
    signatory_id: parent.signatory_id, esign_document_id: opts.documentId, campaign_id: parent.campaign_id,
    document_title: opts.title, fingerprint: opts.fingerprint, status: "approved", basis: "campaign",
    requested_by: opts.requester.userId, requested_by_email: opts.requester.email,
    decided_by: parent.decided_by, decided_by_email: parent.decided_by_email, decided_at: parent.decided_at,
    confidential: parent.confidential,
  });
}

export async function markApplied(sb: any, useId: string) {
  await sb.from("jls_signatory_uses").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", useId).eq("status", "approved");
}

/** A stamp that was blocked (no permission for this document / file). */
export async function logRefusedUse(sb: any, opts: { signatoryId: string; target: UseTarget; fingerprint: string; title: string; note: string }) {
  const sig = await loadSignatory(sb, opts.signatoryId);
  if (!sig) return;
  await sb.from("jls_signatory_uses").insert({
    signatory_id: sig.id, ...targetColumns(opts.target), document_title: opts.title, fingerprint: opts.fingerprint,
    status: "refused", note: opts.note, confidential: !!sig.confidential,
  });
}
