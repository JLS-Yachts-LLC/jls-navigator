/**
 * Emails a guest receives: the invitation (set your password) and a note that
 * something new has been shared with them.
 *
 * Guests are outside addresses, so both are subject to CLIENT_EMAIL_ENABLED
 * (mail-guard). When client mail is off the invite still hands back its link so
 * the admin can pass it on, and a share notice simply reports it was not sent.
 */
import { sendAuthLinkViaSES, type AuthLinkResult } from "@/lib/admin/auth-email.server";
import { emailBrandLockup } from "@/lib/email/brand-mark";
import { sendEmail } from "@/lib/ses.server";
import { appBaseUrl } from "@/lib/app-url.server";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const guestPortalUrl = () => `${appBaseUrl()}/guest`;

/** A set-your-password link that lands on the guest sign-in page. */
export function sendGuestInvite(sb: any, opts: { email: string; invitedBy: string; name?: string | null }): Promise<AuthLinkResult> {
  return sendAuthLinkViaSES(sb, {
    email: opts.email,
    type: "recovery",
    redirectTo: guestPortalUrl(),
    subject: "You have been invited to view documents from JLS Yachts",
    heading: `${opts.name ? `Hello ${opts.name}, you` : "You"} have been invited as a guest`,
    intro: `${opts.invitedBy} at JLS Yachts has given you a guest login so you can view documents they share with you. Set your password to get started. You will only see the files and folders that have been shared with you.`,
    cta: "Set my password",
  });
}

export type SharedItem = { name: string; kind: "folder" | "document" };

/** "X shared N items with you" — one email per guest, however many items. */
export async function sendShareNotice(opts: {
  to: string;
  guestName: string | null;
  sharedBy: string;
  items: SharedItem[];
  permissionLabel: string;
  message?: string | null;
  expiresAt?: string | null;
}): Promise<{ sent: boolean; error: string | null }> {
  const link = guestPortalUrl();
  const list = opts.items.slice(0, 12).map((i) =>
    `<li style="margin:0 0 6px">${i.kind === "folder" ? "📁" : "📄"} ${esc(i.name)}</li>`).join("");
  const more = opts.items.length > 12 ? `<li>…and ${opts.items.length - 12} more</li>` : "";
  const expiry = opts.expiresAt
    ? `<p style="margin:0 0 16px;font-size:13px;color:#9fb3c8">Access ends on ${esc(new Date(opts.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))}.</p>`
    : "";
  const note = opts.message?.trim()
    ? `<blockquote style="margin:0 0 18px;padding:10px 14px;border-left:3px solid #00c4cc;background:#13243a;color:#c8d6e5;font-size:14px;line-height:1.5">${esc(opts.message.trim()).replace(/\n/g, "<br>")}</blockquote>`
    : "";
  const what = opts.items.length === 1 ? `“${esc(opts.items[0].name)}”` : `${opts.items.length} items`;

  const html = `<!doctype html><html><body style="margin:0;background:#0b1220;padding:24px;font-family:Inter,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#0f1d2e;border:1px solid #1e2d40;border-radius:12px;overflow:hidden">
      <tr><td style="padding:22px 28px;border-bottom:1px solid #1e2d40">
        ${emailBrandLockup('<span style="font-family:Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:.14em;color:#e8edf5">POLARIS</span>', 28)}
      </td></tr>
      <tr><td style="padding:28px">
        <h1 style="margin:0 0 12px;font-size:18px;color:#e8edf5">${esc(opts.sharedBy)} shared ${what} with you</h1>
        <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#9fb3c8">${opts.guestName ? `Hello ${esc(opts.guestName)}, ` : ""}you have <strong style="color:#e8edf5">${esc(opts.permissionLabel)}</strong> access to:</p>
        <ul style="margin:0 0 18px;padding-left:18px;font-size:14px;color:#e8edf5">${list}${more}</ul>
        ${note}${expiry}
        <a href="${link}" style="display:inline-block;background:#00c4cc;color:#04222b;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px">Open shared documents</a>
        <p style="margin:22px 0 0;font-size:12px;color:#6b8298">Sign in with your guest login at <span style="color:#7fa8c0">${link}</span></p>
      </td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:11px;color:#5f7488">JLS Yachts · Polaris Operational Platform</p>
  </td></tr></table></body></html>`;

  const text = `${opts.sharedBy} shared ${opts.items.length === 1 ? opts.items[0].name : `${opts.items.length} items`} with you (${opts.permissionLabel}).\n\n`
    + opts.items.map((i) => `- ${i.name}`).join("\n")
    + (opts.message?.trim() ? `\n\n${opts.message.trim()}` : "")
    + `\n\nOpen them: ${link}`;

  try {
    await sendEmail({
      from: process.env.POLARIS_MAIL_SENDER ?? "polaris@jlsyachts.com",
      to: [opts.to],
      subject: `${opts.sharedBy} shared ${opts.items.length === 1 ? `“${opts.items[0].name}”` : `${opts.items.length} items`} with you`,
      html, text,
    });
    return { sent: true, error: null };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "Email send failed" };
  }
}
