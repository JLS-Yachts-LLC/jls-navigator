/**
 * Server-side e-signature workflow. Runs on the Cloudflare Worker — has env
 * secrets + service-role DB access. The public signing functions are called
 * WITHOUT a session (the anonymous signer), so they authorise purely on the
 * unguessable signing token and operate via `supabaseAdmin`.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sendEmail } from "@/lib/ses.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "esign-documents";
const TOKEN_TTL_DAYS = 14;

// ── helpers ───────────────────────────────────────────────────────────────────

function reqMeta(): { ip: string | null; ua: string | null; origin: string | null } {
  try {
    const req = getRequest();
    const h = req.headers;
    const ip = h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const ua = h.get("user-agent");
    let origin: string | null = null;
    try { origin = new URL(req.url).origin; } catch { /* ignore */ }
    return { ip, ua, origin };
  } catch {
    return { ip: null, ua: null, origin: null };
  }
}

function baseUrl(origin: string | null): string {
  // VITE_APP_URL is already defined in wrangler.jsonc vars; prefer it so signing
  // links use the real deployed domain. Fall back to PUBLIC_APP_URL / request origin.
  return (
    (process.env.VITE_APP_URL as string | undefined) ||
    (process.env.PUBLIC_APP_URL as string | undefined) ||
    origin ||
    "https://jls-navigator.m-peeters-4a0.workers.dev"
  ).replace(/\/$/, "");
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function logEvent(documentId: string, event: string, actor: string | null, meta?: { ip: string | null; ua: string | null }) {
  await (supabaseAdmin as any).from("esign_events").insert([{
    document_id: documentId, event, actor: actor ?? null,
    ip_address: meta?.ip ?? null, user_agent: meta?.ua ?? null,
  }]);
}

// esign-documents is a private bucket — mint a short-lived signed URL server-side
// (the signer is anonymous, so the URL must be generated with the service role).
async function signedUrl(path: string, expiresIn = 60 * 60): Promise<string> {
  const { data } = await (supabaseAdmin as any).storage.from(BUCKET).createSignedUrl(path, expiresIn);
  return (data?.signedUrl as string) ?? "";
}

function inviteHtml(doc: any, link: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
      <tr><td style="background:#0f172a;padding:22px 32px;color:#fff;font-size:18px;font-weight:700;">JLS Yachts · Aquila One</td></tr>
      <tr><td style="padding:32px;">
        <p style="margin:0 0 6px;font-size:15px;color:#64748b;">Dear ${doc.signer_name},</p>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">You have a document waiting for your electronic signature: <strong>${doc.title}</strong>${doc.reference ? ` <span style="color:#94a3b8;">(${doc.reference})</span>` : ""}.</p>
        ${doc.message ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;border-left:3px solid #1e40af;padding-left:12px;">${doc.message}</p>` : ""}
        <p style="margin:0 0 24px;"><a href="${link}" style="background:#1e40af;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;display:inline-block;">Review &amp; Sign</a></p>
        <p style="margin:0;font-size:12px;color:#94a3b8;">Or paste this link into your browser:<br>${link}</p>
        <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">This link expires in ${TOKEN_TTL_DAYS} days.</p>
      </td></tr>
      <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 32px;text-align:center;font-size:11px;color:#94a3b8;">Sent securely via the Aquila One platform.</td></tr>
    </table></td></tr></table></body></html>`;
}

// ── send for signature ──────────────────────────────────────────────────────

// Surface the real Supabase error instead of masking it. A 401/JWT/permission
// error here means the SUPABASE_SERVICE_ROLE_KEY worker secret is invalid.
function adminError(error: any, context: string): Error {
  const m = String(error?.message ?? error?.code ?? "");
  if (/jwt|api ?key|unauthorized|permission denied|not authorized|401/i.test(m)) {
    return new Error("Server database access denied — the SUPABASE_SERVICE_ROLE_KEY secret is invalid or expired. Update it in the Cloudflare Worker.");
  }
  return new Error(`${context}: ${m || "unknown error"}`);
}

export const doSendForSignature = createServerFn({ method: "POST" })
  // @ts-expect-error — TanStack Start v1 serverFn type requires explicit ctx typing
  .handler(async (ctx: { data: { documentId: string; senderEmail?: string } }) => {
    const { documentId, senderEmail } = ctx.data ?? {};
    if (!documentId) throw new Error("No document id was supplied to the signing request.");
    const meta = reqMeta();

    const { data: doc, error } = await (supabaseAdmin as any)
      .from("esign_documents").select("*").eq("id", documentId).maybeSingle();
    if (error) throw adminError(error, "Could not load the document");
    if (!doc) throw new Error("Document not found");
    if (doc.status === "signed") throw new Error("This document is already signed.");

    const token = doc.signing_token || randomToken();
    const expires = new Date(Date.now() + TOKEN_TTL_DAYS * 86400_000).toISOString();
    const link = `${baseUrl(meta.origin)}/sign/${token}`;

    await sendEmail({
      to: [doc.signer_email],
      cc: senderEmail ? [senderEmail] : [],
      subject: `Signature requested: ${doc.title}${doc.reference ? ` (${doc.reference})` : ""}`,
      html: inviteHtml(doc, link),
      text: `Dear ${doc.signer_name},\n\nYou have a document waiting for your signature: ${doc.title}.\n${doc.message ? `\n${doc.message}\n` : ""}\nReview & sign: ${link}\n\nThis link expires in ${TOKEN_TTL_DAYS} days.\n\nJLS Yachts · Aquila One`,
    });

    await (supabaseAdmin as any).from("esign_documents").update({
      signing_token: token, token_expires_at: expires,
      status: "sent", sent_at: new Date().toISOString(),
    }).eq("id", documentId);

    await logEvent(documentId, "sent", senderEmail ?? null, meta);
    return { ok: true, link };
  });

// ── public: load a document by token (marks viewed) ─────────────────────────

export const getSigningDocument = createServerFn({ method: "POST" })
  // @ts-expect-error — explicit ctx typing
  .handler(async (ctx: { data: { token: string } }) => {
    const { token } = ctx.data;
    const meta = reqMeta();

    const { data: doc, error } = await (supabaseAdmin as any)
      .from("esign_documents").select("*").eq("signing_token", token).maybeSingle();
    if (error) throw adminError(error, "Could not load the document");
    if (!doc) throw new Error("This signing link is invalid.");

    if (doc.status === "signed") return await responseFor(doc, "signed");
    if (doc.status === "declined") return await responseFor(doc, "declined");
    if (doc.status === "voided") throw new Error("This document has been withdrawn.");
    if (doc.token_expires_at && new Date(doc.token_expires_at) < new Date()) {
      await (supabaseAdmin as any).from("esign_documents").update({ status: "expired" }).eq("id", doc.id);
      throw new Error("This signing link has expired.");
    }

    if (doc.status === "sent") {
      await (supabaseAdmin as any).from("esign_documents")
        .update({ status: "viewed", viewed_at: new Date().toISOString() }).eq("id", doc.id);
      await logEvent(doc.id, "viewed", doc.signer_email, meta);
    }
    return await responseFor(doc, "viewed");
  });

async function responseFor(doc: any, status: string) {
  return {
    title: doc.title as string,
    description: (doc.description ?? null) as string | null,
    reference: (doc.reference ?? null) as string | null,
    signerName: doc.signer_name as string,
    message: (doc.message ?? null) as string | null,
    status,
    fileUrl: await signedUrl(doc.file_path),
    signedFileUrl: doc.signed_file_path ? await signedUrl(doc.signed_file_path) : null,
  };
}

// ── public: submit a signature ──────────────────────────────────────────────

export const doSubmitSignature = createServerFn({ method: "POST" })
  // @ts-expect-error — explicit ctx typing
  .handler(async (ctx: { data: { token: string; signatureDataUrl: string; typedName?: string } }) => {
    const { token, signatureDataUrl, typedName } = ctx.data;
    const meta = reqMeta();

    const { data: doc, error } = await (supabaseAdmin as any)
      .from("esign_documents").select("*").eq("signing_token", token).maybeSingle();
    if (error) throw adminError(error, "Could not load the document");
    if (!doc) throw new Error("This signing link is invalid.");
    if (doc.status === "signed") throw new Error("This document is already signed.");
    if (!["sent", "viewed"].includes(doc.status)) throw new Error("This document can no longer be signed.");
    if (doc.token_expires_at && new Date(doc.token_expires_at) < new Date()) throw new Error("This signing link has expired.");

    // Load the original PDF
    const { data: blob, error: dlErr } = await (supabaseAdmin as any).storage.from(BUCKET).download(doc.file_path);
    if (dlErr || !blob) throw new Error("Could not load the document to sign.");
    const srcBytes = new Uint8Array(await blob.arrayBuffer());

    // Stamp a signature certificate page
    const pdf = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const page = pdf.addPage([595, 842]); // A4 portrait
    const signedAt = new Date();
    let y = 770;
    const line = (t: string, f = font, size = 11, color = rgb(0.1, 0.12, 0.16)) => {
      page.drawText(t, { x: 56, y, size, font: f, color }); y -= size + 8;
    };
    line("Signature Certificate", bold, 20); y -= 6;
    line("Document", bold, 11); line(`${doc.title}${doc.reference ? `  (${doc.reference})` : ""}`); y -= 6;
    line("Signed by", bold, 11); line(`${doc.signer_name}  <${doc.signer_email}>`);
    if (typedName) line(`Typed name: ${typedName}`, font, 10, rgb(0.4, 0.45, 0.5));
    y -= 6;
    line("Signed at (UTC)", bold, 11); line(signedAt.toISOString());
    if (meta.ip) { line("Signer IP", bold, 11); line(meta.ip); }
    y -= 10;

    // Embed the drawn/typed signature image
    try {
      const b64 = signatureDataUrl.includes(",") ? signatureDataUrl.split(",")[1] : signatureDataUrl;
      const png = await pdf.embedPng(b64);
      const w = 220; const h = (png.height / png.width) * w;
      page.drawText("Signature:", { x: 56, y, size: 11, font: bold }); y -= 10;
      page.drawImage(png, { x: 56, y: y - h, width: w, height: h });
      y -= h + 10;
      page.drawLine({ start: { x: 56, y }, end: { x: 56 + w, y }, thickness: 1, color: rgb(0.6, 0.65, 0.7) });
    } catch { /* if the signature image fails, the typed name + audit still stand */ }

    page.drawText("Signed electronically via the Aquila One platform — JLS Yachts.", {
      x: 56, y: 48, size: 9, font, color: rgb(0.5, 0.55, 0.6),
    });

    const outBytes = await pdf.save();
    const signedPath = `signed/${doc.id}.pdf`;
    const { error: upErr } = await (supabaseAdmin as any).storage.from(BUCKET)
      .upload(signedPath, outBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error("Could not store the signed document.");

    await (supabaseAdmin as any).from("esign_documents").update({
      status: "signed", signed_at: signedAt.toISOString(), signed_file_path: signedPath,
    }).eq("id", doc.id);
    await logEvent(doc.id, "signed", doc.signer_email, meta);

    // Notify signer + sender with the completed copy (long-lived link — the
    // recipient may open it days later).
    const url = await signedUrl(signedPath, 60 * 60 * 24 * 14);
    try {
      await sendEmail({
        to: [doc.signer_email],
        subject: `Signed: ${doc.title}${doc.reference ? ` (${doc.reference})` : ""}`,
        html: `<p>Thank you, ${doc.signer_name}. Your signed copy of <strong>${doc.title}</strong> is attached as a link below.</p><p><a href="${url}">Download signed document</a></p><p style="color:#94a3b8;font-size:12px;">JLS Yachts · Aquila One</p>`,
        text: `Thank you, ${doc.signer_name}. Signed copy: ${url}`,
      });
    } catch { /* non-fatal */ }

    return { ok: true, signedFileUrl: url };
  });

// ── public: decline ─────────────────────────────────────────────────────────

export const doDeclineSignature = createServerFn({ method: "POST" })
  // @ts-expect-error — explicit ctx typing
  .handler(async (ctx: { data: { token: string; reason?: string } }) => {
    const { token, reason } = ctx.data;
    const meta = reqMeta();
    const { data: doc } = await (supabaseAdmin as any)
      .from("esign_documents").select("id,status,signer_email").eq("signing_token", token).maybeSingle();
    if (!doc) throw new Error("This signing link is invalid.");
    if (doc.status === "signed") throw new Error("This document is already signed.");
    await (supabaseAdmin as any).from("esign_documents")
      .update({ status: "declined", declined_reason: reason ?? null }).eq("id", doc.id);
    await logEvent(doc.id, "declined", doc.signer_email, meta);
    return { ok: true };
  });
