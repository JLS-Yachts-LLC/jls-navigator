/**
 * Fallback delivery for Supabase auth emails (invites / password resets).
 *
 * Supabase's built-in email service is heavily rate-limited and custom SMTP can
 * fail, so when the native send errors we mint the action link via the admin API
 * (generateLink does NOT send an email — no rate limit) and deliver it ourselves
 * through the app's proven AWS SES sender.
 */
import { sendEmail } from '@/lib/ses.server'

type AuthLinkType = 'invite' | 'magiclink' | 'recovery'

function emailHtml(heading: string, intro: string, cta: string, link: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0b1220;padding:24px;font-family:Inter,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#0f1d2e;border:1px solid #1e2d40;border-radius:12px;overflow:hidden">
      <tr><td style="padding:22px 28px;border-bottom:1px solid #1e2d40">
        <span style="font-family:Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:.14em;color:#e8edf5">POLARIS</span>
      </td></tr>
      <tr><td style="padding:28px">
        <h1 style="margin:0 0 12px;font-size:18px;color:#e8edf5">${heading}</h1>
        <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#9fb3c8">${intro}</p>
        <a href="${link}" style="display:inline-block;background:#00c4cc;color:#04222b;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px">${cta}</a>
        <p style="margin:22px 0 0;font-size:12px;color:#6b8298">If the button doesn't work, paste this link into your browser:<br><span style="color:#7fa8c0;word-break:break-all">${link}</span></p>
      </td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:11px;color:#5f7488">JLS Yachts · Polaris Operational Platform</p>
  </td></tr></table>
  </body></html>`
}

/**
 * Generate an auth action link and email it via SES. Returns true on success,
 * false if the link couldn't be generated or the email failed (caller decides
 * how to surface that — the user account is unaffected either way).
 */
export async function sendAuthLinkViaSES(sb: any, opts: {
  email: string
  type: AuthLinkType
  redirectTo: string
  subject: string
  heading: string
  intro: string
  cta: string
}): Promise<boolean> {
  try {
    const { data, error } = await sb.auth.admin.generateLink({
      type: opts.type,
      email: opts.email,
      options: { redirectTo: opts.redirectTo },
    })
    const link = data?.properties?.action_link
    if (error || !link) return false
    await sendEmail({
      from: process.env.POLARIS_MAIL_SENDER ?? 'polaris@jlsyachts.com',
      to: [opts.email],
      subject: opts.subject,
      html: emailHtml(opts.heading, opts.intro, opts.cta, link),
      text: `${opts.intro}\n\n${opts.cta}: ${link}`,
    })
    return true
  } catch {
    return false
  }
}
