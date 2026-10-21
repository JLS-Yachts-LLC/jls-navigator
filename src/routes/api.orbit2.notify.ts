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
import { logOrbit2Outbound } from "@/lib/orbit2/orbit2-mail.server";
import { buildBunkerRequestPdf, bunkerRequestFileName, type BunkerRequestRecord } from "@/lib/orbit2/bunker-request-pdf.server";
import { fmtDMY } from "@/lib/format-date";
import { BUNKER_CC } from "@/components/orbit2/orbit2-constants";
import { jlsSignatureHtml, type SignatureSender } from "@/lib/brand/jls-signature";
import { signatureSender } from "@/lib/brand/jls-signature.server";

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


function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * The bunkering request acknowledgement, worded as spec section 1.4 gives it.
 * It goes with the pre-filled request form (deck plan included) for the client
 * to check, mark the manifold on, and send back.
 */
function bunkerEmail(p: BunkerRequestRecord, sender: SignatureSender): { subject: string; html: string } {
  const port = p.delivery_port === "Others" ? (p.delivery_port_other || "Others") : (p.delivery_port || p.location || "—");
  const qty = p.quantity != null ? `${p.quantity} ${p.quantity_unit === "M3" ? "M³" : p.quantity_unit ?? ""}`.trim() : "—";
  const rows: [string, string][] = [
    ["Fuel Grade", p.product_grade || "—"],
    ["Quantity", qty],
    ["Delivery Port", port],
    ["Berth No.", p.berth_no || "—"],
    ["Camlock Type", p.camlock_type || "—"],
    ["Camlock Size", p.camlock_size_in != null ? `${p.camlock_size_in} Inches` : "—"],
    ["Hose Length (M)", p.hose_length_m != null ? String(p.hose_length_m) : "—"],
  ];
  const boat = p.client_name || "your vessel";
  const subject = [p.task_id, "BUNKERING REQUEST", p.client_name || "—", p.schedule_date ? fmtDMY(p.schedule_date) : "Date TBC"].join(" - ");
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">
      <p>Hi ${esc(p.requestor_name || "Captain")},</p>
      <p>Thank you for your inquiry. This email acknowledges receipt of your Bunkering Request
         (Task ID: <strong>${esc(p.task_id)}</strong>) for ${esc(boat)}.</p>
      <p>Here are the details of your request:</p>
      <ul>${rows.map(([k, v]) => `<li><strong>${esc(k)}:</strong> ${esc(v)}</li>`).join("")}</ul>
      <p>Please review the attached PDF to verify that all information is correct. Additionally,
         please mark an (X) on the diagram in the attached PDF to indicate your bunker manifold location.</p>
      <p>To proceed with your request, please reply to this email with your confirmation and attach the completed PDF.</p>
      <p>Thank you,</p>
      ${jlsSignatureHtml(sender)}
    </div>`;
  return { subject, html };
}

export async function orbit2NotifyHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "orbit", level: "edit" });
  if (!access.ok) return access.response;

  let body: { project_id?: string; cc?: unknown };
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const projectId = body.project_id;
  if (!projectId) return json({ error: "project_id is required" }, 400);

  // Extra people to copy, picked by the sender for this one email.
  const extraCc = Array.isArray(body.cc)
    ? [...new Set(body.cc.map((a) => String(a ?? "").trim().toLowerCase()).filter(Boolean))]
    : [];
  const badCc = extraCc.filter((a) => !EMAIL.test(a));
  if (badCc.length) return json({ error: `Not a valid CC address: ${badCc.join(", ")}` }, 400);
  if (extraCc.length > 20) return json({ error: "Up to 20 CC addresses per email." }, 400);
  let ccSent: string[] = [];

  const sb = admin();
  const { data: project, error } = await sb
    .from("orbit2_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !project) return json({ error: "Record not found" }, 404);

  const bunkering = project.record_type === "bunkering";
  const team: string[] = project.assigned_team ?? [];
  // A bunkering request is acknowledged before anyone is assigned to it.
  if (team.length === 0 && !bunkering) return json({ error: "Assign a team member before notifying the client." }, 400);

  const who = team.length === 0 ? "to be confirmed"
    : team.length === 1 ? team[0] : `${team.slice(0, -1).join(", ")} and ${team[team.length - 1]}`;
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
  if (to && EMAIL.test(to) && bunkering) {
    try {
      const sender = await signatureSender(sb, access.claims.userId, access.claims.email);
      const senderName = sender.name;
      const pdf = await buildBunkerRequestPdf(project as BunkerRequestRecord);
      const { subject, html } = bunkerEmail(project as BunkerRequestRecord, sender);
      const self = access.claims.email.toLowerCase();
      const cc = [...new Set([...BUNKER_CC, ...extraCc])].filter((a) => a !== self && a !== to.toLowerCase());
      const mailbox = ((process.env.MAIL_SENDER as string | undefined) ?? "polaris@jlsyachts.com").toLowerCase();
      await sendGraphEmail({
        to: [to],
        cc,
        // Sent from the platform mailbox; the client's reply comes back to it —
        // where Polaris files it on this record (lib/orbit2/orbit2-mail.server) —
        // and to whoever pressed Send.
        replyTo: [mailbox, ...(self && self !== mailbox ? [self] : [])],
        subject,
        html,
        attachments: [{ filename: bunkerRequestFileName(project), contentBase64: toBase64(pdf), contentType: "application/pdf" }],
      });
      emailSent = true;
      ccSent = cc;
      // The request starts the record's email thread (Email Threads tab).
      await logOrbit2Outbound({
        project_id: project.id, mailbox, to: [to], cc, subject, sent_by: access.claims.userId, from_name: senderName,
        body_text: `Bunkering request sent with the request form (${bunkerRequestFileName(project)}) for the client to check, mark the manifold on and send back.`,
      }).catch(() => null);
    } catch (e) {
      problems.push(`Email: ${e instanceof Error ? e.message : "send failed"}`);
    }
  } else if (to && EMAIL.test(to)) {
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
      cc: ccSent.length ? ccSent : null,
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

/**
 * GET /api/orbit2/bunker-form?project_id=… — the request form exactly as the
 * client will receive it, so the team can check it (or send it some other way,
 * e.g. WhatsApp) before pressing Send.
 */
export async function orbit2BunkerFormHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "orbit", level: "view" });
  if (!access.ok) return access.response;

  const projectId = new URL(request.url).searchParams.get("project_id");
  if (!projectId) return json({ error: "project_id is required" }, 400);

  const { data: project, error } = await admin()
    .from("orbit2_projects").select("*").eq("id", projectId).eq("record_type", "bunkering").maybeSingle();
  if (error || !project) return json({ error: "Bunkering record not found" }, 404);

  const pdf = await buildBunkerRequestPdf(project as BunkerRequestRecord);
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${bunkerRequestFileName(project).replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
