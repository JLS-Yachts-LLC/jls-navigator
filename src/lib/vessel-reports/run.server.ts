/**
 * Send the per-vessel automated reports (vessel_report_subscriptions).
 *
 *   runDueVesselReports()  — worker cron, every 15 min: each ENABLED subscription
 *                            whose day/time (Dubai) has come round.
 *   sendVesselReportNow()  — Reports → Automated Reports: "Send now" to the
 *                            subscription's recipients, or "Send test to me".
 *
 * A vessel only ever receives a report it has been opted in to, at the
 * addresses on its own subscription — there's no fleet-wide list. A report goes
 * by email (send_email + recipients) and/or WhatsApp (send_whatsapp + the
 * vessel's chosen contacts — see whatsapp.server). Each send is recorded in
 * vessel_report_runs; a scheduled run claims its slot there first (unique
 * subscription + slot), so overlapping cron ticks can't send it twice.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendGraphEmailWithAttachments } from "@/lib/graph-mail.server";
import { isDueNow, parseSchedule, DEFAULT_TZ } from "@/lib/automation-schedule.server";
import { buildVesselReport } from "./build.server";
import { isEmail, reportLabel, type ReportKey } from "./catalogue";

type Sub = {
  id: string; yacht_id: string; report_key: ReportKey; enabled: boolean;
  recipients: string[]; cc: string[]; schedule: unknown;
  send_email: boolean; send_whatsapp: boolean; wa_contact_ids: string[];
};
const SUB_COLS = "id, yacht_id, report_key, enabled, recipients, cc, schedule, send_email, send_whatsapp, wa_contact_ids";

/**
 * A report's schedule. On top of the weekday / every-day schedules the other
 * automations use, a report can go "monthly" — the 1st of each month.
 */
type Schedule = { day: string; time: string; tz: string };
function scheduleOf(raw: unknown): Schedule {
  const r = (raw ?? {}) as { day?: string; time?: string; tz?: string };
  if (r.day === "monthly") {
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(r.time)) ? String(r.time) : "09:00";
    return { day: "monthly", time, tz: r.tz || DEFAULT_TZ };
  }
  const s = parseSchedule(raw, { day: "mon", time: "08:00", tz: DEFAULT_TZ });
  return { day: s.day, time: s.time, tz: s.tz ?? DEFAULT_TZ };
}
function dueNow(s: Schedule, now: Date): boolean {
  if (s.day !== "monthly") return isDueNow({ day: s.day as any, time: s.time, tz: s.tz }, now);
  const dayOfMonth = Number(new Intl.DateTimeFormat("en-GB", { timeZone: s.tz, day: "numeric" }).format(now));
  // The 1st in the vessel's clock; the time window is the same as weekly reports'.
  return dayOfMonth === 1 && isDueNow({ day: "daily", time: s.time, tz: s.tz }, now);
}

const clean = (list: unknown) => [...new Set((Array.isArray(list) ? list : []).map((e) => String(e).trim().toLowerCase()).filter(isEmail))];
const dubaiDate = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" });

/** Who a send goes to, on each channel. */
type Targets = { email: string[]; cc: string[]; whatsapp: string[] };
const targetsOf = (sub: Sub): Targets => ({
  email: sub.send_email ? clean(sub.recipients) : [],
  cc: sub.send_email ? clean(sub.cc) : [],
  whatsapp: sub.send_whatsapp ? [...new Set(sub.wa_contact_ids ?? [])] : [],
});
const hasTargets = (t: Targets) => t.email.length > 0 || t.whatsapp.length > 0;

/**
 * Build the report once and send it on every channel that has someone to go to.
 * Throws only when nothing at all went out; a channel that partly failed is
 * reported back as `problems`.
 */
async function deliver(sub: Sub, t: Targets, opts: { staffCopy?: boolean } = {}) {
  const built = await buildVesselReport(sub.report_key, sub.yacht_id, opts);
  const problems: string[] = [];
  let emailed = false;
  let whatsapped: string[] = [];

  if (t.email.length) {
    try {
      await sendGraphEmailWithAttachments({
        to: t.email, cc: t.cc, subject: opts.staffCopy ? `[Test] ${built.subject}` : built.subject,
        html: built.html, attachments: built.attachments,
      });
      emailed = true;
    } catch (e) { problems.push(`Email: ${e instanceof Error ? e.message : String(e)}`); }
  }

  if (t.whatsapp.length) {
    try {
      const { sendReportByWhatsApp } = await import("./whatsapp.server");
      const { data: y } = await (supabaseAdmin as any).from("yachts").select("vessel_name").eq("id", sub.yacht_id).maybeSingle();
      const a = built.attachments[0];
      const res = await sendReportByWhatsApp({
        yachtId: sub.yacht_id, contactIds: t.whatsapp, reportLabel: `${reportLabel(sub.report_key).toLowerCase()} report`,
        vessel: String(y?.vessel_name ?? "your vessel"), date: dubaiDate(), summary: built.summary,
        pdf: { base64: a.contentBase64, filename: a.filename },
      });
      whatsapped = res.sent;
      if (res.skipped.length) problems.push(`WhatsApp — not sent to ${res.skipped.join("; ")}`);
    } catch (e) { problems.push(`WhatsApp: ${e instanceof Error ? e.message : String(e)}`); }
  }

  if (!emailed && !whatsapped.length) throw new Error(problems.join(" · ") || "Nobody to send it to");

  if (built.visaReportId && emailed) {
    await (supabaseAdmin as any).from("visa_report_log")
      .update({ status: "sent", sent_at: new Date().toISOString(), sent_to_email: [...t.email, ...t.cc].join(", ") })
      .eq("id", built.visaReportId);
  }
  const channels = [emailed ? "email" : null, whatsapped.length ? `WhatsApp to ${whatsapped.length}` : null].filter(Boolean).join(" + ");
  return { summary: `${built.summary} · by ${channels}`, whatsappTo: whatsapped, problems: problems.length ? problems.join(" · ") : null };
}

async function finish(runId: string, sub: Sub | null, status: "sent" | "failed", summary: string | null, error: string | null, stamp: boolean, whatsappTo: string[] = []) {
  const sb = supabaseAdmin as any;
  const at = new Date().toISOString();
  await sb.from("vessel_report_runs").update({ status, summary, error, finished_at: at, whatsapp_to: whatsappTo }).eq("id", runId);
  if (sub && stamp) {
    await sb.from("vessel_report_subscriptions").update({
      last_status: status, last_error: error, ...(status === "sent" ? { last_sent_at: at } : {}),
    }).eq("id", sub.id);
  }
}

/** Worker cron: send every enabled report that's due now. */
export async function runDueVesselReports(now = new Date()): Promise<{ due: number; sent: number; failed: number }> {
  const sb = supabaseAdmin as any;
  const { data } = await sb.from("vessel_report_subscriptions").select(SUB_COLS).eq("enabled", true);
  const out = { due: 0, sent: 0, failed: 0 };

  for (const sub of (data ?? []) as Sub[]) {
    const sched = scheduleOf(sub.schedule);
    if (!dueNow(sched, now)) continue;
    const t = targetsOf(sub);
    if (!hasTargets(t)) continue;
    out.due++;

    // The slot names this firing (local date + time), so it's claimed once.
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: sched.tz ?? DEFAULT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const slot = `${local} ${sched.time}`;
    const { data: claimed, error: claimErr } = await sb.from("vessel_report_runs").insert({
      subscription_id: sub.id, yacht_id: sub.yacht_id, report_key: sub.report_key,
      trigger: "schedule", slot, recipients: [...t.email, ...t.cc],
    }).select("id").maybeSingle();
    if (claimErr || !claimed) continue; // already claimed by another tick

    try {
      const r = await deliver(sub, t);
      await finish(claimed.id, sub, "sent", r.summary, r.problems, true, r.whatsappTo);
      out.sent++;
    } catch (e) {
      await finish(claimed.id, sub, "failed", null, e instanceof Error ? e.message : String(e), true);
      out.failed++;
    }
  }
  return out;
}

/**
 * Send one subscription now. `test` sends only to the signed-in staff member,
 * by email (works even while the subscription is off); otherwise to its
 * recipients on every channel that's on.
 */
export async function sendVesselReportNow(
  subscriptionId: string, userId: string, opts: { test?: boolean; testTo?: string } = {},
): Promise<{ ok: boolean; summary?: string; sentTo?: string[]; warning?: string | null; error?: string }> {
  const sb = supabaseAdmin as any;
  const { data: sub } = await sb.from("vessel_report_subscriptions").select(SUB_COLS).eq("id", subscriptionId).maybeSingle() as { data: Sub | null };
  if (!sub) return { ok: false, error: "Report not found" };

  const t: Targets = opts.test ? { email: clean([opts.testTo]), cc: [], whatsapp: [] } : targetsOf(sub);
  if (!hasTargets(t)) return { ok: false, error: opts.test ? "Your account has no email address." : "Add at least one recipient first." };

  const { data: run } = await sb.from("vessel_report_runs").insert({
    subscription_id: sub.id, yacht_id: sub.yacht_id, report_key: sub.report_key,
    trigger: opts.test ? "test" : "manual", slot: `${opts.test ? "test" : "manual"} ${new Date().toISOString()}`,
    recipients: [...t.email, ...t.cc], sent_by: userId,
  }).select("id").single();

  try {
    const r = await deliver(sub, t, { staffCopy: opts.test });
    await finish(run.id, sub, "sent", r.summary, r.problems, !opts.test, r.whatsappTo);
    return { ok: true, summary: r.summary, sentTo: [...t.email, ...t.cc, ...r.whatsappTo.map((n) => `${n} (WhatsApp)`)], warning: r.problems };
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
