/**
 * Send the per-vessel automated reports (vessel_report_subscriptions).
 *
 *   runDueVesselReports()  — worker cron, every 15 min: each ENABLED subscription
 *                            whose day/time (Dubai) has come round.
 *   sendVesselReportNow()  — Reports → Automated Reports: "Send now" to the
 *                            subscription's recipients, or "Send test to me".
 *
 * A vessel only ever receives a report it has been opted in to, at the
 * addresses on its own subscription — there's no fleet-wide list. Each send is
 * recorded in vessel_report_runs; a scheduled run claims its slot there first
 * (unique subscription + slot), so overlapping cron ticks can't send it twice.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendGraphEmailWithAttachments } from "@/lib/graph-mail.server";
import { isDueNow, parseSchedule, DEFAULT_TZ } from "@/lib/automation-schedule.server";
import { buildVesselReport } from "./build.server";
import { isEmail, type ReportKey } from "./catalogue";

type Sub = {
  id: string; yacht_id: string; report_key: ReportKey; enabled: boolean;
  recipients: string[]; cc: string[]; schedule: unknown;
};

const clean = (list: unknown) => [...new Set((Array.isArray(list) ? list : []).map((e) => String(e).trim().toLowerCase()).filter(isEmail))];

async function deliver(sub: Sub, to: string[], cc: string[], opts: { staffCopy?: boolean } = {}) {
  const built = await buildVesselReport(sub.report_key, sub.yacht_id, opts);
  await sendGraphEmailWithAttachments({
    to, cc, subject: opts.staffCopy ? `[Test] ${built.subject}` : built.subject,
    html: built.html, attachments: built.attachments,
  });
  if (built.visaReportId) {
    await (supabaseAdmin as any).from("visa_report_log")
      .update({ status: "sent", sent_at: new Date().toISOString(), sent_to_email: to.join(", ") })
      .eq("id", built.visaReportId);
  }
  return built.summary;
}

async function finish(runId: string, sub: Sub | null, status: "sent" | "failed", summary: string | null, error: string | null, stamp: boolean) {
  const sb = supabaseAdmin as any;
  const at = new Date().toISOString();
  await sb.from("vessel_report_runs").update({ status, summary, error, finished_at: at }).eq("id", runId);
  if (sub && stamp) {
    await sb.from("vessel_report_subscriptions").update({
      last_status: status, last_error: error, ...(status === "sent" ? { last_sent_at: at } : {}),
    }).eq("id", sub.id);
  }
}

/** Worker cron: send every enabled report that's due now. */
export async function runDueVesselReports(now = new Date()): Promise<{ due: number; sent: number; failed: number }> {
  const sb = supabaseAdmin as any;
  const { data } = await sb.from("vessel_report_subscriptions")
    .select("id, yacht_id, report_key, enabled, recipients, cc, schedule").eq("enabled", true);
  const out = { due: 0, sent: 0, failed: 0 };

  for (const sub of (data ?? []) as Sub[]) {
    const sched = parseSchedule(sub.schedule, { day: "mon", time: "08:00", tz: DEFAULT_TZ });
    if (!isDueNow(sched, now)) continue;
    const to = clean(sub.recipients);
    if (!to.length) continue;
    out.due++;

    // The slot names this firing (local date + time), so it's claimed once.
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: sched.tz ?? DEFAULT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const slot = `${local} ${sched.time}`;
    const { data: claimed, error: claimErr } = await sb.from("vessel_report_runs").insert({
      subscription_id: sub.id, yacht_id: sub.yacht_id, report_key: sub.report_key,
      trigger: "schedule", slot, recipients: [...to, ...clean(sub.cc)],
    }).select("id").maybeSingle();
    if (claimErr || !claimed) continue; // already claimed by another tick

    try {
      const summary = await deliver(sub, to, clean(sub.cc));
      await finish(claimed.id, sub, "sent", summary, null, true);
      out.sent++;
    } catch (e) {
      await finish(claimed.id, sub, "failed", null, e instanceof Error ? e.message : String(e), true);
      out.failed++;
    }
  }
  return out;
}

/**
 * Send one subscription now. `test` sends only to the signed-in staff member
 * (works even while the subscription is off); otherwise to its recipients.
 */
export async function sendVesselReportNow(
  subscriptionId: string, userId: string, opts: { test?: boolean; testTo?: string } = {},
): Promise<{ ok: boolean; summary?: string; sentTo?: string[]; error?: string }> {
  const sb = supabaseAdmin as any;
  const { data: sub } = await sb.from("vessel_report_subscriptions")
    .select("id, yacht_id, report_key, enabled, recipients, cc, schedule").eq("id", subscriptionId).maybeSingle() as { data: Sub | null };
  if (!sub) return { ok: false, error: "Report not found" };

  const to = opts.test ? clean([opts.testTo]) : clean(sub.recipients);
  const cc = opts.test ? [] : clean(sub.cc);
  if (!to.length) return { ok: false, error: opts.test ? "Your account has no email address." : "Add at least one recipient first." };

  const { data: run } = await sb.from("vessel_report_runs").insert({
    subscription_id: sub.id, yacht_id: sub.yacht_id, report_key: sub.report_key,
    trigger: opts.test ? "test" : "manual", slot: `${opts.test ? "test" : "manual"} ${new Date().toISOString()}`,
    recipients: [...to, ...cc], sent_by: userId,
  }).select("id").single();

  try {
    const summary = await deliver(sub, to, cc, { staffCopy: opts.test });
    await finish(run.id, sub, "sent", summary, null, !opts.test);
    return { ok: true, summary, sentTo: [...to, ...cc] };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await finish(run.id, sub, "failed", null, error, !opts.test);
    return { ok: false, error };
  }
}

/** The report as it would go out now — for the screen's Preview. */
export async function previewVesselReport(key: ReportKey, yachtId: string) {
  return buildVesselReport(key, yachtId);
}
