/**
 * POST /api/orbit2/notify — the client acknowledgement for an Orbit 2 record.
 *
 * Spec section 3, "Automated Client Notifications": once a team is assigned the
 * client is told the request is logged, who will handle it, and the confirmed
 * schedule. Email goes via Graph, WhatsApp via the same n8n webhook the visa
 * reports use.
 *
 * Triggered by an explicit press in the detail panel rather than by the Assign
 * Team dropdown itself. This message leaves the building to a real client, and
 * ticking a name on and off again while deciding who to send should not fire it
 * two or three times.
 *
 * A failure on one channel does not cancel the other: a WhatsApp webhook that is
 * not configured must not stop the email that was the important part.
 */
import { createClient } from "@supabase/supabase-js";
import { requireAccess } from "@/lib/auth/requireAccess.server";
import { sendGraphEmail } from "@/lib/graph-mail.server";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function admin() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false } },
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** MMM DD, YYYY – Day – HH:MM, the format the module states schedules in. */
function scheduleLine(date: string | null, time: string | null): string {
  if (!date) return "to be confirmed";
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  const md = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return `${md} (${day})${time ? ` at ${time.slice(0, 5)}` : ""}`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function orbit2NotifyHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "orbit", level: "edit" });
  if (!access.ok) return access.response;

  let body: { project_id?: string };
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const projectId = body.project_id;
  if (!projectId) return json({ error: "project_id is required" }, 400);

  const sb = admin();
  const { data: project, error } = await sb
    .from("orbit2_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !project) return json({ error: "Record not found" }, 404);

  const team: string[] = project.assigned_team ?? [];
  if (team.length === 0) return json({ error: "Assign a team member before notifying the client." }, 400);

  const who = team.length === 1 ? team[0] : `${team.slice(0, -1).join(", ")} and ${team[team.length - 1]}`;
  const when = scheduleLine(project.schedule_date, project.schedule_time);
  const where = project.location || "to be confirmed";
  const what = project.record_type === "bunkering"
    ? `Bunkering${project.product_grade ? ` — ${project.product_grade}` : ""}`
    : (project.specific_task || project.service_category);

  let emailSent = false;
  let whatsappSent = false;
  const problems: string[] = [];

  // ── Email ──
  const to = (project.email ?? "").trim();
  if (to && EMAIL.test(to)) {
    const html = `
      <p>Dear ${esc(project.requestor_name || project.client_name || "Sir/Madam")},</p>
      <p>Your request has been logged with reference
         <strong>${esc(project.task_id)}</strong>.</p>
      <table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:15px">
        <tr><td><strong>Vessel / Client</strong></td><td>${esc(project.client_name ?? "—")}</td></tr>
        <tr><td><strong>Service</strong></td><td>${esc(what ?? "—")}</td></tr>
        <tr><td><strong>Attending</strong></td><td>${esc(who)}</td></tr>
        <tr><td><strong>Date &amp; time</strong></td><td>${esc(when)}</td></tr>
        <tr><td><strong>Location</strong></td><td>${esc(where)}</td></tr>
      </table>
      <p>Our Port &amp; Agency Team will be in touch if anything changes.</p>
      <p>Kind regards,<br/>Superyacht Middle East</p>`;
    try {
      await sendGraphEmail({
        to: [to],
        subject: `${project.task_id} — ${project.client_name ?? "Operational request"} confirmed`,
        html,
      });
      emailSent = true;
    } catch (e) {
      problems.push(`Email: ${e instanceof Error ? e.message : "send failed"}`);
    }
  } else if (to) {
    problems.push("Email: the address on the record is not valid.");
  }

  // ── WhatsApp ──
  const wa = (project.whatsapp ?? "").trim();
  const webhook = (process.env as Record<string, string | undefined>).N8N_WHATSAPP_WEBHOOK_URL;
  if (wa && webhook) {
    const message =
      `*${project.task_id} — request confirmed*\n\n` +
      `Vessel/Client: ${project.client_name ?? "—"}\n` +
      `Service: ${what ?? "—"}\n` +
      `Attending: ${who}\n` +
      `Date & time: ${when}\n` +
      `Location: ${where}\n\n` +
      `— Superyacht Middle East`;
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: wa, message, source: "orbit2_assignment",
          meta: { task_id: project.task_id, project_id: project.id },
        }),
      });
      if (!res.ok) throw new Error(`n8n responded ${res.status}`);
      whatsappSent = true;
    } catch (e) {
      problems.push(`WhatsApp: ${e instanceof Error ? e.message : "send failed"}`);
    }
  } else if (wa) {
    problems.push("WhatsApp: the n8n webhook is not configured on this environment.");
  }

  if (!emailSent && !whatsappSent) {
    return json(
      { error: problems.join(" ") || "No email address or WhatsApp number on this record." },
      400,
    );
  }

  await sb.from("orbit2_projects")
    .update({ client_notified_at: new Date().toISOString() })
    .eq("id", project.id);

  await sb.from("audit_log").insert({
    user_id: access.claims.userId,
    event_type: "data_edit",
    module: "orbit",
    resource_type: "orbit2_project",
    resource_id: project.id,
    metadata: {
      action: "client_notified",
      task_id: project.task_id,
      email: emailSent ? to : null,
      whatsapp: whatsappSent ? wa : null,
      team,
    },
  });

  return json({
    ok: true,
    email: emailSent,
    whatsapp: whatsappSent,
    // Partial success still reports what did not go, so nobody assumes both did.
    warning: problems.length ? problems.join(" ") : undefined,
  });
}
