/**
 * Microsoft Graph outbound email for the Service Desk.
 * Reuses the SharePoint Graph app credentials (integration_settings) and sends
 * via /users/{sender}/sendMail. The app registration must have the **Mail.Send**
 * application permission (admin-consented); ideally scoped to the sender mailbox
 * with an ApplicationAccessPolicy.
 *
 * Sender defaults to itsupport@jlsyachts.com (override with TICKET_MAIL_SENDER).
 */
import { getSpConfig, getGraphToken } from '@/lib/sharepoint-sync.server'

export const TICKET_MAIL_SENDER = process.env.TICKET_MAIL_SENDER ?? 'itsupport@jlsyachts.com'
const SENDER_NAME = process.env.TICKET_MAIL_SENDER_NAME ?? 'JLS Yachts IT Support'

// Dedicated "Polaris" Graph app for email (separate from the SharePoint-sync app).
// Client ID + tenant are not secrets (safe as defaults); only the client secret
// must be set as the MAIL_GRAPH_CLIENT_SECRET Cloudflare secret.
const MAIL_CLIENT_ID = process.env.MAIL_GRAPH_CLIENT_ID ?? '4f37ca1a-ddbe-4c80-b409-d8e42ac986fa'
const MAIL_TENANT_ID = process.env.MAIL_GRAPH_TENANT_ID ?? '428f2dd0-7a0b-431d-9470-7162111882dd'

/** Acquire a Graph token for sending mail. Uses the dedicated mail app when its
 *  secret is configured; otherwise falls back to the SharePoint integration app. */
async function getMailGraphToken(): Promise<string> {
  // Accept the truncated secret name (…_SECRE) that was created in Cloudflare too,
  // so a one-character naming slip doesn't silently fall back to the wrong app.
  const secret = process.env.MAIL_GRAPH_CLIENT_SECRET ?? process.env.MAIL_GRAPH_CLIENT_SECRE
  if (secret) return getGraphToken(MAIL_TENANT_ID, MAIL_CLIENT_ID, secret)
  const cfg = await getSpConfig() // fallback (lacks Mail.Send → will 403 until the mail secret is set)
  return getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret)
}

export async function sendTicketEmail(opts: {
  to: string
  subject: string
  html: string
  cc?: string | null
  replyTo?: string | null
}): Promise<void> {
  const token = await getMailGraphToken()

  const message: any = {
    subject: opts.subject,
    body: { contentType: 'HTML', content: opts.html },
    toRecipients: [{ emailAddress: { address: opts.to } }],
    from: { emailAddress: { address: TICKET_MAIL_SENDER, name: SENDER_NAME } },
  }
  if (opts.cc) message.ccRecipients = [{ emailAddress: { address: opts.cc } }]
  if (opts.replyTo) message.replyTo = [{ emailAddress: { address: opts.replyTo } }]

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(TICKET_MAIL_SENDER)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  })
  if (res.status !== 202 && !res.ok) {
    throw new Error(`Graph sendMail ${res.status}: ${(await res.text()).slice(0, 240)}`)
  }
}

/**
 * Generic Microsoft Graph send (drop-in for the old SES sendEmail shape).
 * Sends from MAIL_SENDER (or the ticket sender) via /users/{sender}/sendMail.
 */
export async function sendGraphEmail(opts: {
  to: string[]
  cc?: string[]
  subject: string
  html: string
  text?: string
  from?: string
}): Promise<void> {
  const token = await getMailGraphToken()
  // General platform mail (user invites, visa reports, permits, ShipSync POD, etc.)
  // sends from polaris@jlsyachts.com unless the caller picks a sender — e.g. Anchor
  // passes anchor@jlsyachts.com. Service Desk keeps its own itsupport@ identity.
  const sender = opts.from ?? (process.env.MAIL_SENDER as string | undefined) ?? 'polaris@jlsyachts.com'

  const message: any = {
    subject: opts.subject,
    body: { contentType: 'HTML', content: opts.html },
    toRecipients: opts.to.filter(Boolean).map((a) => ({ emailAddress: { address: a } })),
  }
  if (opts.cc?.length) message.ccRecipients = opts.cc.filter(Boolean).map((a) => ({ emailAddress: { address: a } }))

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  })
  if (res.status !== 202 && !res.ok) {
    throw new Error(`Graph sendMail ${res.status}: ${(await res.text()).slice(0, 240)}`)
  }
}

// ── Branded email shell + ticket templates ────────────────────────────────────

function shell(content: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f4f6f8;margin:0;padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:28px 16px;"><tr><td align="center">
    <table width="100%" style="max-width:560px;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e4e8ec;">
      <tr><td style="background:#0d1b2a;padding:18px 26px;">
        <span style="color:#fff;font-size:16px;font-weight:700;letter-spacing:-0.2px;">JLS Yachts — IT Support</span>
      </td></tr>
      <tr><td style="padding:26px;">${content}</td></tr>
      <tr><td style="padding:14px 26px;border-top:1px solid #f0f0f0;background:#fafafa;">
        <p style="margin:0;font-size:11px;color:#8c97a3;line-height:1.5;">
          Sent by JLS Yachts IT Support. Reply to this email to add to your ticket.
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`
}
const h = (t: string) => `<h1 style="margin:0 0 10px;font-size:19px;font-weight:700;color:#111;">${t}</h1>`
const p = (t: string) => `<p style="margin:10px 0;font-size:14px;color:#333;line-height:1.6;">${t}</p>`
const meta = (rows: [string, string][]) =>
  `<table style="margin:14px 0;font-size:13px;color:#333;">${rows.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#7a828a;">${k}</td><td style="padding:3px 0;font-weight:600;">${v}</td></tr>`).join('')}</table>`
const quote = (t: string) =>
  `<div style="margin:12px 0;padding:12px 14px;background:#f6f8fa;border-left:3px solid #0d6efd;border-radius:6px;font-size:13px;color:#333;white-space:pre-wrap;">${t}</div>`

const esc = (s: string) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function ticketCreatedEmail(t: { ticket_no: string; subject: string; name: string; vessel?: string; description?: string }) {
  return {
    subject: `[${t.ticket_no}] We've received your request: ${t.subject}`,
    html: shell(
      `${h('Your request has been logged')}
       ${p(`Hi ${esc(t.name)},`)}
       ${p(`Thanks — we've logged your support request and the team will be in touch. Your reference is <strong>${t.ticket_no}</strong>.`)}
       ${meta([['Reference', t.ticket_no], ['Subject', esc(t.subject)], ...(t.vessel ? [['Vessel', esc(t.vessel)] as [string, string]] : [])])}
       ${t.description ? quote(esc(t.description)) : ''}
       ${p(`We'll email you any updates. You can reply to this email to add information to your ticket.`)}`,
    ),
  }
}

export function ticketReplyEmail(t: { ticket_no: string; subject: string; name: string; message: string }) {
  return {
    subject: `[${t.ticket_no}] Update on your request: ${t.subject}`,
    html: shell(
      `${h('There’s an update on your ticket')}
       ${p(`Hi ${esc(t.name)},`)}
       ${p(`The IT support team has added an update to ticket <strong>${t.ticket_no}</strong>:`)}
       ${quote(esc(t.message))}
       ${p(`Reply to this email if you need anything further.`)}`,
    ),
  }
}

export function ticketResolvedEmail(t: { ticket_no: string; subject: string; name: string; resolution?: string }) {
  return {
    subject: `[${t.ticket_no}] Your request has been resolved: ${t.subject}`,
    html: shell(
      `${h('Your ticket has been resolved')}
       ${p(`Hi ${esc(t.name)},`)}
       ${p(`Good news — ticket <strong>${t.ticket_no}</strong> has been marked resolved.`)}
       ${t.resolution ? quote(esc(t.resolution)) : ''}
       ${p(`If the issue isn't fully resolved, just reply to this email and we'll reopen it.`)}`,
    ),
  }
}

/** 90-day renewal-quotation prompt for internal services & subscriptions. */
export function serviceRenewalEmail(items: { name: string; vendor?: string | null; renewal_date?: string | null; days?: number | null; seats?: number | null; owner?: string | null }[]) {
  const rows = items.map(i => {
    const due = i.renewal_date ? new Date(i.renewal_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
    const left = i.days != null ? `${i.days} day${i.days === 1 ? '' : 's'}` : '—'
    return `<tr>
      <td style="padding:6px 12px 6px 0;font-weight:600;">${esc(i.name)}</td>
      <td style="padding:6px 12px 6px 0;color:#555;">${esc(i.vendor ?? '—')}</td>
      <td style="padding:6px 12px 6px 0;color:#555;">${due}</td>
      <td style="padding:6px 0;color:#b45309;font-weight:600;">${left}</td>
    </tr>`
  }).join('')
  const n = items.length
  return {
    subject: `Renewal due (90 days): ${n} internal service${n === 1 ? '' : 's'} need a quotation`,
    html: shell(
      `${h('Renewal quotation required')}
       ${p(`The following internal service${n === 1 ? ' is' : 's are'} within <strong>90 days</strong> of renewal. Please <strong>seek a quotation from the vendor</strong> and <strong>begin prepping the quotation for the Yacht</strong>.`)}
       <table style="margin:14px 0;font-size:13px;color:#333;width:100%;">
         <tr style="text-align:left;color:#7a828a;font-size:11px;text-transform:uppercase;letter-spacing:.04em;">
           <td style="padding:0 12px 6px 0;">Service</td><td style="padding:0 12px 6px 0;">Vendor</td><td style="padding:0 12px 6px 0;">Renews</td><td style="padding:0 0 6px;">In</td>
         </tr>
         ${rows}
       </table>
       ${p(`Open <strong>Yacht IT Solutions → Internal Services &amp; Subscriptions</strong> in Polaris to action these.`)}`,
    ),
  }
}

export function ticketStaffNotifyEmail(t: { ticket_no: string; subject: string; name: string; vessel?: string; description?: string; priority?: string }) {
  return {
    subject: `New ticket ${t.ticket_no}: ${t.subject}`,
    html: shell(
      `${h('New support ticket')}
       ${meta([['Reference', t.ticket_no], ['From', esc(t.name)], ['Priority', esc(t.priority ?? 'normal')], ...(t.vessel ? [['Vessel', esc(t.vessel)] as [string, string]] : [])])}
       ${p(`<strong>${esc(t.subject)}</strong>`)}
       ${t.description ? quote(esc(t.description)) : ''}`,
    ),
  }
}
