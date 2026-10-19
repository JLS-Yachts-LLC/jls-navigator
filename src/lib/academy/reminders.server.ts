/**
 * Crew Academy reminder emails (worker's 5-minute tick).
 *
 * Finds unfinished enrolments that are due a reminder (reminderKinds), skips
 * any already recorded in academy_reminders, and sends each crew member ONE
 * email listing everything new, due soon or overdue. Every reminder is recorded
 * (sent / held / failed) so it never goes out twice.
 *
 * Automatic messages to clients obey the vessel's switch (client_auto_messages —
 * the Polaris rule since 9 Oct 2026): while a vessel is off its reminders are
 * recorded as 'held' and never sent later. Crew are outside addresses, so the
 * mail guard (CLIENT_EMAIL_ENABLED) applies on top; a blocked send is 'failed'.
 */
import { createClient } from "@supabase/supabase-js";
import { allowed, autoMessageTargets } from "@/lib/client-auto-messages.server";
import { sendEmail } from "@/lib/ses.server";
import { appBaseUrl } from "@/lib/app-url.server";
import { emailBrandLockup } from "@/lib/email/brand-mark";
import { reminderKinds } from "@/lib/academy/reminders";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

type Item = { enrolmentId: string; kind: string; course: string; due: string | null; refresher: boolean };

function line(i: Item): { html: string; text: string } {
  const what = i.kind === "enrolled" ? (i.refresher ? "Refresher due" : "New course")
    : i.kind === "due_soon" ? "Due soon" : "Overdue";
  const when = i.due ? (i.kind.startsWith("overdue") ? ` — was due ${fmt(i.due)}` : ` — due ${fmt(i.due)}`) : "";
  const colour = i.kind.startsWith("overdue") ? "#ff8a8a" : i.kind === "due_soon" ? "#f5c26b" : "#7fd1c7";
  return {
    html: `<li style="margin:0 0 8px"><span style="color:${colour};font-weight:600">${what}:</span> <span style="color:#e8edf5">${esc(i.course)}</span><span style="color:#9fb3c8">${esc(when)}</span></li>`,
    text: `- ${what}: ${i.course}${when}`,
  };
}

function reminderEmail(name: string | null, vessel: string, items: Item[]) {
  const link = `${appBaseUrl()}/academy`;
  const overdue = items.some((i) => i.kind.startsWith("overdue"));
  const subject = overdue ? `${vessel}: training overdue` : items.every((i) => i.kind === "enrolled") ? `${vessel}: new training for you` : `${vessel}: training due soon`;
  const lines = items.map(line);
  const html = `<!doctype html><html><body style="margin:0;background:#0b1220;padding:24px;font-family:Inter,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#0f1d2e;border:1px solid #1e2d40;border-radius:12px;overflow:hidden">
      <tr><td style="padding:22px 28px;border-bottom:1px solid #1e2d40">
        ${emailBrandLockup('<span style="font-family:Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:.14em;color:#e8edf5">CREW ACADEMY</span>', 28)}
      </td></tr>
      <tr><td style="padding:28px">
        <h1 style="margin:0 0 12px;font-size:18px;color:#e8edf5">${name ? `Hello ${esc(name.split(" ")[0])},` : "Hello,"}</h1>
        <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#9fb3c8">Here's your training on ${esc(vessel)}:</p>
        <ul style="margin:0 0 20px;padding-left:18px;font-size:14px">${lines.map((l) => l.html).join("")}</ul>
        <a href="${link}" style="display:inline-block;background:#00c4cc;color:#04222b;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px">Open Crew Academy</a>
        <p style="margin:22px 0 0;font-size:12px;color:#6b8298">You get these because ${esc(vessel)} uses Crew Academy for crew training.</p>
      </td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:11px;color:#5f7488">JLS Yachts · Crew Academy</p>
  </td></tr></table></body></html>`;
  const text = `${name ? `Hello ${name.split(" ")[0]},` : "Hello,"}\n\nHere's your training on ${vessel}:\n\n${lines.map((l) => l.text).join("\n")}\n\nOpen Crew Academy: ${link}`;
  return { subject, html, text };
}

export async function sendAcademyReminders(): Promise<{ sent: number; held: number; failed: number }> {
  const sb: any = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: rows, error } = await sb.from("academy_enrolments")
    .select("id, yacht_id, learner_id, course_id, status, created_at, due_date, academy_learners!inner(active, email, display_name, user_id), academy_courses(title), yachts(vessel_name)")
    .in("status", ["not_started", "in_progress", "failed"]).eq("academy_learners.active", true)
    .order("created_at", { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);

  const now = new Date();
  const candidates = (rows ?? []).flatMap((r: any) => reminderKinds(r, now).map((kind) => ({ r, kind })));
  if (!candidates.length) return { sent: 0, held: 0, failed: 0 };

  const ids = [...new Set(candidates.map((c: any) => c.r.id))];
  const [{ data: done }, { data: expired }] = await Promise.all([
    sb.from("academy_reminders").select("enrolment_id, kind").in("enrolment_id", ids),
    sb.from("academy_enrolments").select("learner_id, course_id").eq("status", "expired")
      .in("learner_id", [...new Set(candidates.map((c: any) => c.r.learner_id))]),
  ]);
  const already = new Set((done ?? []).map((d: any) => `${d.enrolment_id}:${d.kind}`));
  const hadBefore = new Set((expired ?? []).map((e: any) => `${e.learner_id}:${e.course_id}`));
  const pending = candidates.filter((c: any) => !already.has(`${c.r.id}:${c.kind}`));

  // One email per crew member.
  const byLearner = new Map<string, { r: any; items: Item[] }>();
  for (const { r, kind } of pending as any[]) {
    const g = byLearner.get(r.learner_id) ?? { r, items: [] };
    g.items.push({ enrolmentId: r.id, kind, course: r.academy_courses?.title ?? "Course", due: r.due_date, refresher: hadBefore.has(`${r.learner_id}:${r.course_id}`) });
    byLearner.set(r.learner_id, g);
  }

  const targets = await autoMessageTargets();
  const counts = { sent: 0, held: 0, failed: 0 };
  for (const { r, items } of byLearner.values()) {
    const record = (status: "sent" | "held" | "failed", detail: string | null) =>
      sb.from("academy_reminders").upsert(items.map((i) => ({ enrolment_id: i.enrolmentId, kind: i.kind, status, detail })), { onConflict: "enrolment_id,kind", ignoreDuplicates: true });
    if (!allowed(targets, { yachtId: r.yacht_id })) { await record("held", "Automatic messages are off for this vessel"); counts.held += items.length; continue; }
    const learner = r.academy_learners;
    if (!learner?.user_id || !learner.email) { await record("failed", "No login"); counts.failed += items.length; continue; }
    const mail = reminderEmail(learner.display_name, r.yachts?.vessel_name ?? "your vessel", items);
    try {
      await sendEmail({ from: process.env.POLARIS_MAIL_SENDER ?? "polaris@jlsyachts.com", to: [learner.email], ...mail });
      await record("sent", null); counts.sent += items.length;
    } catch (e: any) {
      await record("failed", String(e?.message ?? "Send failed").slice(0, 500)); counts.failed += items.length;
    }
  }
  return counts;
}
