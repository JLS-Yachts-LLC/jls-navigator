/**
 * Anchor — Signature Campaigns API. POST /api/esign-campaigns (staff only).
 *
 * A campaign sends one document to many people, but every recipient gets their
 * OWN email (To: them alone — no CC, no shared list), their OWN esign_documents
 * row and their OWN signing link. The browser drives the send one recipient per
 * call ("send-one"), so a big campaign never hits the Worker's time/subrequest
 * limits and an interrupted send can simply be resumed.
 *
 * Actions:
 *   status        → whether outbound / client email is switched on (mail guard)
 *   test          → send the campaign email to the caller only (inactive link)
 *   send-one      → create + send one recipient's personal document
 *   remind        → re-send a recipient's email (same link, expiry extended)
 *   staff-upload  → attach a paper-signed copy a client returned by email
 *   cancel        → withdraw every unsigned document in the campaign
 */
import { requireStaff } from "@/lib/guest/guest-auth.server";
import { sendEmail } from "@/lib/ses.server";
import { outboundEmailEnabled, clientEmailEnabled, ClientEmailDisabledError } from "@/lib/mail-guard.server";
import { renderCampaignEmail, mergeTags } from "@/lib/esign/campaign-email";
import { buildFormPdfDetailed } from "@/lib/anchor-forms/pdf.server";
import { getFormDef } from "@/lib/anchor-forms/definitions";
import { buildUploadedSignedPdf } from "@/lib/esign/signed-copy.server";

const BUCKET = "esign-documents";
const ANCHOR_SENDER = process.env.ANCHOR_MAIL_SENDER ?? "anchor@jlsyachts.com";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function baseUrl(request: Request): string {
  return ((process.env.VITE_APP_URL as string | undefined) || new URL(request.url).origin).replace(/\/$/, "");
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/^data:[^,]+,/, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);

/** "14-Oct-26" — the date style used on JLS letters. */
function letterDate(d = new Date()): string {
  const p = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Dubai" }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")}`;
}

type Built = { bytes: Uint8Array; signatureFields: any[] };

/** The recipient's personal copy of the campaign document. */
async function buildDocument(sb: any, campaign: any, recipient: any, yacht: any): Promise<Built> {
  if (campaign.source_kind === "form") {
    const def = getFormDef(campaign.form_key);
    if (!def) throw new Error(`Unknown form "${campaign.form_key}"`);
    const values: Record<string, unknown> = {
      letter_date: letterDate(),
      // The letter already prints M/Y “…”, so drop a prefix if the record has one.
      vessel_name: String(yacht?.vessel_name ?? "").replace(/^(M\/?Y|S\/?Y)\.?\s+/i, ""),
      imo: yacht?.imo_no || yacht?.official_no || "",
      signatory_name: recipient.name,
      signatory_title: recipient.role || "",
    };
    const { bytes, signature } = await buildFormPdfDetailed(def, values);
    return {
      bytes,
      signatureFields: signature ? [{ page: signature.page, x: signature.x, y: signature.y, role: "client", label: false }] : [],
    };
  }
  const { data: tpl } = await sb.from("esign_templates").select("file_path, signature_fields").eq("id", campaign.template_id).maybeSingle();
  if (!tpl?.file_path) throw new Error("The campaign's template no longer exists");
  const { data: blob, error } = await sb.storage.from(BUCKET).download(tpl.file_path);
  if (error || !blob) throw new Error("Could not load the template PDF");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), signatureFields: Array.isArray(tpl.signature_fields) ? tpl.signature_fields : [] };
}

function docTitleFor(campaign: any, vessel: string | null): string {
  return vessel ? `${campaign.doc_title} — ${vessel}` : campaign.doc_title;
}

async function finishIfDone(sb: any, campaignId: string) {
  const { count } = await sb.from("esign_campaign_recipients")
    .select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "pending");
  if (!count) {
    await sb.from("esign_campaigns").update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", campaignId).in("status", ["draft", "sending"]);
  }
}

export async function esignCampaignsHandler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const { sb, staff } = gate;

  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }
  const action = String(body.action ?? "");

  try {
    if (action === "status") {
      return json({ ok: true, emailEnabled: outboundEmailEnabled(), clientEmailEnabled: clientEmailEnabled() });
    }

    // ── Test: the real email, to the caller only ──
    if (action === "test") {
      const { data: campaign } = await sb.from("esign_campaigns").select("*").eq("id", body.campaignId).maybeSingle();
      if (!campaign) return json({ error: "Campaign not found" }, 404);
      const { data: first } = await sb.from("esign_campaign_recipients")
        .select("*, yachts:yacht_id(vessel_name, imo_no, official_no)").eq("campaign_id", campaign.id)
        .order("created_at").limit(1).maybeSingle();
      const sample = first ?? { name: staff.name, role: null, yacht_id: null, yachts: null };
      const vessel = (sample as any).yachts?.vessel_name ?? null;
      const mail = renderCampaignEmail({
        subject: campaign.subject, heading: campaign.heading, note: campaign.note, signOff: campaign.sign_off,
        docTitle: campaign.doc_title, includePdf: campaign.include_pdf, allowEsign: campaign.allow_esign, expiresDays: campaign.expires_days,
      }, { name: sample.name, vessel }, { link: `${baseUrl(request)}/sign/test-preview`, sender: staff.name });
      const attachments = [];
      if (campaign.include_pdf) {
        const built = await buildDocument(sb, campaign, sample, (sample as any).yachts);
        attachments.push({ filename: `${safeName(docTitleFor(campaign, vessel))}.pdf`, contentBase64: toBase64(built.bytes), contentType: "application/pdf" });
      }
      await sendEmail({
        from: ANCHOR_SENDER, to: [staff.email], replyTo: [staff.email],
        subject: `[TEST] ${mail.subject}`, html: mail.html, text: mail.text, attachments,
      });
      return json({ ok: true, sentTo: staff.email, sample: sample.name });
    }

    // ── Send one recipient their own document ──
    if (action === "send-one") {
      const { data: r } = await sb.from("esign_campaign_recipients")
        .select("*, yachts:yacht_id(vessel_name, imo_no, official_no)").eq("id", body.recipientId).maybeSingle();
      if (!r) return json({ error: "Recipient not found" }, 404);
      if (r.status === "sent" && r.esign_document_id) return json({ ok: true, skipped: true, status: "sent" });
      if (r.status === "cancelled") return json({ ok: true, skipped: true, status: "cancelled" });
      const { data: campaign } = await sb.from("esign_campaigns").select("*").eq("id", r.campaign_id).maybeSingle();
      if (!campaign) return json({ error: "Campaign not found" }, 404);
      if (campaign.status === "cancelled") return json({ error: "This campaign was cancelled" }, 409);
      const email = String(r.email ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await sb.from("esign_campaign_recipients").update({ status: "failed", error: "Invalid email address" }).eq("id", r.id);
        return json({ ok: false, status: "failed", error: "Invalid email address" });
      }
      if (campaign.status === "draft") await sb.from("esign_campaigns").update({ status: "sending" }).eq("id", campaign.id);

      const vessel: string | null = r.yachts?.vessel_name ?? null;
      const title = docTitleFor(campaign, vessel);
      const built = await buildDocument(sb, campaign, r, r.yachts);
      const filePath = `campaigns/${campaign.id}/${r.id}.pdf`;
      const up = await sb.storage.from(BUCKET).upload(filePath, built.bytes, { contentType: "application/pdf", upsert: true });
      if (up.error) throw new Error(`Could not store the document: ${up.error.message}`);

      const token = randomToken();
      const now = new Date();
      const link = `${baseUrl(request)}/sign/${token}`;
      const mergedNote = mergeTags(campaign.note ?? "", { name: r.name, vessel }, campaign.doc_title, staff.name).trim();
      const { data: doc, error: docErr } = await sb.from("esign_documents").insert({
        title, description: campaign.name, file_path: filePath, file_name: `${safeName(title)}.pdf`,
        signer_name: r.name, signer_email: email, message: mergedNote || null,
        status: "sent", signing_token: token,
        token_expires_at: new Date(now.getTime() + campaign.expires_days * 86400_000).toISOString(),
        sent_at: now.toISOString(), created_by: staff.userId,
        signature_fields: built.signatureFields,
        campaign_id: campaign.id, yacht_id: r.yacht_id ?? null, allow_esign: campaign.allow_esign,
      }).select("id").single();
      if (docErr) throw new Error(docErr.message);

      const mail = renderCampaignEmail({
        subject: campaign.subject, heading: campaign.heading, note: campaign.note, signOff: campaign.sign_off,
        docTitle: campaign.doc_title, includePdf: campaign.include_pdf, allowEsign: campaign.allow_esign, expiresDays: campaign.expires_days,
      }, { name: r.name, vessel }, { link, sender: staff.name });

      try {
        await sendEmail({
          from: ANCHOR_SENDER,
          to: [email], // one recipient per email — never CC'd or batched
          replyTo: [staff.email],
          subject: mail.subject, html: mail.html, text: mail.text,
          attachments: campaign.include_pdf
            ? [{ filename: `${safeName(title)}.pdf`, contentBase64: toBase64(built.bytes), contentType: "application/pdf" }]
            : undefined,
        });
      } catch (e: any) {
        // Nothing went out — remove the unsent document so it can't be signed or confused.
        await sb.from("esign_documents").delete().eq("id", doc.id);
        await sb.storage.from(BUCKET).remove([filePath]).catch(() => {});
        const held = e instanceof ClientEmailDisabledError;
        const msg = held ? "Not sent — client email is switched off in Polaris" : String(e?.message ?? e).slice(0, 300);
        await sb.from("esign_campaign_recipients").update({ status: held ? "held" : "failed", error: msg }).eq("id", r.id);
        return json({ ok: false, status: held ? "held" : "failed", error: msg });
      }

      await sb.from("esign_events").insert([{ document_id: doc.id, event: "sent", actor: staff.email }]);
      await sb.from("esign_campaign_recipients").update({
        status: "sent", esign_document_id: doc.id, sent_at: now.toISOString(), error: null,
      }).eq("id", r.id);
      await finishIfDone(sb, campaign.id);
      return json({ ok: true, status: "sent", documentId: doc.id });
    }

    // ── Reminder: same personal link, expiry extended ──
    if (action === "remind") {
      const { data: r } = await sb.from("esign_campaign_recipients")
        .select("*, yachts:yacht_id(vessel_name)").eq("id", body.recipientId).maybeSingle();
      if (!r?.esign_document_id) return json({ error: "This recipient hasn't been sent anything yet" }, 400);
      const [{ data: campaign }, { data: doc }] = await Promise.all([
        sb.from("esign_campaigns").select("*").eq("id", r.campaign_id).maybeSingle(),
        sb.from("esign_documents").select("*").eq("id", r.esign_document_id).maybeSingle(),
      ]);
      if (!campaign || !doc) return json({ error: "Document not found" }, 404);
      if (doc.status === "signed") return json({ error: "Already signed" }, 409);
      if (["declined", "voided"].includes(doc.status)) return json({ error: `This document was ${doc.status}` }, 409);

      const vessel: string | null = r.yachts?.vessel_name ?? null;
      const link = `${baseUrl(request)}/sign/${doc.signing_token}`;
      const mail = renderCampaignEmail({
        subject: `Reminder: ${campaign.subject}`, heading: campaign.heading, note: campaign.note, signOff: campaign.sign_off,
        docTitle: campaign.doc_title, includePdf: campaign.include_pdf, allowEsign: campaign.allow_esign, expiresDays: campaign.expires_days,
      }, { name: r.name, vessel }, { link, sender: staff.name });
      let attachments;
      if (campaign.include_pdf) {
        const { data: blob } = await sb.storage.from(BUCKET).download(doc.file_path);
        if (blob) attachments = [{ filename: doc.file_name || `${safeName(doc.title)}.pdf`, contentBase64: toBase64(new Uint8Array(await blob.arrayBuffer())), contentType: "application/pdf" }];
      }
      try {
        await sendEmail({ from: ANCHOR_SENDER, to: [doc.signer_email], replyTo: [staff.email], subject: mail.subject, html: mail.html, text: mail.text, attachments });
      } catch (e: any) {
        const held = e instanceof ClientEmailDisabledError;
        return json({ ok: false, error: held ? "Not sent — client email is switched off in Polaris" : String(e?.message ?? e) });
      }
      const now = new Date();
      await sb.from("esign_documents").update({
        token_expires_at: new Date(now.getTime() + campaign.expires_days * 86400_000).toISOString(),
        ...(doc.status === "expired" ? { status: "sent" } : {}),
      }).eq("id", doc.id);
      await sb.from("esign_events").insert([{ document_id: doc.id, event: "reminded", actor: staff.email }]);
      await sb.from("esign_campaign_recipients").update({
        last_reminded_at: now.toISOString(), remind_count: (r.remind_count ?? 0) + 1,
      }).eq("id", r.id);
      return json({ ok: true });
    }

    // ── Staff attach a paper-signed copy (client replied by email) ──
    if (action === "staff-upload") {
      const contentType = String(body.contentType ?? "");
      if (!/^(application\/pdf|image\/png|image\/jpe?g)$/i.test(contentType)) return json({ error: "Upload a PDF, PNG or JPEG" }, 400);
      const bytes = fromBase64(String(body.fileBase64 ?? ""));
      if (!bytes.length) return json({ error: "The file was empty" }, 400);
      if (bytes.length > 15 * 1024 * 1024) return json({ error: "That file is too large (15 MB maximum)" }, 400);
      const { data: r } = await sb.from("esign_campaign_recipients").select("id, esign_document_id").eq("id", body.recipientId).maybeSingle();
      if (!r?.esign_document_id) return json({ error: "This recipient hasn't been sent anything yet" }, 400);
      const { data: doc } = await sb.from("esign_documents").select("*").eq("id", r.esign_document_id).maybeSingle();
      if (!doc) return json({ error: "Document not found" }, 404);
      if (doc.status === "signed") return json({ error: "Already signed" }, 409);
      const at = new Date();
      let out: Uint8Array;
      try {
        out = await buildUploadedSignedPdf(bytes, contentType, {
          title: doc.title, reference: doc.reference, signerName: doc.signer_name, signerEmail: doc.signer_email,
          by: `${staff.name} (JLS staff, copy returned by the signer)`, at,
        });
      } catch { return json({ error: "That file could not be read" }, 400); }
      const signedPath = `signed/${doc.id}.pdf`;
      const up = await sb.storage.from(BUCKET).upload(signedPath, out, { contentType: "application/pdf", upsert: true });
      if (up.error) throw new Error(up.error.message);
      await sb.from("esign_documents").update({
        status: "signed", signed_at: at.toISOString(), signed_file_path: signedPath, signed_method: "staff_upload",
      }).eq("id", doc.id);
      await sb.from("esign_events").insert([{ document_id: doc.id, event: "signed_staff_upload", actor: staff.email }]);
      return json({ ok: true });
    }

    // ── Cancel: withdraw everything unsigned ──
    if (action === "cancel") {
      const { data: campaign } = await sb.from("esign_campaigns").select("id").eq("id", body.campaignId).maybeSingle();
      if (!campaign) return json({ error: "Campaign not found" }, 404);
      await sb.from("esign_documents").update({ status: "voided" })
        .eq("campaign_id", campaign.id).in("status", ["draft", "sent", "viewed", "expired"]);
      await sb.from("esign_campaign_recipients").update({ status: "cancelled" })
        .eq("campaign_id", campaign.id).in("status", ["pending", "held", "failed"]);
      await sb.from("esign_campaigns").update({ status: "cancelled" }).eq("id", campaign.id);
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e: any) {
    console.error("[esign-campaigns]", action, e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
}
