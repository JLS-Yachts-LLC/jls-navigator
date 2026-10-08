/**
 * Automated reports by WhatsApp.
 *
 * WhatsApp only lets a business start a conversation with an approved template,
 * so every report goes out on ONE utility template, "vessel_report": the report
 * PDF as its document header and a short body naming the report, the vessel,
 * the date and the headline figures. It's created and submitted from Automated
 * Reports (setupReportTemplate) and then lives on the WhatsApp Templates tab
 * like any other.
 *
 * A report is sent to the WhatsApp contacts picked on it — the vessel's own
 * contacts only — and each one is checked with wa_can_message (agreed to
 * updates, not opted out) at the moment of sending. Nothing goes while
 * WHATSAPP_SENDING_ENABLED is off. Every message is recorded in wa_messages, so
 * it shows in the Inbox thread and any reply lands there.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { waConfig, sendingEnabled, sendTemplate, uploadMedia, uploadForReview, createTemplate } from "@/lib/whatsapp/cloud-api.server";
import { fillTemplate, recipientOf } from "@/lib/whatsapp/shared";
import { buildReportPdf } from "@/routes/api.movements.reports";

export const REPORT_TEMPLATE = "vessel_report";
const MEDIA_BUCKET = "whatsapp-media";
const SAMPLE_PATH = "vessel-reports/vessel_report_sample.pdf";

const BODY = "Hello {{1}}, here is the latest {{2}} for {{3}}, as at {{4}}: {{5}}. The full report is attached — reply here with any questions.";
const SAMPLES = ["John", "visa status report", "AQUILA", "8 Oct 2026", "3 crew, 1 visa expiring within 30 days"];
const FOOTER = "JLS Yachts · scheduled report";

/** WhatsApp parameters can't carry new lines, tabs or long runs of spaces. */
const param = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 900) || "—";

export async function reportTemplateState(): Promise<{ status: string | null; reason: string | null; ready: boolean; sendingOn: boolean; connected: boolean }> {
  const { data: t } = await (supabaseAdmin as any).from("wa_templates")
    .select("status, rejection_reason").eq("name", REPORT_TEMPLATE).eq("language", "en").maybeSingle();
  return {
    status: t?.status ?? null,
    reason: t?.rejection_reason ?? null,
    ready: t?.status === "approved",
    sendingOn: sendingEnabled(),
    connected: !!waConfig(),
  };
}

/** Create the report template (if it isn't there) and submit it to Meta for review. */
export async function setupReportTemplate(userId: string): Promise<{ ok: boolean; status?: string; error?: string }> {
  const cfg = waConfig();
  if (!cfg) return { ok: false, error: "WhatsApp isn't connected yet." };
  const db = supabaseAdmin as any;
  const { data: existing } = await db.from("wa_templates").select("*").eq("name", REPORT_TEMPLATE).eq("language", "en").maybeSingle();
  if (existing && !["draft", "rejected"].includes(existing.status)) return { ok: true, status: existing.status };

  // An example PDF for Meta's reviewers (each real send attaches its own report).
  const pdf = await buildReportPdf("Visa status — AQUILA — 08 Oct 2026 (example)",
    ["Crew", "Nationality", "Visa", "Expiry", "Status", "Days"],
    [["John Smith", "British", "Employment", "03/11/2026", "Expiring soon", "26 days left"],
     ["Maria Lopez", "Spanish", "Employment", "14/06/2027", "In date", "249 days left"]],
    [3, 2, 2.4, 1.6, 1.8, 1.8]);
  const up = await db.storage.from(MEDIA_BUCKET).upload(SAMPLE_PATH, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) return { ok: false, error: `Couldn't store the example PDF: ${up.error.message}` };

  const row = {
    name: REPORT_TEMPLATE, language: "en", category: "UTILITY",
    header_format: "DOCUMENT", header_text: null,
    header_media_path: SAMPLE_PATH, header_media_mime: "application/pdf", header_media_name: "Visa status - AQUILA.pdf",
    body_text: BODY, footer_text: FOOTER, sample_values: SAMPLES, buttons: [],
  };
  let id = existing?.id as string | undefined;
  if (id) {
    await db.from("wa_templates").update(row).eq("id", id);
  } else {
    const { data, error } = await db.from("wa_templates").insert({ ...row, status: "draft", created_by: userId }).select("id").single();
    if (error) return { ok: false, error: error.message };
    id = data.id;
  }

  try {
    const header_handle = await uploadForReview(cfg, { body: pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer, mime: "application/pdf", name: "Visa status - AQUILA.pdf" });
    const out = await createTemplate(cfg, {
      name: REPORT_TEMPLATE, language: "en", category: "UTILITY", header_format: "DOCUMENT", header_text: null,
      header_handle, body_text: BODY, footer_text: FOOTER, sample_values: SAMPLES, buttons: [],
    });
    const status = out.status.toUpperCase() === "APPROVED" ? "approved" : out.status.toUpperCase() === "REJECTED" ? "rejected" : "pending";
    await db.from("wa_templates").update({
      meta_template_id: out.id, status, rejection_reason: null,
      submitted_at: new Date().toISOString(), status_updated_at: new Date().toISOString(),
    }).eq("id", id);
    return { ok: true, status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** A vessel's WhatsApp contacts, and whether each can be sent a report now. */
export async function vesselWhatsAppContacts(yachtId: string) {
  const { data } = await (supabaseAdmin as any).from("wa_contacts")
    .select("id, name, first_name, last_name, phone_e164, consent_updates, opted_out_at")
    .eq("yacht_id", yachtId).order("name");
  return ((data ?? []) as any[]).map((c) => ({
    id: c.id as string,
    name: (c.name as string) || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Contact",
    phone: c.phone_e164 as string | null,
    canReceive: !!c.phone_e164 && !!c.consent_updates && !c.opted_out_at,
  }));
}

/**
 * Send one built report to the subscription's WhatsApp contacts.
 * Returns who got it and why the rest didn't; throws only when nothing can go.
 */
export async function sendReportByWhatsApp(opts: {
  yachtId: string; contactIds: string[]; reportLabel: string; vessel: string; date: string; summary: string;
  pdf: { base64: string; filename: string };
}): Promise<{ sent: string[]; skipped: string[] }> {
  const cfg = waConfig();
  if (!cfg) throw new Error("WhatsApp isn't connected");
  if (!sendingEnabled()) throw new Error("WhatsApp sending is switched off (WHATSAPP_SENDING_ENABLED)");
  const db = supabaseAdmin as any;
  const { data: t } = await db.from("wa_templates").select("id, name, language, status, body_text").eq("name", REPORT_TEMPLATE).eq("language", "en").maybeSingle();
  if (!t || t.status !== "approved") throw new Error(`The WhatsApp report template isn't approved yet${t ? ` (${t.status})` : ""}`);

  // Only the vessel's own contacts, whatever ids the setting holds.
  const { data: contacts } = await db.from("wa_contacts")
    .select("id, name, first_name, last_name, phone_e164").in("id", opts.contactIds.length ? opts.contactIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("yacht_id", opts.yachtId);
  const list = (contacts ?? []) as any[];
  if (!list.length) throw new Error("None of the chosen WhatsApp contacts belong to this vessel any more");

  const bytes = Uint8Array.from(atob(opts.pdf.base64), (c) => c.charCodeAt(0));
  const mediaId = await uploadMedia(cfg, { body: bytes.buffer as ArrayBuffer, mime: "application/pdf", name: opts.pdf.filename });

  const sent: string[] = [];
  const skipped: string[] = [];
  for (const c of list) {
    const label = (c.name as string) || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Contact";
    try {
      const { data: problem } = await db.rpc("wa_can_message", { p_contact_id: c.id, p_category: "UTILITY" });
      if (problem) { skipped.push(`${label}: ${problem}`); continue; }
      const who = recipientOf(c);
      const values = [who.firstName || who.name || "there", opts.reportLabel, opts.vessel, opts.date, opts.summary].map(param);
      const wamid = await sendTemplate(cfg, {
        toE164: c.phone_e164, name: t.name, language: t.language, bodyValues: values,
        header: { format: "DOCUMENT", mediaId, filename: opts.pdf.filename },
      });
      const now = new Date().toISOString();
      await db.from("wa_messages").insert({
        contact_id: c.id, kind: "template", template_id: t.id, body: fillTemplate(t.body_text, values),
        phone_e164: c.phone_e164, status: "sent", queued_at: now, sent_at: now, wa_message_id: wamid,
      });
      sent.push(label);
    } catch (e) {
      skipped.push(`${label}: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`);
    }
  }
  return { sent, skipped };
}
