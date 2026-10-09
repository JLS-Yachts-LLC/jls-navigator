/**
 * Emails to a staff member about their own sends (profile menu → My
 * notifications; settings in lib/staff-notifications.ts).
 *
 *   notifySentToClient() — "you sent X to Y", after a successful Send to client
 *                          (permits) or Send to Vessel (crew visas).
 *   notifyShareOpened()  — the first time a client opens a secure link that
 *                          person sent (document-share.server records the open).
 *
 * Both are best-effort and never throw: a confirmation that can't be sent must
 * not turn a delivered email into an error. They link to Document Links in
 * Polaris, never to the client's own link — opening that would count as the
 * client opening it.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail } from "@/lib/ses.server";
import { appBaseUrl } from "@/lib/app-url.server";
import { notificationDefault, type StaffNotificationKey } from "@/lib/staff-notifications";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });

/** Whether this person wants this notification, and where to send it. */
async function recipientFor(userId: string, key: StaffNotificationKey): Promise<string | null> {
  const sb = supabaseAdmin as any;
  const [{ data: pref }, { data: profile }] = await Promise.all([
    sb.from("user_preferences").select("prefs").eq("user_id", userId).maybeSingle(),
    sb.from("user_profiles").select("email").eq("user_id", userId).maybeSingle(),
  ]);
  const saved = pref?.prefs?.[key];
  const wants = typeof saved === "boolean" ? saved : notificationDefault(key);
  if (!wants) return null;
  let email: string | null = profile?.email ?? null;
  if (!email) {
    const { data } = await sb.auth.admin.getUserById(userId).catch(() => ({ data: null }));
    email = data?.user?.email ?? null;
  }
  return email && /.+@.+\..+/.test(email) ? email : null;
}

function shell(title: string, body: string, settingsNote: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;max-width:560px">
    <h2 style="margin:0 0 10px;font-size:16px;color:#07435E">${esc(title)}</h2>
    ${body}
    <p style="margin:18px 0 0;font-size:12px;color:#94a3b8">${settingsNote} You can change this in Polaris — your profile picture → My notifications.</p>
  </div>`;
}

const row = (label: string, value: string) =>
  `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;vertical-align:top">${esc(label)}</td><td style="padding:3px 0">${value}</td></tr>`;

export async function notifySentToClient(opts: {
  userId: string;
  document: string;           // e.g. "TDRA Permit", "UAE Crew Visa — John Smith"
  reference?: string | null;
  vessel?: string | null;
  to: string[];
  cc?: string[];
  secureLinkExpiresAt?: string | null;
}): Promise<void> {
  try {
    const email = await recipientFor(opts.userId, "notify.sentToClient");
    if (!email) return;
    const opened = await recipientFor(opts.userId, "notify.clientOpened");
    const base = appBaseUrl();
    const body = `<p style="margin:0 0 10px">Your email went out successfully.</p>
      <table cellpadding="0" cellspacing="0" style="font-size:14px">
        ${row("Document", `<b>${esc(opts.document)}</b>${opts.reference ? ` · ${esc(opts.reference)}` : ""}`)}
        ${opts.vessel ? row("Vessel", esc(opts.vessel)) : ""}
        ${row("Sent to", esc(opts.to.join(", ")))}
        ${opts.cc?.length ? row("Copied", esc(opts.cc.join(", "))) : ""}
        ${row("Sent", esc(when(new Date().toISOString())))}
        ${opts.secureLinkExpiresAt ? row("Secure link", `expires ${esc(when(opts.secureLinkExpiresAt))}`) : ""}
      </table>
      <p style="margin:14px 0 0">${opened ? "We'll email you again when the client opens it. " : ""}See who has opened it, or revoke the link, in
        <a href="${esc(base)}/document-links" style="color:#4590BA">Document Links</a>.</p>`;
    await sendEmail({
      to: [email],
      subject: `Sent: ${opts.document}${opts.vessel ? ` — ${opts.vessel}` : ""}`,
      html: shell("Sent to the client", body, "You're getting this because you asked for a confirmation when you send a document to a client."),
      text: `Sent: ${opts.document}${opts.reference ? ` (${opts.reference})` : ""}${opts.vessel ? ` for ${opts.vessel}` : ""} to ${opts.to.join(", ")}.`,
    });
  } catch (e) {
    console.error("[staff-notify] sent confirmation failed:", e instanceof Error ? e.message : e);
  }
}

/** The first open of a secure link: tell whoever sent it, if they asked to know. */
export async function notifyShareOpened(shareId: string): Promise<void> {
  try {
    const sb = supabaseAdmin as any;
    const { data: share } = await sb.from("document_shares")
      .select("title, reference, vessel_name, recipient_email, created_by, created_at, first_accessed_at").eq("id", shareId).maybeSingle();
    if (!share?.created_by) return;
    const email = await recipientFor(share.created_by, "notify.clientOpened");
    if (!email) return;
    const base = appBaseUrl();
    const body = `<p style="margin:0 0 10px">The client has opened the secure link you sent.</p>
      <table cellpadding="0" cellspacing="0" style="font-size:14px">
        ${row("Document", `<b>${esc(share.title ?? "Document")}</b>${share.reference ? ` · ${esc(share.reference)}` : ""}`)}
        ${share.vessel_name ? row("Vessel", esc(share.vessel_name)) : ""}
        ${share.recipient_email ? row("Sent to", esc(share.recipient_email)) : ""}
        ${row("Sent", esc(when(share.created_at)))}
        ${row("First opened", esc(when(share.first_accessed_at ?? new Date().toISOString())))}
      </table>
      <p style="margin:14px 0 0">Every open is listed in <a href="${esc(base)}/document-links" style="color:#4590BA">Document Links</a>.</p>`;
    await sendEmail({
      to: [email],
      subject: `Opened: ${share.title ?? "Document"}${share.vessel_name ? ` — ${share.vessel_name}` : ""}`,
      html: shell("The client opened it", body, "You're getting this because you asked to know when a client opens a document you sent."),
      text: `Opened: ${share.title ?? "Document"}${share.vessel_name ? ` (${share.vessel_name})` : ""} — first opened ${when(share.first_accessed_at ?? new Date().toISOString())}.`,
    });
  } catch (e) {
    console.error("[staff-notify] opened notification failed:", e instanceof Error ? e.message : e);
  }
}
