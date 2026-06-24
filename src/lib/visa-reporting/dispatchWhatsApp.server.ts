/**
 * Vessel WhatsApp dispatch for visa reports — routes via n8n (n8n.jlsyachts.com).
 * Individual crew WhatsApp is LOCKED in this build — do not implement (spec #9).
 *
 * Configured via env N8N_WHATSAPP_WEBHOOK_URL (Wrangler secret). No-op (logged as
 * 'failed' with a clear message) if the webhook is not configured, so a missing
 * secret never blocks the email send.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface VesselWhatsAppArgs {
  reportLogId: string;
  yachtId: string;
  vesselName: string;
  vesselWhatsApp: string;
  stats: { total: number; active: number; expiring: number; expired: number };
}

export async function dispatchVesselWhatsApp(
  args: VesselWhatsAppArgs,
): Promise<{ ok: boolean }> {
  const webhook = (process.env as Record<string, string | undefined>)
    .N8N_WHATSAPP_WEBHOOK_URL;
  const sb = supabaseAdmin as any;

  if (!webhook) {
    await sb.from("visa_email_send_log").insert({
      report_log_id: args.reportLogId,
      yacht_id: args.yachtId,
      sent_to: args.vesselWhatsApp,
      channel: "vessel_whatsapp",
      status: "failed",
      error_message: "N8N_WHATSAPP_WEBHOOK_URL not configured",
    });
    return { ok: false };
  }

  const message =
    `📋 *Polaris Weekly Visa Report — ${args.vesselName}*\n\n` +
    `Total crew: ${args.stats.total}\n` +
    `✅ Active: ${args.stats.active}\n` +
    `⚠️ Expiring soon: ${args.stats.expiring}\n` +
    `🔴 Expired: ${args.stats.expired}\n\n` +
    `Full report has been sent to your registered email.\n— Superyacht Middle East`;

  let ok = false;
  let providerId: string | null = null;
  let errorMessage: string | null = null;
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: args.vesselWhatsApp,
        message,
        source: "polaris_visa_report",
        meta: { report_id: args.reportLogId, yacht_id: args.yachtId },
      }),
    });
    const result: any = await res.json().catch(() => ({}));
    ok = res.ok;
    providerId = result?.executionId ?? null;
    if (!ok) errorMessage = result?.message ?? `n8n responded ${res.status}`;
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : "n8n request failed";
  }

  await sb.from("visa_email_send_log").insert({
    report_log_id: args.reportLogId,
    yacht_id: args.yachtId,
    sent_to: args.vesselWhatsApp,
    channel: "vessel_whatsapp",
    provider_id: providerId,
    status: ok ? "sent" : "failed",
    error_message: errorMessage,
  });

  return { ok };
}
