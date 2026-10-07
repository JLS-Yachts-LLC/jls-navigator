/**
 * Permit expiry reminders — run once a day (worker-entry.ts scheduled handler).
 *
 * SD-0047: each current permit on a vessel gets a reminder at 60, 30 and 7 days
 * before it expires, and on the day it expires. A reminder goes:
 *   - in the app (the bell) to the vessel's agents responsible for that kind of
 *     permit (yacht_agents.covers), or to all its agents if none is specific;
 *   - by email to those same agents, and a copy of the day's reminders to Port
 *     Operations (PERMIT_ALERT_TO, default portops@).
 * One email per person per day, however many permits are due.
 *
 * Only internal staff are ever emailed — never the permit's client contact. On
 * 2026-08-03 the old per-permit emails were found to be mailing clients
 * unprompted; that send was removed and stays removed.
 *
 * Each reminder is claimed in permit_expiry_alerts before anything is sent, so it
 * goes once even if the job runs twice. A renewed (re-dated) permit gets fresh
 * reminders, and a permit replaced by a later one stops counting.
 *
 * Emails need PERMIT_EXPIRY_ALERTS_ENABLED=true (wrangler.jsonc); the in-app
 * reminders don't. previewExpiryDigest() shows what today's run would send.
 */
import { emailBrandLockup } from "@/lib/email/brand-mark";
import { sendEmail } from "@/lib/ses.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  TRACKED_PERMIT_TYPES, agentsFor, currentPermits, daysText, thresholdFor, todayUae,
  type AlertThreshold, type CurrentPermit, type ExpiryPermitRow, type VesselAgent,
} from "@/lib/permit-expiry";

const DEFAULT_ALERT_TO = "portops@jlsyachts.com";
const APP_URL = (process.env.PUBLIC_APP_URL ?? "https://polaris.jlsyachts.com").replace(/\/+$/, "");

/** Port Operations — always copied. Never a client address; the mail guard blocks those anyway. */
function portOpsRecipients(): string[] {
  const raw = (process.env.PERMIT_ALERT_TO ?? DEFAULT_ALERT_TO).trim();
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function emailsEnabled(): boolean {
  const v = (process.env.PERMIT_EXPIRY_ALERTS_ENABLED ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const THRESHOLD_TEXT: Record<AlertThreshold, string> = {
  60: "60-day reminder", 30: "30-day reminder", 7: "7-day reminder", 0: "Expired",
};
const URGENCY: Record<AlertThreshold, "info" | "warning" | "danger"> = { 60: "info", 30: "warning", 7: "danger", 0: "danger" };

type DueReminder = CurrentPermit & {
  threshold: AlertThreshold;
  alertKey: string;
  vesselName: string;
  agents: { userId: string; name: string; email: string | null }[];
};

/** Every reminder due today that has not been sent yet. Sends nothing. */
async function dueReminders(): Promise<DueReminder[]> {
  const sb = supabaseAdmin as any;
  const today = todayUae();
  const from = new Date(Date.parse(today + "T00:00:00Z") - 3 * 86_400_000).toISOString().slice(0, 10);

  const { data: permits, error } = await sb
    .from("permits")
    .select("id, yacht_id, permit_type, permit_number, issuing_authority, dma_phase, expiry_date, status")
    .in("permit_type", TRACKED_PERMIT_TYPES as unknown as string[])
    .gte("expiry_date", from)
    .neq("status", "cancelled");
  if (error) throw new Error(`permits: ${error.message}`);

  const { data: vessels, error: vErr } = await sb
    .from("yachts")
    .select("id, vessel_name, cruising_permit_expiry, archive")
    .or(`id.in.(${[...new Set((permits ?? []).map((p: any) => p.yacht_id).filter(Boolean))].join(",") || "00000000-0000-0000-0000-000000000000"}),cruising_permit_expiry.gte.${from}`);
  if (vErr) throw new Error(`yachts: ${vErr.message}`);
  const live = ((vessels ?? []) as any[]).filter((v) => !v.archive);
  const liveIds = new Set(live.map((v) => v.id));

  const due = currentPermits((permits ?? []) as ExpiryPermitRow[], live, today, { showExpiredForDays: 3 })
    .filter((p) => liveIds.has(p.yachtId))
    .flatMap((p) => {
      const threshold = thresholdFor(p.days);
      if (threshold === null) return [];
      const ref = p.permitId ?? `vessel:${p.yachtId}:cruising`;
      return [{ ...p, threshold, alertKey: `${ref}|${p.expiryDate}|${threshold}` }];
    });
  if (!due.length) return [];

  const { data: sent } = await sb.from("permit_expiry_alerts").select("alert_key").in("alert_key", due.map((d) => d.alertKey));
  const already = new Set(((sent ?? []) as any[]).map((r) => r.alert_key));
  const todo = due.filter((d) => !already.has(d.alertKey));
  if (!todo.length) return [];

  const { data: agentRows } = await sb.from("yacht_agents").select("yacht_id, user_id, covers, created_at")
    .in("yacht_id", [...new Set(todo.map((d) => d.yachtId))]);
  const agents = (agentRows ?? []) as VesselAgent[];
  const { data: people } = agents.length
    ? await sb.from("user_profiles").select("user_id, display_name, email").in("user_id", [...new Set(agents.map((a) => a.user_id))])
    : { data: [] };
  const person = new Map(((people ?? []) as any[]).map((p) => [p.user_id, p]));
  const vesselName = new Map(live.map((v) => [v.id, v.vessel_name as string]));

  return todo.map((d) => ({
    ...d,
    vesselName: vesselName.get(d.yachtId) ?? "Vessel",
    agents: agentsFor(d.permitType, agents.filter((a) => a.yacht_id === d.yachtId)).map((a) => ({
      userId: a.user_id,
      name: person.get(a.user_id)?.display_name?.trim() || person.get(a.user_id)?.email || "Agent",
      email: person.get(a.user_id)?.email ?? null,
    })),
  }));
}

function buildEmail(items: DueReminder[], forPortOps: boolean): { subject: string; html: string; text: string } {
  const urgent = items.filter((i) => i.threshold <= 7).length;
  const subject = urgent
    ? `⚠️ Permit expiry — ${urgent} expired or due within 7 days${items.length > urgent ? ` (+${items.length - urgent} more)` : ""}`
    : `Permit expiry reminders — ${items.length} permit${items.length === 1 ? "" : "s"}`;
  const colour = (t: AlertThreshold) => (t <= 7 ? "#dc2626" : t === 30 ? "#d97706" : "#1e3a5f");
  const rows = [...items].sort((a, b) => a.days - b.days).map((i) => `<tr style="border-top:1px solid #e2e8f0;">
      <td style="padding:9px 12px;font-size:13px;color:#0f172a;font-weight:600;"><a href="${APP_URL}/yachts/${i.yachtId}" style="color:#0f172a;text-decoration:none;">${i.vesselName}</a></td>
      <td style="padding:9px 12px;font-size:13px;color:#0f172a;">${i.label}${i.permitNumber ? `<div style="font-size:11px;color:#64748b;font-family:monospace;">${i.permitNumber}</div>` : ""}</td>
      <td style="padding:9px 12px;font-size:13px;color:#475569;white-space:nowrap;">${fmtDate(i.expiryDate)}</td>
      <td style="padding:9px 12px;font-size:13px;font-weight:700;color:${colour(i.threshold)};white-space:nowrap;">${daysText(i.days)}</td>
      ${forPortOps ? `<td style="padding:9px 12px;font-size:12px;color:#475569;">${i.agents.map((a) => a.name).join(", ") || '<span style="color:#d97706;">No agent</span>'}</td>` : ""}
    </tr>`).join("");
  const head = (t: string) => `<td style="padding:9px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">${t}</td>`;
  const intro = forPortOps
    ? "Every permit reminder due today, across the fleet."
    : "You're the agent responsible for these permits.";

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Permit expiry</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Inter',Arial,sans-serif;color:#0f172a;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:28px 16px;"><tr><td align="center">
<table width="760" cellpadding="0" cellspacing="0" style="max-width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f172a;padding:20px 24px;">
    ${emailBrandLockup(`<div style="font-size:17px;font-weight:700;color:#fff;">Polaris — Permit expiry</div>
    <div style="font-size:12px;color:#94a3b8;margin-top:3px;">${intro}</div>`, 36)}
  </td></tr>
  <tr><td style="padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr style="background:#f1f5f9;">${head("Vessel")}${head("Permit")}${head("Expires")}${head("Left")}${forPortOps ? head("Agent") : ""}</tr>
      ${rows}
    </table>
  </td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 24px;">
    <p style="margin:0;font-size:12px;color:#64748b;">Reminders go at 60, 30 and 7 days before expiry and on the day. Renew through Polaris → Permits. Internal only — nothing has been sent to the vessels.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    subject, "", intro, "",
    ...[...items].sort((a, b) => a.days - b.days).map((i) =>
      `${i.vesselName} · ${i.label}${i.permitNumber ? ` (${i.permitNumber})` : ""} · expires ${fmtDate(i.expiryDate)} · ${daysText(i.days)}${forPortOps ? ` · agent: ${i.agents.map((a) => a.name).join(", ") || "none"}` : ""}`),
    "", "Renew through Polaris → Permits. Internal only — nothing sent to the vessels.",
  ].join("\n");
  return { subject, html, text };
}

/** Dry run for GET /api/permits/expiry-digest — what today's run would send. */
export async function previewExpiryDigest(): Promise<{
  enabled: boolean; recipients: string[]; count: number;
  permits: { type: string; vessel: string; number: string; expires: string; days: number; reminder: string; agents: string[] }[];
  subject: string; html: string;
}> {
  const items = await dueReminders();
  const { subject, html } = buildEmail(items, true);
  return {
    enabled: emailsEnabled(),
    recipients: [...portOpsRecipients(), ...new Set(items.flatMap((i) => i.agents.map((a) => a.email).filter((e): e is string => !!e)))],
    count: items.length,
    permits: items.map((i) => ({
      type: i.label, vessel: i.vesselName, number: i.permitNumber ?? "—", expires: i.expiryDate, days: i.days,
      reminder: THRESHOLD_TEXT[i.threshold], agents: i.agents.map((a) => a.name),
    })),
    subject, html,
  };
}

export async function runExpiryAlerts(): Promise<{ sent: number; skipped: number }> {
  const sb = supabaseAdmin as any;
  const items = await dueReminders();
  if (!items.length) {
    console.log("[expiry-alerts] no reminders due today.");
    return { sent: 0, skipped: 0 };
  }

  // Claim each reminder first — a second run (or a retry) finds it taken.
  const { data: claimed, error } = await sb.from("permit_expiry_alerts").upsert(
    items.map((i) => ({
      alert_key: i.alertKey, permit_id: i.permitId, yacht_id: i.yachtId, permit_type: i.permitType,
      expiry_date: i.expiryDate, threshold: i.threshold, days_left: i.days,
    })),
    { onConflict: "alert_key", ignoreDuplicates: true },
  ).select("alert_key");
  if (error) throw new Error(`claim: ${error.message}`);
  const mine = new Set(((claimed ?? []) as any[]).map((r) => r.alert_key));
  const toSend = items.filter((i) => mine.has(i.alertKey));
  if (!toSend.length) return { sent: 0, skipped: items.length };

  // In the app: one notification per agent per permit.
  const notes = toSend.flatMap((i) => i.agents.map((a) => ({
    user_id: a.userId,
    type: "permit_expiry",
    urgency: URGENCY[i.threshold],
    title: `${i.label} — ${i.vesselName}`,
    body: `${daysText(i.days)} (expires ${fmtDate(i.expiryDate)}). ${i.threshold === 0 ? "Renew it as soon as possible." : `${THRESHOLD_TEXT[i.threshold]} — you're the responsible agent.`}`,
    action_url: `/yachts/${i.yachtId}`,
    metadata: { permit_id: i.permitId, yacht_id: i.yachtId, threshold: i.threshold, expiry_date: i.expiryDate },
  })));
  if (notes.length) {
    const { error: nErr } = await sb.from("notifications").insert(notes);
    if (nErr) console.error("[expiry-alerts] notifications:", nErr.message);
  }

  // By email: each agent their own permits, Port Ops everything.
  const emailed = new Map<string, string[]>(); // alert key → addresses
  let sent = 0;
  if (emailsEnabled()) {
    const byEmail = new Map<string, DueReminder[]>();
    for (const i of toSend) for (const a of i.agents) {
      if (!a.email) continue;
      byEmail.set(a.email, [...(byEmail.get(a.email) ?? []), i]);
    }
    const sends: [string[], DueReminder[], boolean][] = [
      ...[...byEmail].map(([email, list]) => [[email], list, false] as [string[], DueReminder[], boolean]),
      [portOpsRecipients(), toSend, true],
    ];
    for (const [to, list, ops] of sends) {
      if (!to.length || !list.length) continue;
      try {
        await sendEmail({ to, ...buildEmail(list, ops) });
        sent++;
        for (const i of list) emailed.set(i.alertKey, [...(emailed.get(i.alertKey) ?? []), ...to]);
      } catch (e) {
        console.error(`[expiry-alerts] email to ${to.join(", ")} failed:`, e instanceof Error ? e.message : e);
      }
    }
  } else {
    console.warn("[expiry-alerts] emails off (PERMIT_EXPIRY_ALERTS_ENABLED is not true) — in-app reminders only.");
  }

  for (const i of toSend) {
    await sb.from("permit_expiry_alerts").update({
      notified_users: i.agents.map((a) => a.userId),
      emailed: emailed.get(i.alertKey) ?? [],
    }).eq("alert_key", i.alertKey);
  }
  console.log(`[expiry-alerts] ${toSend.length} reminder(s), ${notes.length} in-app, ${sent} email(s)`);
  return { sent, skipped: items.length - toSend.length };
}
