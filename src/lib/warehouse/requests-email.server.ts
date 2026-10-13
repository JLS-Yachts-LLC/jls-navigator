/**
 * Warehouse requests — the emails. Every request is sent to the Warehouse with Logistics copied (and the person who raised it),
 * and what happens afterwards (a status change, a comment, a change to the request) goes to the same people, so nobody has to be
 * chased. The wording and the recipients are built by plain functions so they can be tested without a mailbox.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendEmail } from '@/lib/ses.server'
import { appBaseUrl } from '@/lib/app-url.server'
import { linkForEmail } from '@/lib/shipsync/automations.server'
import { TYPE_LABEL, STATUS_LABEL, type RequestStatus, type RequestType } from '@/lib/warehouse/requests-model'

const db = () => supabaseAdmin as any

/** Who receives warehouse requests. Both can be repointed with an environment variable. */
const warehouseTo = () => ((process.env as any).WAREHOUSE_REQUESTS_EMAIL as string | undefined) ?? 'j.gonzaga@jlsyachts.com'
const logisticsCc = () => ((process.env as any).SHIPSYNC_LOGISTICS_EMAIL as string | undefined) ?? 'logistics@jlsyachts.com'

export type RequestEmailEvent = 'submitted' | 'status' | 'comment' | 'amended'

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Dubai time, the way the team reads it: "14 Oct 2026, 09:30". */
export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * Warehouse, Logistics and the requester all hear about everything, except the person who just did it (they know).
 * The first remaining address is the "to"; the rest are copied. Duplicates are removed, case-insensitively.
 */
export function requestRecipients(requesterEmail: string | null | undefined, actorEmail: string | null | undefined, warehouse = warehouseTo(), logistics = logisticsCc()) {
  const seen = new Set<string>()
  const all: string[] = []
  for (const a of [warehouse, logistics, requesterEmail ?? '']) {
    const t = a.trim()
    if (!t || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    all.push(t)
  }
  const actor = (actorEmail ?? '').trim().toLowerCase()
  const others = all.filter((a) => a.toLowerCase() !== actor)
  // A new or changed request is addressed to the Warehouse; an update is addressed to whoever it is news for.
  return { to: others.slice(0, 1), cc: others.slice(1) }
}

export interface RequestEmailData {
  request: {
    number: string; type: RequestType; status: RequestStatus; department?: string | null; requester_name?: string | null
    yacht?: string | null; reference?: string | null; eta?: string | null; required_at?: string | null
    destination?: string | null; berth?: string | null; recipient_name?: string | null; recipient_phone?: string | null; recipient_email?: string | null
    urgent: boolean; urgent_reason?: string | null; deadline?: string | null; notes?: string | null; hold_reason?: string | null
  }
  lines: Array<{ description: string; quantity: number | null; unit: string | null; oversized: boolean; length_cm: number | null; width_cm: number | null; height_cm: number | null; weight_kg: number | null }>
  files: Array<{ name: string; doc_type: string | null; link: string }>
}

export function buildRequestEmail(event: RequestEmailEvent, d: RequestEmailData, note: string | undefined, actorName: string, openUrl: string) {
  const r = d.request
  const kind = TYPE_LABEL[r.type]
  const who = esc(actorName || r.requester_name || 'Someone')
  const heading =
    event === 'submitted' ? `New ${kind.toLowerCase()} — ${esc(r.number)}`
    : event === 'amended' ? `Request changed — ${esc(r.number)}`
    : event === 'status' ? `${esc(r.number)} is now ${esc(STATUS_LABEL[r.status]).toLowerCase()}`
    : `New comment on ${esc(r.number)}`
  const subject =
    `${r.urgent ? 'URGENT — ' : ''}${event === 'submitted' ? kind : event === 'amended' ? `${kind} changed` : event === 'status' ? `${kind} ${STATUS_LABEL[r.status].toLowerCase()}` : `${kind} comment`}` +
    ` — ${r.number}${r.yacht ? ` (${r.yacht})` : ''}`

  const facts: Array<[string, string]> = [['Request', `${r.number} · ${kind}`], ['Status', STATUS_LABEL[r.status]]]
  if (r.requester_name) facts.push(['Raised by', `${r.requester_name}${r.department ? ` (${r.department})` : ''}`])
  if (r.yacht) facts.push([r.type === 'incoming' ? 'Yacht / project' : 'Yacht', r.yacht])
  if (r.reference) facts.push([r.type === 'incoming' ? 'Delivery order / reference' : 'AWB / shipment reference', r.reference])
  if (r.type === 'incoming') facts.push(['Expected arrival', fmtWhen(r.eta)])
  else facts.push([r.type === 'dispatch' ? 'Required delivery' : 'Needed by', fmtWhen(r.required_at)])
  if (r.type === 'dispatch') {
    facts.push(['Destination', [r.destination, r.berth].filter(Boolean).join(' — ') || '—'])
    facts.push(['Recipient', [r.recipient_name, r.recipient_phone, r.recipient_email].filter(Boolean).join(' · ') || '—'])
  }
  if (r.status === 'on_hold' && r.hold_reason) facts.push(['On hold because', r.hold_reason])

  const factRows = facts.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#7a828a;font-size:13px;white-space:nowrap">${esc(k)}</td><td style="padding:3px 0;font-size:14px;color:#0d1520">${esc(v)}</td></tr>`).join('')
  const dims = (l: RequestEmailData['lines'][number]) => l.oversized
    ? ` — ${l.length_cm ?? '?'} × ${l.width_cm ?? '?'} × ${l.height_cm ?? '?'} cm, ${l.weight_kg ?? '?'} kg`
    : ''
  const lineRows = d.lines.map((l, i) =>
    `<tr><td style="padding:4px 10px 4px 0;color:#7a828a;font-size:13px">${i + 1}</td><td style="padding:4px 10px 4px 0;font-size:14px">${esc(l.description)}${l.oversized ? `<span style="color:#b45309;font-size:12px">${esc(dims(l))}</span>` : ''}</td><td style="padding:4px 0;font-size:14px;white-space:nowrap">${esc(l.quantity ?? '')} ${esc(l.unit ?? '')}</td></tr>`).join('')
  const fileRows = d.files.map((f) =>
    `<li style="margin:2px 0;font-size:14px"><a href="${esc(f.link)}" style="color:#0d6efd">${esc(f.name)}</a>${f.doc_type ? ` <span style="color:#7a828a;font-size:12px">(${esc(f.doc_type)})</span>` : ''}</li>`).join('')

  const urgent = r.urgent
    ? `<div style="margin:0 0 14px;padding:10px 12px;border-radius:7px;background:#fdecec;border:1px solid #f3b4b4;color:#8a1f1f;font-size:14px"><strong>URGENT</strong> — ${esc(r.urgent_reason ?? '')}${r.deadline ? `<br>Deadline: <strong>${esc(fmtWhen(r.deadline))}</strong>` : ''}</div>`
    : ''
  const what =
    event === 'submitted' ? `<p style="margin:0 0 12px;font-size:14px;color:#333">${who} has raised a ${esc(kind.toLowerCase())}.</p>`
    : event === 'amended' ? `<p style="margin:0 0 12px;font-size:14px;color:#333">${who} changed this request. Reason given: <em>${esc(note ?? '')}</em></p>`
    : event === 'status' ? `<p style="margin:0 0 12px;font-size:14px;color:#333">${who} set it to <strong>${esc(STATUS_LABEL[r.status])}</strong>.${note ? ` Note: <em>${esc(note)}</em>` : ''}</p>`
    : `<p style="margin:0 0 12px;font-size:14px;color:#333">${who} wrote:</p><blockquote style="margin:0 0 12px;padding:8px 12px;border-left:3px solid #d0d6dc;color:#333;font-size:14px">${esc(note ?? '')}</blockquote>`

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f4f6f8;margin:0;padding:24px">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table width="100%" style="max-width:600px;background:#fff;border-radius:10px;border:1px solid #e4e8ec;overflow:hidden">
      <tr><td style="background:#0d1520;padding:14px 24px;color:#fff;font-size:16px;font-weight:700">JLS Yachts — Warehouse request</td></tr>
      <tr><td style="padding:22px 24px">
        <h1 style="margin:0 0 12px;font-size:18px;color:#0d1520">${heading}</h1>
        ${urgent}${what}
        <table style="margin:6px 0 14px">${factRows}</table>
        <div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#7a828a;margin:6px 0 4px">ITEMS</div>
        <table style="margin:0 0 14px">${lineRows}</table>
        ${r.notes ? `<div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#7a828a;margin:6px 0 4px">NOTES</div><p style="margin:0 0 14px;font-size:14px;color:#333;white-space:pre-wrap">${esc(r.notes)}</p>` : ''}
        ${fileRows ? `<div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#7a828a;margin:6px 0 4px">DOCUMENTS AND PHOTOS</div><ul style="margin:0 0 14px;padding-left:18px">${fileRows}</ul>` : ''}
        <p style="margin:16px 0 4px"><a href="${esc(openUrl)}" style="display:inline-block;background:#0d6efd;color:#fff;text-decoration:none;padding:9px 16px;border-radius:7px;font-size:13px">Open ${esc(r.number)} in Polaris</a></p>
        <p style="margin:12px 0 0;font-size:12px;color:#7a828a">JLS Yachts Logistics — reply in Polaris so everyone sees the same instruction.</p>
      </td></tr>
    </table></td></tr></table></body></html>`

  const text = [
    `${r.urgent ? 'URGENT — ' : ''}${kind} ${r.number}${r.yacht ? ` (${r.yacht})` : ''} — ${event}`,
    ...(note ? [`Note: ${note}`] : []),
    ...facts.map(([k, v]) => `${k}: ${v}`),
    'Items:', ...d.lines.map((l, i) => `  ${i + 1}. ${l.description} — ${l.quantity ?? ''} ${l.unit ?? ''}${dims(l)}`),
    ...(d.files.length ? ['Files:', ...d.files.map((f) => `  ${f.name}: ${f.link}`)] : []),
    `Open in Polaris: ${openUrl}`,
  ].join('\n')

  return { subject, html, text }
}

/**
 * Send the email for something that just happened on a request. The caller has already been checked; this only loads
 * the request and sends. Returns who it went to.
 */
export async function sendRequestNotification(
  requestId: string, event: RequestEmailEvent, note: string | undefined, actor: { email: string | null; name: string },
): Promise<{ to: string[]; cc: string[] }> {
  const { data: req } = await db().from('warehouse_requests').select('*').eq('id', requestId).maybeSingle()
  if (!req) throw new Error('Request not found')
  const [{ data: lines }, { data: files }] = await Promise.all([
    db().from('warehouse_request_lines').select('*').eq('request_id', requestId).order('position'),
    db().from('warehouse_request_files').select('*').eq('request_id', requestId).order('created_at'),
  ])
  const links = []
  for (const f of (files ?? []) as Array<{ name: string; doc_type: string | null; url: string }>) {
    try { links.push({ name: f.name, doc_type: f.doc_type, link: await linkForEmail(f.url) }) } catch { /* a file that can't be linked is left out of the email, not fatal */ }
  }
  const to = requestRecipients(req.requester_email, actor.email)
  if (to.to.length === 0) return { to: [], cc: [] }
  const mail = buildRequestEmail(event, { request: req, lines: lines ?? [], files: links }, note, actor.name, `${appBaseUrl()}/warehouse-requests?open=${encodeURIComponent(req.number)}`)
  await sendEmail({ to: to.to, cc: to.cc, subject: mail.subject, html: mail.html, text: mail.text })
  return to
}
