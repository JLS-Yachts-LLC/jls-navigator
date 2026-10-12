/**
 * Orbit 2 — service-due alerts for Managed Boats (client request, 12 Oct 2026).
 * Runs once a day (worker-entry.ts, 08:00 UTC beside the permit reminders).
 *
 * The team is warned before anything on a boat's Service Calendar falls due:
 *   - by date — a service's Next Service Date, or an Inventory List expiry
 *     (liferaft, flares…): 30 days before, 7 days before, and on the day / overdue;
 *   - by engine running hours — when the current reading is within 25 hours of
 *     the next service, and when it reaches it.
 * The same 30-day / 25-hour windows colour the calendar amber in the app.
 *
 * "The team" is everyone with Admin on the Orbit module (orbit2_admin_recipients()
 * — today Keith Stanley, Leneve Damens and Mike Fetton). Each gets a bell
 * notification per item, linking to that boat's Service Calendar, and one email
 * a day listing everything due. Staff only — owners are never emailed.
 *
 * Each alert is claimed in orbit2_service_alerts before anything is sent, so it
 * goes once even if the job runs more than once. Emails need
 * ORBIT2_SERVICE_ALERTS_ENABLED=true (wrangler.jsonc); the bell alerts don't.
 */
import { emailBrandLockup } from "@/lib/email/brand-mark";
import { sendEmail } from "@/lib/ses.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { daysBetween, todayUae } from "@/lib/permit-expiry";

const APP_URL = (process.env.PUBLIC_APP_URL ?? "https://polaris.jlsyachts.com").replace(/\/+$/, "");
const SOON_DAYS = 30;
const WEEK_DAYS = 7;
const SOON_HOURS = 25;

function emailsEnabled(): boolean {
  const v = (process.env.ORBIT2_SERVICE_ALERTS_ENABLED ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmtDate = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmtHours = (n: number) => Number(n).toLocaleString("en-GB", { maximumFractionDigits: 1 });

type Stage = "d30" | "d7" | "d0" | "hsoon" | "hdue";
type Due = {
  alertKey: string;
  stage: Stage;
  boatId: string;
  boatName: string;
  serviceId: string | null;
  inventoryId: string | null;
  what: string;
  /** "Due in 6 days (18 October 2026)", "412 of 500 hrs — 88 hrs to go"… */
  when: string;
  urgent: boolean;
};

function dateStage(days: number): Stage | null {
  return days <= 0 ? "d0" : days <= WEEK_DAYS ? "d7" : days <= SOON_DAYS ? "d30" : null;
}
function dateWhen(days: number, date: string): string {
  const d = fmtDate(date);
  if (days < -1) return `Overdue by ${-days} days (was due ${d})`;
  if (days === -1) return `Overdue since yesterday (${d})`;
  if (days === 0) return `Due today (${d})`;
  return `Due in ${days} day${days === 1 ? "" : "s"} (${d})`;
}

/** Everything due today that hasn't been alerted yet. Sends nothing. */
async function dueAlerts(): Promise<Due[]> {
  const sb = supabaseAdmin as any;
  const today = todayUae();
  const horizon = new Date(Date.parse(today + "T00:00:00Z") + SOON_DAYS * 86_400_000).toISOString().slice(0, 10);

  const { data: boats, error: bErr } = await sb.from("orbit2_boats").select("id, name").eq("active", true);
  if (bErr) throw new Error(`boats: ${bErr.message}`);
  const boatName = new Map(((boats ?? []) as any[]).map((b) => [b.id as string, b.name as string]));
  if (!boatName.size) return [];
  const ids = [...boatName.keys()];

  const [svc, inv] = await Promise.all([
    sb.from("orbit2_boat_services")
      .select("id, boat_id, service, next_service_date, current_run_hours, next_service_run_hours").in("boat_id", ids),
    sb.from("orbit2_boat_inventory")
      .select("id, boat_id, item, expiry_date").in("boat_id", ids).not("expiry_date", "is", null).lte("expiry_date", horizon),
  ]);
  if (svc.error) throw new Error(`services: ${svc.error.message}`);
  if (inv.error) throw new Error(`inventory: ${inv.error.message}`);

  const due: Due[] = [];
  for (const s of (svc.data ?? []) as any[]) {
    const base = { boatId: s.boat_id, boatName: boatName.get(s.boat_id) ?? "Boat", serviceId: s.id, inventoryId: null, what: s.service as string };
    if (s.next_service_date) {
      const days = daysBetween(today, s.next_service_date);
      const stage = dateStage(days);
      if (stage) due.push({ ...base, stage, alertKey: `svc:${s.id}|${s.next_service_date}|${stage}`, when: dateWhen(days, s.next_service_date), urgent: stage !== "d30" });
    }
    if (s.current_run_hours != null && s.next_service_run_hours != null) {
      const cur = Number(s.current_run_hours), next = Number(s.next_service_run_hours);
      const left = next - cur;
      const stage: Stage | null = left <= 0 ? "hdue" : left <= SOON_HOURS ? "hsoon" : null;
      if (stage) due.push({
        ...base, stage, alertKey: `svc:${s.id}|h${next}|${stage}`, urgent: stage === "hdue",
        when: left <= 0
          ? `Service due by running hours — ${fmtHours(cur)} hrs, service at ${fmtHours(next)}`
          : `${fmtHours(left)} running hours to go (${fmtHours(cur)} of ${fmtHours(next)})`,
      });
    }
  }
  for (const i of (inv.data ?? []) as any[]) {
    const days = daysBetween(today, i.expiry_date);
    const stage = dateStage(days);
    if (!stage) continue;
    due.push({
      alertKey: `inv:${i.id}|${i.expiry_date}|${stage}`, stage, boatId: i.boat_id, boatName: boatName.get(i.boat_id) ?? "Boat",
      serviceId: null, inventoryId: i.id, what: `${i.item} (Inventory)`,
      when: dateWhen(days, i.expiry_date).replace(/^Due/, "Expires").replace(/^Overdue/, "Expired"), urgent: stage !== "d30",
    });
  }
  if (!due.length) return [];

  const { data: sent } = await sb.from("orbit2_service_alerts").select("alert_key").in("alert_key", due.map((d) => d.alertKey));
  const already = new Set(((sent ?? []) as any[]).map((r) => r.alert_key));
  return due.filter((d) => !already.has(d.alertKey));
}

function buildEmail(items: Due[]): { subject: string; html: string; text: string } {
  const urgent = items.filter((i) => i.urgent).length;
  const subject = urgent
    ? `⚠️ Managed Boats — ${urgent} service${urgent === 1 ? "" : "s"} due now or within 7 days${items.length > urgent ? ` (+${items.length - urgent} more)` : ""}`
    : `Managed Boats — ${items.length} service${items.length === 1 ? "" : "s"} due within 30 days`;
  const sorted = [...items].sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.boatName.localeCompare(b.boatName));
  const link = (i: Due) => `${APP_URL}/polaris-redesign?screen=orbit2&boat=${i.boatId}&view=services`;
  const rows = sorted.map((i) => `<tr style="border-top:1px solid #e2e8f0;">
      <td style="padding:9px 12px;font-size:13px;font-weight:600;"><a href="${link(i)}" style="color:#0f172a;text-decoration:none;">${esc(i.boatName)}</a></td>
      <td style="padding:9px 12px;font-size:13px;color:#0f172a;">${esc(i.what)}</td>
      <td style="padding:9px 12px;font-size:13px;font-weight:600;color:${i.urgent ? "#dc2626" : "#d97706"};">${esc(i.when)}</td>
    </tr>`).join("");
  const head = (t: string) => `<td style="padding:9px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">${t}</td>`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Services due</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Inter',Arial,sans-serif;color:#0f172a;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:28px 16px;"><tr><td align="center">
<table width="720" cellpadding="0" cellspacing="0" style="max-width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f172a;padding:20px 24px;">
    ${emailBrandLockup(`<div style="font-size:17px;font-weight:700;color:#fff;">Polaris — Managed Boats services due</div>
    <div style="font-size:12px;color:#94a3b8;margin-top:3px;">From the boats' Service Calendars — engine services and safety equipment.</div>`, 36)}
  </td></tr>
  <tr><td style="padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr style="background:#f1f5f9;">${head("Boat")}${head("Service")}${head("Due")}</tr>
      ${rows}
    </table>
  </td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 24px;">
    <p style="margin:0;font-size:12px;color:#64748b;">Alerts go 30 and 7 days before a service date or expiry, on the day, and within ${SOON_HOURS} running hours of an engine service. Update the boat's Service Calendar once the work is done. Internal only — nothing has been sent to the owners.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = [
    subject, "",
    ...sorted.map((i) => `${i.boatName} · ${i.what} · ${i.when}`),
    "", "Update the boat's Service Calendar in Polaris → Orbit 2 → Managed Boats once the work is done. Internal only.",
  ].join("\n");
  return { subject, html, text };
}

export async function runServiceDueAlerts(): Promise<{ alerts: number; emails: number }> {
  const sb = supabaseAdmin as any;
  const items = await dueAlerts();
  if (!items.length) return { alerts: 0, emails: 0 };

  // Claim first — a second run (or a retry) finds them taken.
  const { data: claimed, error } = await sb.from("orbit2_service_alerts").upsert(
    items.map((i) => ({ alert_key: i.alertKey, boat_id: i.boatId, service_id: i.serviceId, inventory_id: i.inventoryId, stage: i.stage })),
    { onConflict: "alert_key", ignoreDuplicates: true },
  ).select("alert_key");
  if (error) throw new Error(`claim: ${error.message}`);
  const mine = new Set(((claimed ?? []) as any[]).map((r) => r.alert_key));
  const toSend = items.filter((i) => mine.has(i.alertKey));
  if (!toSend.length) return { alerts: 0, emails: 0 };

  const { data: people, error: pErr } = await sb.rpc("orbit2_admin_recipients");
  if (pErr) throw new Error(`recipients: ${pErr.message}`);
  const team = (people ?? []) as { user_id: string; display_name: string | null; email: string | null }[];

  const notes = toSend.flatMap((i) => team.map((p) => ({
    user_id: p.user_id,
    type: "orbit2_service_due",
    urgency: i.urgent ? "danger" : "warning",
    title: `${i.what} — ${i.boatName}`,
    body: `${i.when}. Update the Service Calendar once it's done.`,
    action_url: `/polaris-redesign?screen=orbit2&boat=${i.boatId}&view=services`,
    metadata: { boat_id: i.boatId, service_id: i.serviceId, inventory_id: i.inventoryId, stage: i.stage },
  })));
  if (notes.length) {
    const { error: nErr } = await sb.from("notifications").insert(notes);
    if (nErr) console.error("[orbit2-service-alerts] notifications:", nErr.message);
  }

  let emails = 0;
  const to = team.map((p) => p.email).filter((e): e is string => !!e);
  if (emailsEnabled() && to.length) {
    try {
      await sendEmail({ to, ...buildEmail(toSend) });
      emails = 1;
    } catch (e) {
      console.error("[orbit2-service-alerts] email failed:", e instanceof Error ? e.message : e);
    }
  } else if (!emailsEnabled()) {
    console.warn("[orbit2-service-alerts] emails off (ORBIT2_SERVICE_ALERTS_ENABLED is not true) — bell alerts only.");
  }

  const { error: uErr } = await sb.from("orbit2_service_alerts")
    .update({ notified_users: team.map((p) => p.user_id), emailed: emails ? to : [] })
    .in("alert_key", toSend.map((i) => i.alertKey));
  if (uErr) console.error("[orbit2-service-alerts] record:", uErr.message);
  console.log(`[orbit2-service-alerts] ${toSend.length} alert(s), ${notes.length} in-app, ${emails} email(s)`);
  return { alerts: toSend.length, emails };
}
