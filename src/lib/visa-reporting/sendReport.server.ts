/**
 * Dispatch a previously-generated vessel visa report — server side.
 * Reads the immutable snapshot from visa_report_log, sends the branded email via
 * AWS SES (existing provider), logs the send to visa_email_send_log, flips the
 * report row to 'sent', optionally fires the vessel WhatsApp digest via n8n, and
 * writes an audit entry. Never mutates snapshot_data (write-once, spec rule #4).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail } from "@/lib/ses.server";
import {
  buildVisaReportEmail,
  type VisaReportEmailCrewRow,
} from "./reportEmail";
import { dispatchVesselWhatsApp } from "./dispatchWhatsApp.server";
import type { SnapshotRow } from "./statusHelpers";

export interface SendResult {
  ok: boolean;
  reportId: string;
  emailStatus?: "sent" | "failed" | "skipped";
  error?: string;
}

export async function sendVesselVisaReport(
  reportId: string,
  trigger: "manual" | "weekly_cron",
  userId: string | null,
): Promise<SendResult> {
  const sb = supabaseAdmin as any;

  const { data: report } = await sb
    .from("visa_report_log")
    .select(
      "*, yachts(vessel_name, visa_report_email, send_visa_reports, vessel_whatsapp, send_visa_via_whatsapp)",
    )
    .eq("id", reportId)
    .single();

  if (!report) return { ok: false, reportId, error: "Report not found" };

  const yacht = report.yachts;
  if (!yacht?.send_visa_reports || !yacht?.visa_report_email) {
    await sb
      .from("visa_report_log")
      .update({ status: "skipped" })
      .eq("id", reportId);
    return {
      ok: false,
      reportId,
      emailStatus: "skipped",
      error: "Vessel not opted in to visa report emails",
    };
  }

  // Build email props from the immutable snapshot.
  const snapshot = (report.snapshot_data ?? []) as SnapshotRow[];
  const expiringSoon: VisaReportEmailCrewRow[] = snapshot
    .filter((c) => c.status === "expiring_soon")
    .sort((a, b) => (a.days_remaining ?? 0) - (b.days_remaining ?? 0))
    .slice(0, 10)
    .map((c) => ({
      name: c.name ?? "—",
      visaType: c.visa_type,
      date: c.expiry_date,
      days: c.days_remaining ?? 0,
    }));
  const expired: VisaReportEmailCrewRow[] = snapshot
    .filter((c) => c.status === "expired")
    .sort((a, b) => (b.days_overdue ?? 0) - (a.days_overdue ?? 0))
    .slice(0, 10)
    .map((c) => ({
      name: c.name ?? "—",
      visaType: c.visa_type,
      date: c.expiry_date,
      days: c.days_overdue ?? 0,
    }));

  const base =
    process.env.VITE_APP_URL ??
    "https://jls-navigator.m-peeters-4a0.workers.dev";
  const { subject, html, text } = buildVisaReportEmail({
    vesselName: yacht.vessel_name ?? "Vessel",
    reportDate: report.report_date,
    totalCrew: report.crew_count ?? 0,
    activeVisas: report.active_count ?? 0,
    expiringVisas: report.expiring_count ?? 0,
    expiredVisas: report.expired_count ?? 0,
    signOns: report.sign_on_count, // numeric (SOSO live) → no footnote; null → footnote
    signOffs: report.sign_off_count,
    expiringSoonCrew: expiringSoon,
    expiredCrew: expired,
    preferencesUrl: `${base}/crew-immigration/visas/vessel-reports?vessel=${report.yacht_id}`,
  });

  let emailError: string | null = null;
  try {
    await sendEmail({ to: [yacht.visa_report_email], subject, html, text });
  } catch (e) {
    emailError = e instanceof Error ? e.message : "SES send failed";
  }

  await sb.from("visa_email_send_log").insert({
    report_log_id: reportId,
    yacht_id: report.yacht_id,
    sent_to: yacht.visa_report_email,
    channel: "vessel_email",
    status: emailError ? "failed" : "sent",
    error_message: emailError,
  });

  if (!emailError) {
    await sb
      .from("visa_report_log")
      .update({ sent_at: new Date().toISOString(), status: "sent" })
      .eq("id", reportId);
  } else {
    await sb
      .from("visa_report_log")
      .update({ status: "failed" })
      .eq("id", reportId);
  }

  // Vessel WhatsApp digest (optional, if enabled).
  if (!emailError && yacht.vessel_whatsapp && yacht.send_visa_via_whatsapp) {
    await dispatchVesselWhatsApp({
      reportLogId: reportId,
      yachtId: report.yacht_id,
      vesselName: yacht.vessel_name ?? "Vessel",
      vesselWhatsApp: yacht.vessel_whatsapp,
      stats: {
        total: report.crew_count ?? 0,
        active: report.active_count ?? 0,
        expiring: report.expiring_count ?? 0,
        expired: report.expired_count ?? 0,
      },
    });
  }

  // Audit (event_type is a fixed enum; 'export' is the closest allowed value for
  // an outbound dispatch — the precise action lives in metadata.action).
  await sb.from("audit_log").insert({
    user_id: userId,
    event_type: emailError ? "admin_action" : "export",
    module: "crew_visas",
    resource_type: "yacht",
    resource_id: report.yacht_id,
    metadata: {
      action: emailError ? "visa_report_dispatch_failed" : "visa_report_sent",
      report_id: reportId,
      trigger,
      channel: "vessel_email",
      sent_to: yacht.visa_report_email,
      error: emailError,
    },
  });

  return {
    ok: !emailError,
    reportId,
    emailStatus: emailError ? "failed" : "sent",
    error: emailError ?? undefined,
  };
}
