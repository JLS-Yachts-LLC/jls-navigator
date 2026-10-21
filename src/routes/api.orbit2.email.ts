/**
 * POST /api/orbit2/email — the email thread on an Orbit 2 record (Email Threads tab).
 *
 *   { action: "poll" }                               check the mailboxes now
 *   { action: "reply", project_id, text, email_id?, cc?, file_ids? }
 *                                                    reply-all to the client
 *
 * The thread itself is read straight from `orbit2_emails` by the page.
 */
import { createClient } from "@supabase/supabase-js";
import { requireAccess } from "@/lib/auth/requireAccess.server";
import { pollOrbit2Mail, replyOnOrbit2Thread } from "@/lib/orbit2/orbit2-mail.server";
import { signatureSender } from "@/lib/brand/jls-signature.server";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function orbit2EmailHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "orbit", level: "edit" });
  if (!access.ok) return access.response;

  let body: { action?: string; project_id?: string; email_id?: string; text?: string; cc?: unknown; file_ids?: unknown };
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (body.action === "poll") {
    try {
      const results = await pollOrbit2Mail();
      if (!results) return json({ error: "Mail reading is not configured on this environment." }, 503);
      const failed = results.filter((r) => r.error);
      return json({
        ok: failed.length === 0,
        filed: results.reduce((n, r) => n + r.filed, 0),
        attachments: results.reduce((n, r) => n + r.attachments, 0),
        error: failed.length ? failed.map((r) => `${r.mailbox}: ${r.error}`).join(" ") : undefined,
      });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Could not check the mailbox" }, 500);
    }
  }

  if (body.action === "reply") {
    const text = String(body.text ?? "").trim();
    if (!body.project_id) return json({ error: "project_id is required" }, 400);
    if (!text) return json({ error: "Write a reply first." }, 400);
    const cc = Array.isArray(body.cc)
      ? [...new Set(body.cc.map((a) => String(a ?? "").trim().toLowerCase()).filter(Boolean))]
      : [];
    const bad = cc.filter((a) => !EMAIL.test(a));
    if (bad.length) return json({ error: `Not a valid CC address: ${bad.join(", ")}` }, 400);
    if (cc.length > 20) return json({ error: "Up to 20 CC addresses per email." }, 400);
    const fileIds = Array.isArray(body.file_ids) ? body.file_ids.map(String).slice(0, 10) : [];

    const sb = createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });
    const sender = await signatureSender(sb, access.claims.userId, access.claims.email ?? "");

    try {
      const sent = await replyOnOrbit2Thread({
        projectId: body.project_id, emailId: body.email_id ?? null, text, cc, fileIds,
        userId: access.claims.userId, userEmail: access.claims.email ?? "", sender,
      });
      await sb.from("audit_log").insert({
        user_id: access.claims.userId,
        event_type: "data_edit",
        module: "orbit",
        resource_type: "orbit2_project",
        resource_id: body.project_id,
        metadata: { action: "client_email_reply", to: sent.to, cc: sent.cc, files: fileIds.length || null },
      });
      return json({ ok: true, id: sent.id });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Reply failed" }, 400);
    }
  }

  return json({ error: "Unknown action" }, 400);
}
