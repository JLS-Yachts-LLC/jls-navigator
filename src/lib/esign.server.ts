/**
 * Server-side e-signature workflow. Runs on the Cloudflare Worker — has env
 * secrets + service-role DB access. The public signing functions are called
 * WITHOUT a session (the anonymous signer), so they authorise purely on the
 * unguessable signing token and operate via `supabaseAdmin`.
 */
import { jlsEmailHeaderRow, jlsEmailFooterRow } from "@/lib/brand/jls-email";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sendEmail } from "@/lib/ses.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildUploadedSignedPdf } from "@/lib/esign/signed-copy.server";
import { buildPackPdf, applySignerValues, type PackPart } from "@/lib/esign/pack.server";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { requireStaff } from "@/lib/guest/guest-auth.server";

const BUCKET = "esign-documents";
const TOKEN_TTL_DAYS = 14;
// Anchor (the e-Sign system) sends from its own mailbox; everything else defaults
// to polaris@jlsyachts.com (see sendGraphEmail).
const ANCHOR_SENDER = process.env.ANCHOR_MAIL_SENDER ?? "anchor@jlsyachts.com";

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
    "https://polaris.jlsyachts.com"
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
      ${jlsEmailHeaderRow()}
      <tr><td style="padding:32px;">
        <p style="margin:0 0 6px;font-size:15px;color:#64748b;">Dear ${doc.signer_name},</p>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">You have a document waiting for your electronic signature: <strong>${doc.title}</strong>${doc.reference ? ` <span style="color:#94a3b8;">(${doc.reference})</span>` : ""}.</p>
        ${doc.message ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;border-left:3px solid #0070C0;padding-left:12px;">${doc.message}</p>` : ""}
        <p style="margin:0 0 24px;"><a href="${link}" style="background:#0070C0;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;display:inline-block;">Review &amp; Sign</a></p>
        <p style="margin:0;font-size:12px;color:#94a3b8;">Or paste this link into your browser:<br>${link}</p>
        <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">This link expires in ${TOKEN_TTL_DAYS} days.</p>
      </td></tr>
      ${jlsEmailFooterRow()}
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

// Staff only. The caller's login rides along (attachSupabaseAuth) and is checked
// here — before, anyone holding a document id could make Polaris email a signing
// link. Client-portal and guest logins are refused, a confidential document needs
// Anchor — Confidential access, and the CC'd sender is the signed-in staff member
// (the client's `senderEmail` is ignored; kept in the type so old callers compile).
export const doSendForSignature = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth])
  .inputValidator((d: { documentId: string; senderEmail?: string }) => d)
  .handler(async ({ data }) => {
    const { documentId } = data ?? {};
    if (!documentId) throw new Error("No document id was supplied to the signing request.");
    const request = getRequest();
    const gate = request ? await requireStaff(request) : null;
    if (!gate?.ok) throw new Error("Please sign in to Polaris as a member of staff to send documents.");
    const senderEmail = gate.staff.email || undefined;
    const meta = reqMeta();

    const { data: doc, error } = await (supabaseAdmin as any)
      .from("esign_documents").select("*").eq("id", documentId).maybeSingle();
    if (error) throw adminError(error, "Could not load the document");
    if (!doc) throw new Error("Document not found");
    if (doc.confidential) {
      const { data: allowed } = await (supabaseAdmin as any).rpc("can_see_anchor_confidential", { p_user_id: gate.staff.userId });
      if (allowed !== true) throw new Error("Document not found");
    }
    if (doc.status === "signed") throw new Error("This document is already signed.");

    const token = doc.signing_token || randomToken();
    const expires = new Date(Date.now() + TOKEN_TTL_DAYS * 86400_000).toISOString();
    const link = `${baseUrl(meta.origin)}/sign/${token}`;

    await sendEmail({
      from: ANCHOR_SENDER,
      to: [doc.signer_email],
      cc: senderEmail ? [senderEmail] : [],
      subject: `Signature requested: ${doc.title}${doc.reference ? ` (${doc.reference})` : ""}`,
      html: inviteHtml(doc, link),
      text: `Dear ${doc.signer_name},\n\nYou have a document waiting for your signature: ${doc.title}.\n${doc.message ? `\n${doc.message}\n` : ""}\nReview & sign: ${link}\n\nThis link expires in ${TOKEN_TTL_DAYS} days.\n\nJLS Yachts LLC`,
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
    // Campaigns can switch e-signature off (paper only) — the page then offers
    // just the download + upload-a-signed-copy route.
    allowEsign: doc.allow_esign !== false,
    signedMethod: (doc.signed_method ?? null) as string | null,
    // Campaign packs: the forms the vessel completes before signing (index =
    // the part's position in the pack, values = what we pre-filled).
    forms: (Array.isArray(doc.pack) ? (doc.pack as PackPart[]) : [])
      .map((p, index) => ({ p, index }))
      .filter(({ p }) => p.kind === "form")
      .map(({ p, index }) => ({ index, key: p.key, title: p.title, signs: p.signs, values: (p as any).values ?? {} })),
    documents: Array.isArray(doc.pack) ? (doc.pack as PackPart[]).map((p) => p.title) : [],
    fileUrl: await signedUrl(doc.file_path),
    signedFileUrl: doc.signed_file_path ? await signedUrl(doc.signed_file_path) : null,
  };
}

// ── public: preview a pack with the vessel's answers (before signing) ───────

export const previewSigningPack = createServerFn({ method: "POST" })
  // @ts-expect-error — explicit ctx typing
  .handler(async (ctx: { data: { token: string; formValues?: Record<string, Record<string, unknown>> } }) => {
    const { token, formValues } = ctx.data;
    const { data: doc, error } = await (supabaseAdmin as any)
      .from("esign_documents").select("id, status, token_expires_at, pack").eq("signing_token", token).maybeSingle();
    if (error) throw adminError(error, "Could not load the document");
    if (!doc || !Array.isArray(doc.pack)) throw new Error("This signing link is invalid.");
    if (!["sent", "viewed"].includes(doc.status)) throw new Error("This document can no longer be changed.");
    if (doc.token_expires_at && new Date(doc.token_expires_at) < new Date()) throw new Error("This signing link has expired.");
    const { parts } = applySignerValues(doc.pack, formValues);
    const { bytes } = await buildPackPdf(supabaseAdmin as any, parts);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { pdfBase64: btoa(bin) };
  });

/**
 * File each form the vessel completed into Anchor Forms, so the answers are in
 * Polaris. DMA notices (signed by JLS as agent) wait there for JLS approval and
 * signing; the rest are recorded as signed through this document.
 */
async function fileCompletedForms(doc: any, pack: PackPart[], partBytes: Uint8Array[]) {
  for (let i = 0; i < pack.length; i++) {
    const p = pack[i];
    if (p.kind !== "form" || !partBytes[i]) continue;
    try {
      const { data: sub } = await (supabaseAdmin as any).from("anchor_form_submissions").insert({
        form_key: p.key, title: `${p.title}${doc.title.includes(" — ") ? ` — ${doc.title.split(" — ").pop()}` : ""}`,
        values: p.values, status: p.signs ? "signed" : "returned", esign_document_id: doc.id, created_by: doc.created_by ?? null,
        confidential: !!doc.confidential, // forms from a confidential document stay confidential
      }).select("id").single();
      if (!sub) continue;
      const path = `${doc.confidential ? "confidential/" : ""}forms/${sub.id}.pdf`;
      const up = await (supabaseAdmin as any).storage.from(BUCKET).upload(path, partBytes[i], { contentType: "application/pdf", upsert: true });
      if (!up.error) await (supabaseAdmin as any).from("anchor_form_submissions").update({ pdf_path: path }).eq("id", sub.id);
    } catch { /* filing is best-effort; the signed pack is the record */ }
  }
}

// ── public: submit a signature ──────────────────────────────────────────────

export const doSubmitSignature = createServerFn({ method: "POST" })
  // @ts-expect-error — explicit ctx typing
  .handler(async (ctx: { data: { token: string; signatureDataUrl: string; stampDataUrl?: string; typedName?: string; formValues?: Record<string, Record<string, unknown>> } }) => {
    const { token, signatureDataUrl, stampDataUrl, typedName, formValues } = ctx.data;
    // Optional vessel stamp — a PNG the signing page has already cleaned up.
    if (stampDataUrl && (typeof stampDataUrl !== "string" || stampDataUrl.length > 4_000_000)) throw new Error("That stamp image is too large — please use a smaller one.");
    const meta = reqMeta();

    const { data: doc, error } = await (supabaseAdmin as any)
      .from("esign_documents").select("*").eq("signing_token", token).maybeSingle();
    if (error) throw adminError(error, "Could not load the document");
    if (!doc) throw new Error("This signing link is invalid.");
    if (doc.status === "signed") throw new Error("This document is already signed.");
    if (!["sent", "viewed"].includes(doc.status)) throw new Error("This document can no longer be signed.");
    if (doc.token_expires_at && new Date(doc.token_expires_at) < new Date()) throw new Error("This signing link has expired.");
    if (doc.allow_esign === false) throw new Error("This document is signed on paper — please download it, sign it and upload the signed copy.");

    // Campaign packs with forms are rebuilt with what the vessel filled in, so
    // they sign the completed documents; anything else is signed as sent.
    let srcBytes: Uint8Array;
    let sigFields: any[] = Array.isArray(doc.signature_fields) ? doc.signature_fields : [];
    let pack: PackPart[] | null = Array.isArray(doc.pack) ? doc.pack : null;
    let partBytes: Uint8Array[] = [];
    if (pack && pack.some((p) => p.kind === "form")) {
      const applied = applySignerValues(pack, formValues);
      if (applied.missing.length) throw new Error(`Please complete: ${applied.missing.slice(0, 6).join(", ")}${applied.missing.length > 6 ? "…" : ""}`);
      pack = applied.parts;
      const built = await buildPackPdf(supabaseAdmin as any, pack);
      srcBytes = built.bytes; sigFields = built.fields; partBytes = built.partBytes;
    } else {
      const { data: blob, error: dlErr } = await (supabaseAdmin as any).storage.from(BUCKET).download(doc.file_path);
      if (dlErr || !blob) throw new Error("Could not load the document to sign.");
      srcBytes = new Uint8Array(await blob.arrayBuffer());
    }

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

    // Optional vessel stamp (best-effort: a bad image never blocks signing).
    let stampImg: any = null;
    if (stampDataUrl) {
      try { stampImg = await pdf.embedPng(stampDataUrl.includes(",") ? stampDataUrl.split(",")[1] : stampDataUrl); } catch { stampImg = null; }
    }

    // Embed the drawn/typed signature image, with the vessel stamp beside it
    const sigTop = y;
    try {
      const b64 = signatureDataUrl.includes(",") ? signatureDataUrl.split(",")[1] : signatureDataUrl;
      const png = await pdf.embedPng(b64);
      const w = 220; const h = (png.height / png.width) * w;
      page.drawText("Signature:", { x: 56, y, size: 11, font: bold }); y -= 10;
      page.drawImage(png, { x: 56, y: y - h, width: w, height: h });
      y -= h + 10;
      page.drawLine({ start: { x: 56, y }, end: { x: 56 + w, y }, thickness: 1, color: rgb(0.6, 0.65, 0.7) });
    } catch { /* if the signature image fails, the typed name + audit still stand */ }
    if (stampImg) {
      const k = Math.min(130 / stampImg.width, 130 / stampImg.height);
      const sw = stampImg.width * k, sh = stampImg.height * k;
      page.drawText("Vessel stamp:", { x: 316, y: sigTop, size: 11, font: bold });
      page.drawImage(stampImg, { x: 316, y: sigTop - 10 - sh, width: sw, height: sh });
      y = Math.min(y, sigTop - 10 - sh - 10);
    }

    page.drawText("Signed electronically with JLS Yachts LLC secure e-signature (Polaris).", {
      x: 56, y: 48, size: 9, font, color: rgb(0.5, 0.55, 0.6),
    });

    // Stamp signatures in-place at the sender-chosen field position(s).
    // Fields carry a role: 'client' (default) = the signer's drawn signature;
    // 'company' = the chosen JLS signatory's stored signature image.
    try {
      const allFields: { page?: number; pos?: string; role?: string; signatory_id?: string; type?: string; label?: boolean; x?: number; y?: number }[] =
        sigFields;
      // 'date' fields print the signing date at their spot (e.g. the Tariff
      // Sheet's "Date" line); everything else is a signature.
      // 'stamp' fields mark where the vessel stamp goes (e.g. the Tariff
      // Sheet's "Yacht Stamp" line); without one it sits beside the signature.
      const dateFields = allFields.filter(f => f.type === "date");
      const stampFields = allFields.filter(f => f.type === "stamp");
      const fields = allFields.filter(f => f.type !== "date" && f.type !== "stamp");
      if (stampImg) {
        for (const f of stampFields) {
          const p = pdf.getPages()[Math.max(0, (f.page ?? 1) - 1)];
          if (!p || typeof f.x !== "number" || typeof f.y !== "number") continue;
          const { width, height } = p.getSize();
          const k = Math.min(78 / stampImg.width, 78 / stampImg.height);
          const tw = stampImg.width * k, th = stampImg.height * k;
          const tx = Math.min(Math.max(f.x * width - tw / 2, 4), width - tw - 4);
          const ty = Math.min(Math.max((1 - f.y) * height - th / 2, 4), height - th - 4);
          p.drawImage(stampImg, { x: tx, y: ty, width: tw, height: th, opacity: 0.92 });
        }
      }
      for (const f of dateFields) {
        const p = pdf.getPages()[Math.max(0, (f.page ?? 1) - 1)];
        if (!p || typeof f.x !== "number" || typeof f.y !== "number") continue;
        const { width, height } = p.getSize();
        const txt = signedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" });
        const size = 10;
        const tw = font.widthOfTextAtSize(txt, size);
        p.drawText(txt, { x: f.x * width - tw / 2, y: (1 - f.y) * height - size / 2, size, font, color: rgb(0.1, 0.12, 0.16) });
      }
      if (fields.length) {
        const b64 = signatureDataUrl.includes(",") ? signatureDataUrl.split(",")[1] : signatureDataUrl;
        const clientSig = await pdf.embedPng(b64);

        // Pre-load company signatory signatures (one fetch per distinct signatory).
        const companyIds = [...new Set(fields.filter(f => f.role === "company" && f.signatory_id).map(f => f.signatory_id!))];
        const companySigs = new Map<string, { img: any; name: string }>();
        for (const sid of companyIds) {
          try {
            const { data: s } = await (supabaseAdmin as any).from("jls_signatories").select("full_name, signature_path").eq("id", sid).maybeSingle();
            if (!s?.signature_path) continue;
            const { data: blob } = await (supabaseAdmin as any).storage.from("signatures").download(s.signature_path);
            if (!blob) continue;
            const img = await pdf.embedPng(new Uint8Array(await blob.arrayBuffer()));
            companySigs.set(sid, { img, name: s.full_name ?? "JLS Yachts" });
          } catch { /* missing signatory signature — field skipped below */ }
        }

        const pages = pdf.getPages();
        for (const f of fields) {
          const p = pages[Math.max(0, (f.page ?? 1) - 1)];
          if (!p) continue;
          const isCompany = f.role === "company";
          const entry = isCompany ? companySigs.get(f.signatory_id ?? "") : null;
          if (isCompany && !entry) continue; // no stored signature — skip rather than mis-stamp
          const sig = isCompany ? entry!.img : clientSig;
          const sw = 130; const sh = (sig.height / sig.width) * sw;
          const { width, height } = p.getSize();
          let x: number; let y: number;
          const fx = (f as any).x; const fy = (f as any).y;
          if (typeof fx === "number" && typeof fy === "number") {
            // Drag-placed field: x/y are fractions of the page (from the top-left),
            // marking the CENTRE of the signature.
            x = Math.min(Math.max(fx * width - sw / 2, 4), width - sw - 4);
            y = Math.min(Math.max((1 - fy) * height - sh / 2, 14), height - sh - 4);
          } else {
            const pad = 40;
            const pos = f.pos ?? "bottom-right";
            x = pos.includes("left") ? pad : pos.includes("center") ? (width - sw) / 2 : width - sw - pad;
            y = pos.includes("top") ? height - pad - sh : pos.includes("middle") ? (height - sh) / 2 : pad + 12;
          }
          p.drawImage(sig, { x, y, width: sw, height: sh });
          // The vessel stamp sits beside the signer's signature, slightly
          // overlapping it as a stamp on paper would.
          if (!isCompany && stampImg && !stampFields.length) {
            const k = Math.min(78 / stampImg.width, 78 / stampImg.height);
            const tw = stampImg.width * k, th = stampImg.height * k;
            let tx = x + sw * 0.8;
            if (tx + tw > width - 4) tx = Math.max(4, x - tw * 0.8);
            const ty = Math.min(Math.max(y + sh / 2 - th / 2, 4), height - th - 4);
            p.drawImage(stampImg, { x: tx, y: ty, width: tw, height: th, opacity: 0.92 });
          }
          if ((f as any).label === false) continue;
          const label = isCompany ? `${entry!.name} · JLS Yachts · ${signedAt.toISOString().slice(0, 10)}` : `${doc.signer_name} · ${signedAt.toISOString().slice(0, 10)}`;
          p.drawText(label, { x, y: y - 9, size: 6.5, font, color: rgb(0.45, 0.5, 0.55) });
        }
      }
    } catch { /* in-place stamp is best-effort; certificate page still carries the signature */ }

    const outBytes = await pdf.save();
    // Confidential documents keep their files under the fenced "confidential/" prefix.
    const signedPath = `${doc.confidential ? "confidential/" : ""}signed/${doc.id}.pdf`;
    const { error: upErr } = await (supabaseAdmin as any).storage.from(BUCKET)
      .upload(signedPath, outBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error("Could not store the signed document.");

    await (supabaseAdmin as any).from("esign_documents").update({
      status: "signed", signed_at: signedAt.toISOString(), signed_file_path: signedPath, signed_method: "esign",
      ...(pack ? { pack } : {}),
    }).eq("id", doc.id);
    if (pack && partBytes.length) await fileCompletedForms(doc, pack, partBytes);
    await logEvent(doc.id, "signed", doc.signer_email, meta);
    if (stampImg) await logEvent(doc.id, "stamped", doc.signer_email, meta);

    // Notify signer + sender with the completed copy (long-lived link — the
    // recipient may open it days later).
    const url = await signedUrl(signedPath, 60 * 60 * 24 * 14);
    try {
      await sendEmail({
        from: ANCHOR_SENDER,
        to: [doc.signer_email],
        subject: `Signed: ${doc.title}${doc.reference ? ` (${doc.reference})` : ""}`,
        html: `<p>Thank you, ${doc.signer_name}. Your signed copy of <strong>${doc.title}</strong> is attached as a link below.</p><p><a href="${url}">Download signed document</a></p><p style="color:#94a3b8;font-size:12px;">JLS Yachts LLC</p>`,
        text: `Thank you, ${doc.signer_name}. Signed copy: ${url}`,
      });
    } catch { /* non-fatal */ }

    return { ok: true, signedFileUrl: url };
  });

// ── public: upload a paper-signed copy ──────────────────────────────────────
// For signers who print, sign (and stamp) the PDF instead of signing on screen.
// Accepts a PDF or a photo/scan (PNG/JPEG); images are wrapped into a PDF so
// the signed copy is always a PDF. A certificate page records the upload.

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const doUploadSignedCopy = createServerFn({ method: "POST" })
  // @ts-expect-error — explicit ctx typing
  .handler(async (ctx: { data: { token: string; fileBase64: string; fileName?: string; contentType: string } }) => {
    const { token, fileBase64, contentType } = ctx.data;
    const meta = reqMeta();
    if (!/^(application\/pdf|image\/png|image\/jpe?g)$/i.test(contentType ?? "")) {
      throw new Error("Please upload a PDF, or a photo/scan as PNG or JPEG.");
    }
    const bin = atob(String(fileBase64 ?? "").replace(/^data:[^,]+,/, ""));
    if (!bin.length) throw new Error("The file was empty.");
    if (bin.length > MAX_UPLOAD_BYTES) throw new Error("That file is too large (8 MB maximum).");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const { data: doc, error } = await (supabaseAdmin as any)
      .from("esign_documents").select("*").eq("signing_token", token).maybeSingle();
    if (error) throw adminError(error, "Could not load the document");
    if (!doc) throw new Error("This signing link is invalid.");
    if (doc.status === "signed") throw new Error("This document is already signed.");
    if (!["sent", "viewed"].includes(doc.status)) throw new Error("This document can no longer be signed.");
    if (doc.token_expires_at && new Date(doc.token_expires_at) < new Date()) throw new Error("This signing link has expired.");

    const at = new Date();
    let out: Uint8Array;
    try {
      out = await buildUploadedSignedPdf(bytes, contentType, {
        title: doc.title, reference: doc.reference, signerName: doc.signer_name, signerEmail: doc.signer_email,
        by: doc.signer_name, ip: meta.ip, at,
      });
    } catch {
      throw new Error("That file could not be read. Please upload a PDF, PNG or JPEG.");
    }
    // Confidential documents keep their files under the fenced "confidential/" prefix.
    const signedPath = `${doc.confidential ? "confidential/" : ""}signed/${doc.id}.pdf`;
    const { error: upErr } = await (supabaseAdmin as any).storage.from(BUCKET)
      .upload(signedPath, out, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error("Could not store the signed copy.");

    await (supabaseAdmin as any).from("esign_documents").update({
      status: "signed", signed_at: at.toISOString(), signed_file_path: signedPath, signed_method: "upload",
    }).eq("id", doc.id);
    await logEvent(doc.id, "signed_upload", doc.signer_email, meta);

    const url = await signedUrl(signedPath, 60 * 60 * 24 * 14);
    try {
      await sendEmail({
        from: ANCHOR_SENDER,
        to: [doc.signer_email],
        subject: `Received: ${doc.title}${doc.reference ? ` (${doc.reference})` : ""}`,
        html: `<p>Thank you, ${String(doc.signer_name).replace(/</g, "&lt;")}. We have received your signed copy of <strong>${doc.title}</strong>.</p><p><a href="${url}">Download your copy</a></p><p style="color:#94a3b8;font-size:12px;">JLS Yachts LLC</p>`,
        text: `Thank you, ${doc.signer_name}. We have received your signed copy of ${doc.title}: ${url}`,
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
