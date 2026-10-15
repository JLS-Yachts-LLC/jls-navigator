/**
 * Anchor Digital Forms API — POST /api/anchor-forms (authenticated, bearer).
 * Actions:
 *   generate → save a submission + build a branded PDF (esign-documents/forms/<id>.pdf)
 *   email    → email the completed PDF link (from anchor@) to a recipient
 *   sign     → create an Anchor (e-Sign) document from the PDF and send it for signature
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildFormPdf } from "@/lib/anchor-forms/pdf.server";
import { generateDmaPdf } from "@/lib/anchor-forms/dma-docx.server";
import { generateCf12aPdf } from "@/lib/anchor-forms/cf12a-pdf.server";
import { getFormDef } from "@/lib/anchor-forms/definitions";
import { sendEmail } from "@/lib/ses.server";
import { PDFDocument } from "pdf-lib";

const BUCKET = "esign-documents";
const ANCHOR_SENDER = process.env.ANCHOR_MAIL_SENDER ?? "anchor@jlsyachts.com";
const db = () => supabaseAdmin as any;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function signedUrl(path: string, expiresIn = 60 * 60 * 24 * 14): Promise<string> {
  const { data } = await db().storage.from(BUCKET).createSignedUrl(path, expiresIn);
  return (data?.signedUrl as string) ?? "";
}

/** Stamp a signatory's signature image onto the bottom-right of the form PDF's last page. */
async function stampSignature(formPdfPath: string, signatoryId: string, outPath: string): Promise<boolean> {
  const { data: sig } = await db().from("jls_signatories").select("full_name, signature_path").eq("id", signatoryId).maybeSingle();
  if (!sig?.signature_path) return false;
  const [{ data: pdfBlob }, { data: pngBlob }] = await Promise.all([
    db().storage.from(BUCKET).download(formPdfPath),
    db().storage.from("signatures").download(sig.signature_path),
  ]);
  if (!pdfBlob || !pngBlob) return false;
  const pdf = await PDFDocument.load(new Uint8Array(await pdfBlob.arrayBuffer()), { ignoreEncryption: true });
  const png = await pdf.embedPng(new Uint8Array(await pngBlob.arrayBuffer()));
  const page = pdf.getPages()[pdf.getPageCount() - 1];
  const { width } = page.getSize();
  const w = 150; const h = (png.height / png.width) * w;
  page.drawImage(png, { x: width - w - 48, y: 60, width: w, height: h });
  page.drawText(`Signed: ${sig.full_name}`, { x: width - w - 48, y: 50, size: 7 });
  const bytes = await pdf.save();
  await db().storage.from(BUCKET).upload(outPath, bytes, { contentType: "application/pdf", upsert: true });
  return true;
}

function logEntry(actor: string, action: string, note?: string) {
  return { actor, action, note: note ?? null, at: new Date().toISOString() };
}

export async function anchorFormsHandler(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401);
  const { data: { user }, error: authErr } = await db().auth.getUser(auth.slice(7));
  if (authErr || !user) return json({ ok: false, error: "Unauthorized" }, 401);

  let body: any = {};
  try { body = await request.json(); } catch { /* allow empty */ }
  const action = body.action as string;

  // Anchor → Confidential: a confidential form exists only for admins and people with
  // the "Anchor — Confidential" permission. This route runs as the service role (RLS
  // doesn't apply), so every action checks it here. Its files go under "confidential/".
  let confOk: boolean | null = null;
  const canSeeConfidential = async () => {
    if (confOk === null) {
      const { data } = await db().rpc("can_see_anchor_confidential", { p_user_id: user.id });
      confOk = data === true;
    }
    return confOk;
  };
  const hiddenFromCaller = async (sub: any) => !!sub?.confidential && !(await canSeeConfidential());
  const inArea = (confidential: boolean | null | undefined, path: string) => (confidential ? `confidential/${path}` : path);

  try {
    // ── Generate: save submission + build PDF ──
    if (action === "generate") {
      const def = getFormDef(body.formKey);
      if (!def) return json({ ok: false, error: `Unknown form: ${body.formKey}` }, 400);
      const values = (body.values ?? {}) as Record<string, unknown>;
      const confidential = body.confidential === true;
      if (confidential && !(await canSeeConfidential())) return json({ ok: false, error: "You don't have access to Anchor's confidential area." }, 403);

      const { data: sub, error } = await db().from("anchor_form_submissions").insert({
        form_key: def.key, title: def.title, values, status: "completed", created_by: user.id, confidential,
      }).select("id").single();
      if (error) return json({ ok: false, error: error.message }, 500);

      // DMA notices render the authority-exact bilingual (EN/AR) PDF via Graph;
      // everything else uses the in-house pdf-lib renderer. Fall back to pdf-lib
      // if the Graph conversion fails so a document is always produced.
      let pdfBytes: Uint8Array; let pdfWarning: string | null = null;
      if (def.key === "cf12a") {
        try { pdfBytes = await generateCf12aPdf(values); }
        catch (e: any) { pdfWarning = `Official CF12a fill failed (${e?.message ?? e}); served a plain version`; pdfBytes = await buildFormPdf(def, values); }
      } else if (def.key.startsWith("dma-")) {
        try { pdfBytes = await generateDmaPdf(def.key, values, def.title); }
        catch (e: any) { pdfWarning = `Bilingual PDF failed (${e?.message ?? e}); served the English version`; pdfBytes = await buildFormPdf(def, values); }
      } else {
        pdfBytes = await buildFormPdf(def, values);
      }
      const path = inArea(confidential, `forms/${sub.id}.pdf`);
      const { error: upErr } = await db().storage.from(BUCKET)
        .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
      if (upErr) return json({ ok: false, error: `PDF upload failed: ${upErr.message}` }, 500);

      await db().from("anchor_form_submissions").update({ pdf_path: path, updated_at: new Date().toISOString() }).eq("id", sub.id);
      return json({ ok: true, submissionId: sub.id, pdfUrl: await signedUrl(path), emailTo: def.emailTo ?? null, title: def.title, pdfWarning });
    }

    // ── Email: send the completed PDF link ──
    if (action === "email") {
      const { data: sub } = await db().from("anchor_form_submissions").select("*").eq("id", body.submissionId).maybeSingle();
      if (!sub?.pdf_path || await hiddenFromCaller(sub)) return json({ ok: false, error: "Submission or PDF not found" }, 404);
      const to = String(body.to ?? "").trim();
      if (!to) return json({ ok: false, error: "Recipient email required" }, 400);
      const url = await signedUrl(sub.pdf_path);
      await sendEmail({
        from: ANCHOR_SENDER,
        to: [to],
        cc: body.cc ? [String(body.cc)] : [],
        subject: body.subject || `${sub.title}`,
        html: `<p>${body.message ? String(body.message).replace(/</g, "&lt;") + "<br><br>" : ""}Please find the completed <strong>${sub.title}</strong> here:</p><p><a href="${url}">Open document</a></p><p style="color:#94a3b8;font-size:12px;">Sent via Anchor · JLS Yachts</p>`,
        text: `${sub.title}\n\nOpen the document: ${url}`,
      });
      await db().from("anchor_form_submissions").update({ status: "emailed", updated_at: new Date().toISOString() }).eq("id", sub.id);
      return json({ ok: true });
    }

    // ── Sign: create an Anchor e-Sign document from the PDF + send it ──
    if (action === "sign") {
      const { data: sub } = await db().from("anchor_form_submissions").select("*").eq("id", body.submissionId).maybeSingle();
      if (!sub?.pdf_path || await hiddenFromCaller(sub)) return json({ ok: false, error: "Submission or PDF not found" }, 404);
      const signerName = String(body.signerName ?? "").trim();
      const signerEmail = String(body.signerEmail ?? "").trim();
      if (!signerName || !signerEmail) return json({ ok: false, error: "Signer name and email required" }, 400);

      const token = (globalThis.crypto as any).randomUUID().replace(/-/g, "");
      const base = (process.env.VITE_APP_URL as string | undefined) ?? new URL(request.url).origin;
      const expires = new Date(Date.now() + 14 * 86400_000).toISOString();

      const { data: doc, error } = await db().from("esign_documents").insert({
        title: sub.title, file_path: sub.pdf_path, file_name: `${sub.title}.pdf`,
        signer_name: signerName, signer_email: signerEmail,
        status: "sent", signing_token: token, token_expires_at: expires,
        sent_at: new Date().toISOString(), created_by: user.id,
        confidential: !!sub.confidential, // a confidential form makes a confidential document
      }).select("id").single();
      if (error) return json({ ok: false, error: error.message }, 500);

      const link = `${base}/sign/${token}`;
      await sendEmail({
        from: ANCHOR_SENDER,
        to: [signerEmail],
        subject: `Signature requested: ${sub.title}`,
        html: `<p>Dear ${signerName.replace(/</g, "&lt;")},</p><p>You have a document waiting for your signature: <strong>${sub.title}</strong>.</p><p><a href="${link}">Review &amp; sign</a></p><p style="color:#94a3b8;font-size:12px;">This link expires in 14 days. JLS Yachts · Anchor</p>`,
        text: `You have a document to sign: ${sub.title}\nReview & sign: ${link}`,
      });
      try { await db().from("esign_events").insert([{ document_id: doc.id, event: "sent", actor: user.email ?? "anchor" }]); } catch { /* non-fatal */ }
      await db().from("anchor_form_submissions").update({ status: "sent_for_signature", esign_document_id: doc.id, updated_at: new Date().toISOString() }).eq("id", sub.id);
      return json({ ok: true, documentId: doc.id });
    }

    // ── Submit for approval: start the DMA approval chain ──
    if (action === "submit-approval") {
      const chain = (body.chain ?? []) as { name: string; email: string }[];
      if (!chain.length) return json({ ok: false, error: "Add at least one approver" }, 400);
      const { data: sub } = await db().from("anchor_form_submissions").select("id, title, pdf_path, confidential").eq("id", body.submissionId).maybeSingle();
      if (!sub?.pdf_path || await hiddenFromCaller(sub)) return json({ ok: false, error: "Submission or PDF not found" }, 404);

      await db().from("anchor_form_submissions").update({
        approval_status: "pending", approval_chain: chain, approval_step: 0,
        approval_log: [logEntry(user.email ?? "user", "submitted")],
        signatory_id: body.signatoryId || null, authority_email: body.authorityEmail || null,
        updated_at: new Date().toISOString(),
      }).eq("id", sub.id);

      const first = chain[0];
      const url = await signedUrl(sub.pdf_path);
      await sendEmail({
        from: ANCHOR_SENDER, to: [first.email],
        subject: `Approval needed: ${sub.title}`,
        html: `<p>Dear ${(first.name || "").replace(/</g, "&lt;")},</p><p>The document <strong>${sub.title}</strong> needs your approval.</p><p><a href="${url}">Review the document</a>, then approve it in Polaris → Anchor → Forms.</p><p style="color:#94a3b8;font-size:12px;">JLS Yachts · Anchor</p>`,
        text: `Approval needed: ${sub.title}. Review: ${url}`,
      }).catch(() => {});
      return json({ ok: true });
    }

    // ── Approve: advance the chain; finalise (stamp + email authority) on the last step ──
    if (action === "approve") {
      const { data: sub } = await db().from("anchor_form_submissions").select("*").eq("id", body.submissionId).maybeSingle();
      if (!sub || await hiddenFromCaller(sub)) return json({ ok: false, error: "Submission not found" }, 404);
      if (sub.approval_status !== "pending") return json({ ok: false, error: "Not awaiting approval" }, 400);
      const chain = (sub.approval_chain ?? []) as { name: string; email: string }[];
      const step = sub.approval_step ?? 0;
      const approver = chain[step];
      const log = [...(sub.approval_log ?? []), logEntry(user.email ?? "user", "approved", body.note)];

      if (step >= chain.length - 1) {
        // Final approval → stamp signatory signature + email the authority.
        let finalPath = sub.pdf_path;
        if (sub.signatory_id && sub.pdf_path) {
          const out = inArea(sub.confidential, `forms/${sub.id}-signed.pdf`);
          const ok = await stampSignature(sub.pdf_path, sub.signatory_id, out).catch(() => false);
          if (ok) finalPath = out;
        }
        await db().from("anchor_form_submissions").update({
          approval_status: "approved", approval_step: step, signed_pdf_path: finalPath !== sub.pdf_path ? finalPath : null,
          approval_log: [...log, logEntry("system", "finalised")], status: "approved", updated_at: new Date().toISOString(),
        }).eq("id", sub.id);

        if (sub.authority_email) {
          const url = await signedUrl(finalPath);
          await sendEmail({
            from: ANCHOR_SENDER, to: [sub.authority_email],
            subject: sub.title,
            html: `<p>Please find the approved <strong>${sub.title}</strong> attached for your records.</p><p><a href="${url}">Open document</a></p><p style="color:#94a3b8;font-size:12px;">JLS Yachts · Anchor</p>`,
            text: `${sub.title}\nOpen: ${url}`,
          }).catch(() => {});
        }
        return json({ ok: true, finalised: true });
      }

      // Escalate to the next approver.
      const next = chain[step + 1];
      await db().from("anchor_form_submissions").update({
        approval_step: step + 1, approval_log: log, updated_at: new Date().toISOString(),
      }).eq("id", sub.id);
      const url = await signedUrl(sub.pdf_path);
      await sendEmail({
        from: ANCHOR_SENDER, to: [next.email],
        subject: `Approval needed: ${sub.title}`,
        html: `<p>Dear ${(next.name || "").replace(/</g, "&lt;")},</p><p><strong>${(approver?.name) || "A colleague"}</strong> approved <strong>${sub.title}</strong> — it now needs your approval.</p><p><a href="${url}">Review the document</a>, then approve it in Polaris → Anchor → Forms.</p>`,
        text: `Approval needed: ${sub.title}. Review: ${url}`,
      }).catch(() => {});
      return json({ ok: true, escalatedTo: next.email });
    }

    // ── Reject ──
    if (action === "reject") {
      const { data: sub } = await db().from("anchor_form_submissions").select("approval_log, confidential").eq("id", body.submissionId).maybeSingle();
      if (!sub || await hiddenFromCaller(sub)) return json({ ok: false, error: "Submission not found" }, 404);
      await db().from("anchor_form_submissions").update({
        approval_status: "rejected", status: "completed",
        approval_log: [...(sub.approval_log ?? []), logEntry(user.email ?? "user", "rejected", body.note)],
        updated_at: new Date().toISOString(),
      }).eq("id", body.submissionId);
      return json({ ok: true });
    }

    return json({ ok: false, error: "Unknown action" }, 400);
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? "Anchor forms action failed" }, 500);
  }
}
