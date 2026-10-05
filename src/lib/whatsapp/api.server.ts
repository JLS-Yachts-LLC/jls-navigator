/**
 * Communications → WhatsApp — HTTP handlers.
 *
 *   GET  /api/whatsapp/status               connection + number health       (communications view)
 *   POST /api/whatsapp/templates/submit     send a template to Meta's review  (edit)
 *   POST /api/whatsapp/templates/sync       refresh every template's status  (edit)
 *   POST /api/whatsapp/campaigns/send       send the next batch of a campaign (edit)
 *   POST /api/whatsapp/optin/invite         email opt-in invitations          (edit)
 *   GET  /api/whatsapp/optin?token=…        public: what the invitation shows
 *   POST /api/whatsapp/optin                public: the client's answer
 *   GET  /api/whatsapp/webhook              Meta's verification handshake
 *   POST /api/whatsapp/webhook              Meta: receipts, replies, opt-outs, template verdicts
 *
 * Consent is never decided here. Every change goes through wa_record_consent()
 * and every send through wa_claim_batch(), which re-checks it per message.
 */
import { createClient } from "@supabase/supabase-js";
import { requireAccess } from "@/lib/auth/requireAccess.server";
import { appBaseUrl } from "@/lib/app-url.server";
import { sendGraphEmail } from "@/lib/graph-mail.server";
import {
  waConfig, sendingEnabled, configPresence, phoneInfo, createTemplate, listTemplates,
  sendTemplate, verifySignature, verifyToken, MetaError,
} from "@/lib/whatsapp/cloud-api.server";
import {
  OPTIN_WORDING_VERSION, OPTIN_CATEGORY_TEXT, OPTIN_STOP_TEXT, optinStatement, toE164, stopIntent,
  placeholderCount, MARKETING_OPT_OUT_BUTTON,
} from "@/lib/whatsapp/shared";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function admin(): any {
  return createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function dialCodes(db: any): Promise<string[]> {
  const { data } = await db.from("country_dial_codes").select("dial_code");
  return ((data ?? []) as any[]).map((r) => String(r.dial_code));
}

// ─── Status ───────────────────────────────────────────────────────────────────

export async function whatsappStatusHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "communications", level: "view" });
  if (!access.ok) return access.response;
  const presence = configPresence();
  const cfg = waConfig();
  let number: unknown = null;
  let error: string | null = null;
  if (cfg) {
    try { number = await phoneInfo(cfg); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  }
  return json({
    connected: !!cfg && !error,
    presence,
    number,
    error,
    webhook_url: `${appBaseUrl()}/api/whatsapp/webhook`,
  });
}

// ─── Templates ────────────────────────────────────────────────────────────────

const META_STATUS: Record<string, string> = {
  APPROVED: "approved", PENDING: "pending", IN_APPEAL: "pending", REJECTED: "rejected",
  PAUSED: "paused", DISABLED: "disabled", PENDING_DELETION: "disabled", DELETED: "disabled",
  LIMIT_EXCEEDED: "disabled", FLAGGED: "paused",
};

export async function whatsappTemplateSubmitHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "communications", level: "edit" });
  if (!access.ok) return access.response;
  const cfg = waConfig();
  if (!cfg) return json({ error: "WhatsApp isn't connected yet — see the Overview tab." }, 409);

  const { templateId } = (await request.json().catch(() => ({}))) as { templateId?: string };
  const db = admin();
  const { data: t } = await db.from("wa_templates").select("*").eq("id", templateId).maybeSingle();
  if (!t) return json({ error: "Template not found" }, 404);
  if (!["draft", "rejected"].includes(t.status)) {
    return json({ error: `This template is ${t.status} — only a draft or a rejected template can be submitted.` }, 409);
  }

  const samples = Array.isArray(t.sample_values) ? t.sample_values.map(String) : [];
  const needed = placeholderCount(t.body_text);
  if (samples.length < needed || samples.slice(0, needed).some((s: string) => !s.trim())) {
    return json({ error: `Meta needs an example for each of the ${needed} placeholder(s) in the message.` }, 400);
  }

  try {
    const out = await createTemplate(cfg, {
      name: t.name,
      language: t.language,
      category: t.category,
      header_text: t.header_text,
      body_text: t.body_text,
      footer_text: t.footer_text,
      sample_values: samples.slice(0, needed),
      // Every marketing template carries the opt-out button, so a client can
      // stop promotions without having to block JLS.
      buttons: t.category === "MARKETING" ? [MARKETING_OPT_OUT_BUTTON] : [],
    });
    await db.from("wa_templates").update({
      meta_template_id: out.id,
      status: META_STATUS[out.status.toUpperCase()] ?? "pending",
      rejection_reason: null,
      submitted_at: new Date().toISOString(),
      status_updated_at: new Date().toISOString(),
    }).eq("id", t.id);
    return json({ ok: true, status: out.status });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, e instanceof MetaError ? 422 : 500);
  }
}

export async function whatsappTemplateSyncHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "communications", level: "edit" });
  if (!access.ok) return access.response;
  const cfg = waConfig();
  if (!cfg) return json({ error: "WhatsApp isn't connected yet." }, 409);
  try {
    const remote = await listTemplates(cfg);
    const db = admin();
    let updated = 0;
    for (const r of remote) {
      const { data } = await db.from("wa_templates").update({
        meta_template_id: r.id,
        status: META_STATUS[String(r.status).toUpperCase()] ?? "pending",
        rejection_reason: r.rejected_reason && r.rejected_reason !== "NONE" ? r.rejected_reason : null,
        status_updated_at: new Date().toISOString(),
      }).eq("name", r.name).eq("language", r.language).select("id");
      updated += (data ?? []).length;
    }
    return json({ ok: true, onMeta: remote.length, updated });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
}

// ─── Sending ──────────────────────────────────────────────────────────────────

/** Per call. Each message is ~2 subrequests, well inside a Worker's budget. */
const BATCH = 100;

export async function whatsappCampaignSendHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "communications", level: "edit" });
  if (!access.ok) return access.response;
  const cfg = waConfig();
  if (!cfg) return json({ error: "WhatsApp isn't connected yet — see the Overview tab." }, 409);
  if (!sendingEnabled()) {
    return json({
      error: "Sending is switched off. Set WHATSAPP_SENDING_ENABLED = true on the Worker when you're ready to send for real.",
    }, 409);
  }

  const { campaignId } = (await request.json().catch(() => ({}))) as { campaignId?: string };
  const db = admin();
  const { data: c } = await db.from("wa_campaigns")
    .select("*, template:wa_templates(*)").eq("id", campaignId).maybeSingle();
  if (!c) return json({ error: "Send not found" }, 404);
  const t = c.template;
  if (!t || t.status !== "approved") return json({ error: "The template must be approved by Meta before it can be sent." }, 409);
  if (!["draft", "sending"].includes(c.status)) return json({ error: `This send is already ${c.status}.` }, 409);

  const needed = placeholderCount(t.body_text);
  const values: string[] = (Array.isArray(c.variables) ? c.variables : []).map(String);
  if (values.length < needed || values.slice(0, needed).some((v) => !v.trim())) {
    return json({ error: `Fill in all ${needed} value(s) for the template's placeholders.` }, 400);
  }

  if (c.status === "draft") {
    const { error: qErr } = await db.rpc("wa_queue_campaign", { p_campaign: c.id });
    if (qErr) return json({ error: qErr.message }, 500);
    await db.from("wa_campaigns").update({ status: "sending", started_at: new Date().toISOString() }).eq("id", c.id);
  }

  const { data: batch, error: bErr } = await db.rpc("wa_claim_batch", { p_campaign: c.id, p_limit: BATCH });
  if (bErr) return json({ error: bErr.message }, 500);

  let sent = 0, failed = 0;
  for (const m of (batch ?? []) as Array<{ message_id: string; phone_e164: string; contact_name: string }>) {
    try {
      const wamid = await sendTemplate(cfg, {
        toE164: m.phone_e164,
        name: t.name,
        language: t.language,
        bodyValues: values.slice(0, needed).map((v) => v.replace(/\{\{\s*name\s*\}\}/gi, m.contact_name || "there")),
      });
      await db.from("wa_messages").update({
        status: "sent", wa_message_id: wamid, sent_at: new Date().toISOString(), phone_e164: m.phone_e164,
      }).eq("id", m.message_id);
      sent++;
    } catch (e) {
      await db.from("wa_messages").update({
        status: "failed", failed_at: new Date().toISOString(),
        error_code: e instanceof MetaError && e.code != null ? String(e.code) : null,
        error_message: (e instanceof Error ? e.message : String(e)).slice(0, 500),
      }).eq("id", m.message_id);
      failed++;
    }
  }

  const { count: remaining } = await db.from("wa_messages")
    .select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("status", "queued");
  const done = !remaining;
  if (done) {
    await db.from("wa_campaigns").update({ status: "sent", finished_at: new Date().toISOString() }).eq("id", c.id);
  }
  return json({ ok: true, sent, failed, remaining: remaining ?? 0, done });
}

// ─── Opt-in by email ──────────────────────────────────────────────────────────

const INVITE_DAYS = 30;

function inviteEmail(name: string, link: string): string {
  return `<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:560px;">
  <p>Dear ${esc(name || "Captain")},</p>
  <p>JLS Yachts would like to keep you updated on WhatsApp — quicker than email when you're on the move.</p>
  <p>Before we send you anything there, we need your permission. Choose what you'd like to receive
     and confirm the number we should use:</p>
  <p style="margin:24px 0;">
    <a href="${esc(link)}" style="background:#0d9488;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:bold;">
      Choose your WhatsApp preferences
    </a>
  </p>
  <p style="font-size:13px;color:#475569;">You can choose either or both:</p>
  <ul style="font-size:13px;color:#475569;">
    <li>${esc(OPTIN_CATEGORY_TEXT.updates)}</li>
    <li>${esc(OPTIN_CATEGORY_TEXT.marketing)}</li>
  </ul>
  <p style="font-size:13px;color:#475569;">${esc(OPTIN_STOP_TEXT)}</p>
  <p style="font-size:13px;color:#475569;">If you'd rather not, just ignore this email — we won't message you on WhatsApp unless you say yes. The link expires in ${INVITE_DAYS} days.</p>
  <p>Kind regards,<br>JLS Yachts</p>
</div>`;
}

export async function whatsappOptinInviteHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "communications", level: "edit" });
  if (!access.ok) return access.response;
  const { contactIds } = (await request.json().catch(() => ({}))) as { contactIds?: string[] };
  if (!Array.isArray(contactIds) || !contactIds.length) return json({ error: "No contacts chosen" }, 400);
  if (contactIds.length > 200) return json({ error: "Invite at most 200 at a time." }, 400);

  const db = admin();
  const { data: contacts } = await db.from("wa_contacts")
    .select("id, name, email, consent_status").in("id", contactIds);

  const results = { sent: 0, skipped: [] as Array<{ name: string; reason: string }>, failed: [] as Array<{ name: string; reason: string }> };
  for (const c of (contacts ?? []) as any[]) {
    if (!c.email) { results.skipped.push({ name: c.name, reason: "no email address" }); continue; }
    // A decision already made isn't reopened by a marketing email.
    if (c.consent_status === "opted_out") { results.skipped.push({ name: c.name, reason: "has opted out" }); continue; }
    if (c.consent_status === "opted_in") { results.skipped.push({ name: c.name, reason: "already opted in" }); continue; }

    const raw = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const link = `${appBaseUrl()}/whatsapp-optin/${raw}`;
    try {
      const { error: insErr } = await db.from("wa_optin_invites").insert({
        contact_id: c.id,
        token_hash: await sha256Hex(raw),
        email: c.email,
        expires_at: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
        sent_by: access.claims.userId,
      });
      if (insErr) throw new Error(insErr.message);
      await sendGraphEmail({
        to: [c.email],
        subject: "WhatsApp updates from JLS Yachts — would you like them?",
        html: inviteEmail(c.name, link),
      });
      await db.rpc("wa_record_consent", {
        p_contact_id: c.id, p_action: "invited", p_updates: null, p_marketing: null, p_channel: "system",
        p_note: `Opt-in invitation emailed to ${c.email} by ${access.claims.email}`,
      });
      results.sent++;
    } catch (e) {
      results.failed.push({ name: c.name, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return json({ ok: true, ...results });
}

async function loadInvite(db: any, token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return { error: "This link isn't valid." as const };
  const { data: inv } = await db.from("wa_optin_invites")
    .select("id, contact_id, expires_at, used_at, contact:wa_contacts(id, name, phone_e164, consent_status, yacht:yachts(vessel_name))")
    .eq("token_hash", await sha256Hex(token)).maybeSingle();
  if (!inv) return { error: "This link isn't valid." as const };
  if (inv.used_at) return { error: "This link has already been used. If you'd like to change your choice, please contact JLS Yachts." as const };
  if (Date.parse(inv.expires_at) < Date.now()) return { error: "This link has expired. Please ask JLS Yachts for a new one." as const };
  return { inv };
}

/** Public. What the opt-in page shows. */
export async function whatsappOptinGetHandler(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const db = admin();
  const r = await loadInvite(db, token);
  if ("error" in r) return json({ error: r.error }, 410);
  return json({
    name: r.inv.contact?.name ?? null,
    vessel: r.inv.contact?.yacht?.vessel_name ?? null,
    phone: r.inv.contact?.phone_e164 ?? null,
    wording_version: OPTIN_WORDING_VERSION,
    categories: OPTIN_CATEGORY_TEXT,
    stop_text: OPTIN_STOP_TEXT,
    dial_codes: await dialCodes(db),
  });
}

/** Public. The client's answer — recorded with exactly what they were shown. */
export async function whatsappOptinPostHandler(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    token?: string; decision?: "accept" | "decline"; phone?: string; updates?: boolean; marketing?: boolean;
  };
  const db = admin();
  const r = await loadInvite(db, body.token ?? "");
  if ("error" in r) return json({ error: r.error }, 410);

  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? null;
  const ua = (request.headers.get("user-agent") ?? "").slice(0, 300) || null;

  if (body.decision === "decline") {
    const { error } = await db.rpc("wa_record_consent", {
      p_contact_id: r.inv.contact_id, p_action: "opted_out", p_updates: false, p_marketing: false,
      p_channel: "email_link", p_note: "Declined from the opt-in invitation",
      p_wording_version: OPTIN_WORDING_VERSION, p_ip: ip, p_user_agent: ua,
    });
    if (error) return json({ error: "Sorry, that didn't save. Please try again." }, 500);
    await db.from("wa_optin_invites").update({ used_at: new Date().toISOString() }).eq("id", r.inv.id);
    return json({ ok: true, decision: "decline" });
  }

  const updates = !!body.updates;
  const marketing = !!body.marketing;
  if (!updates && !marketing) return json({ error: "Tick at least one kind of message, or choose No thanks." }, 400);
  const phone = toE164(body.phone, await dialCodes(db));
  if (!phone) return json({ error: "Please enter your WhatsApp number with its country code, e.g. +971 50 123 4567." }, 400);

  const { error } = await db.rpc("wa_record_consent", {
    p_contact_id: r.inv.contact_id, p_action: "opted_in", p_updates: updates, p_marketing: marketing,
    p_channel: "email_link", p_note: null,
    p_wording_version: OPTIN_WORDING_VERSION,
    p_wording: optinStatement({ phone, updates, marketing }),
    p_phone: phone, p_ip: ip, p_user_agent: ua,
  });
  if (error) return json({ error: "Sorry, that didn't save. Please try again." }, 500);
  await db.from("wa_optin_invites").update({ used_at: new Date().toISOString() }).eq("id", r.inv.id);
  return json({ ok: true, decision: "accept", phone });
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

/** Meta's handshake when the webhook URL is saved in the app dashboard. */
export async function whatsappWebhookVerifyHandler(request: Request): Promise<Response> {
  const u = new URL(request.url);
  const expected = verifyToken();
  if (expected && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === expected) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

async function optOutByPhone(db: any, phoneDigits: string, kind: "all" | "marketing", channel: string, note: string) {
  const phone = `+${phoneDigits.replace(/\D/g, "")}`;
  const { data: contacts } = await db.from("wa_contacts").select("id, consent_updates").eq("phone_e164", phone);
  for (const c of (contacts ?? []) as any[]) {
    await db.rpc("wa_record_consent", {
      p_contact_id: c.id, p_action: "opted_out",
      // Marketing-only keeps operational updates; a full STOP clears everything.
      p_updates: kind === "marketing" ? c.consent_updates : false, p_marketing: false,
      p_channel: channel, p_note: note,
    });
  }
  return (contacts ?? []) as any[];
}

export async function whatsappWebhookHandler(request: Request): Promise<Response> {
  const raw = await request.text();
  if (!(await verifySignature(raw, request.headers.get("x-hub-signature-256")))) {
    return new Response("Invalid signature", { status: 401 });
  }
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
  const db = admin();

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const field = change?.field;
      const v = change?.value ?? {};

      if (field === "messages") {
        // Delivery receipts for what we sent.
        for (const s of v.statuses ?? []) {
          const err = (s.errors ?? [])[0];
          await db.rpc("wa_apply_status", {
            p_wamid: String(s.id), p_status: String(s.status),
            p_at: s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : new Date().toISOString(),
            p_error_code: err?.code != null ? String(err.code) : null,
            p_error: err ? String(err.error_data?.details ?? err.title ?? err.message ?? "").slice(0, 500) : null,
          });
        }
        // Replies — and the opt-outs among them.
        for (const m of v.messages ?? []) {
          const text: string | null =
            m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? null;
          const payloadText: string | null = m.button?.payload ?? m.interactive?.button_reply?.id ?? null;
          const intent = stopIntent(text) ?? stopIntent(payloadText);
          let action: string | null = null;
          let contacts: any[] = [];
          if (intent) {
            const viaButton = !!(m.button || m.interactive);
            contacts = await optOutByPhone(db, String(m.from), intent,
              viaButton ? "whatsapp_button" : "whatsapp_reply",
              `Replied "${String(text ?? payloadText).slice(0, 60)}" on WhatsApp`);
            action = intent === "marketing" ? "marketing_opt_out" : "opt_out";
          }
          const fromPhone = `+${String(m.from).replace(/\D/g, "")}`;
          let contactId = contacts[0]?.id ?? null;
          if (!contactId) {
            const { data: c } = await db.from("wa_contacts").select("id").eq("phone_e164", fromPhone).limit(1).maybeSingle();
            contactId = c?.id ?? null;
          }
          await db.from("wa_inbound").upsert({
            wa_message_id: String(m.id), from_phone: fromPhone, contact_id: contactId,
            type: m.type ?? null, body: text, button_payload: payloadText, action,
            received_at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
            raw: m,
          }, { onConflict: "wa_message_id", ignoreDuplicates: true });
        }
      }

      // Meta's own marketing opt-out / resume (the "Stop promotions" control).
      if (field === "user_preferences") {
        for (const p of v.user_preferences ?? []) {
          if (p.category && !/marketing/i.test(String(p.category))) continue;
          if (String(p.value).toLowerCase() === "stop") {
            await optOutByPhone(db, String(p.wa_id), "marketing", "meta_preferences", "Stopped promotions in WhatsApp");
          } else if (String(p.value).toLowerCase() === "resume") {
            const phone = `+${String(p.wa_id).replace(/\D/g, "")}`;
            const { data: cs } = await db.from("wa_contacts").select("id, consent_status").eq("phone_e164", phone);
            for (const c of (cs ?? []) as any[]) {
              // Resuming promotions restores a marketing consent the person once
              // gave us. It never creates one: someone who only ever agreed to
              // updates hasn't agreed to offers by tapping resume in WhatsApp.
              if (c.consent_status !== "opted_in") continue;
              const { count: hadMarketing } = await db.from("wa_consent_events")
                .select("id", { count: "exact", head: true })
                .eq("contact_id", c.id).eq("consent_marketing", true).in("action", ["opted_in", "updated"]);
              if (!hadMarketing) continue;
              await db.rpc("wa_record_consent", {
                p_contact_id: c.id, p_action: "updated", p_updates: null, p_marketing: true,
                p_channel: "meta_preferences", p_note: "Resumed promotions in WhatsApp",
              });
            }
          }
        }
      }

      // Meta's verdict on a submitted template.
      if (field === "message_template_status_update") {
        const status = META_STATUS[String(v.event ?? "").toUpperCase()];
        if (status && v.message_template_id) {
          await db.from("wa_templates").update({
            status,
            rejection_reason: status === "rejected" ? (v.reason && v.reason !== "NONE" ? String(v.reason) : "Rejected") : null,
            status_updated_at: new Date().toISOString(),
          }).eq("meta_template_id", String(v.message_template_id));
        }
      }
    }
  }
  // Meta retries anything that isn't a 200, so acknowledge once handled.
  return new Response("OK", { status: 200 });
}
