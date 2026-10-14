/**
 * Bunkering enquiries — the emails to the Agency team. A new enquiry, a move to another status, the vessel's approval, the delivery
 * and any comment are emailed to the Agency team and the person who logged the enquiry (never to the person who just did it), so
 * follow-ups don't depend on someone remembering to look. Recipients and wording are plain functions so they can be tested.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendEmail } from '@/lib/ses.server'
import { appBaseUrl } from '@/lib/app-url.server'
import { STATUS_LABEL, unitLabel, type EnquiryStatus } from '@/lib/bunkering/model'

const db = () => supabaseAdmin as any

/** The Port Operations & Agency team's mailbox. Repoint it with BUNKERING_NOTIFY_EMAIL (comma-separate several). */
const agencyTo = () => (((process.env as any).BUNKERING_NOTIFY_EMAIL as string | undefined) ?? 'h.ackermann@jlsyachts.com').split(',').map((s) => s.trim()).filter(Boolean)

export type BunkeringEmailEvent = 'created' | 'status' | 'approved' | 'delivered' | 'comment'

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const day = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

/** The Agency team and the person who logged it hear about everything, except the person who just did it. */
export function bunkeringRecipients(creatorEmail: string | null | undefined, actorEmail: string | null | undefined, agency = agencyTo()) {
  const seen = new Set<string>()
  const all: string[] = []
  for (const a of [...agency, creatorEmail ?? '']) {
    const t = a.trim()
    if (!t || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    all.push(t)
  }
  const actor = (actorEmail ?? '').trim().toLowerCase()
  const others = all.filter((a) => a.toLowerCase() !== actor)
  return { to: others.slice(0, 1), cc: others.slice(1) }
}

export interface BunkeringEmailData {
  enquiry: {
    number: string; status: EnquiryStatus; yacht_name: string; port: string | null; berth: string | null; preferred_date: string | null; preferred_time: string | null
    fuel_type: string | null; fuel_other: string | null; quantity: number | null; quantity_unit: string | null
    declared_by_name: string | null; declared_by_role: string | null; created_by_name: string | null
    approved_by_name: string | null; approved_by_role: string | null; approval_method: string | null
    delivered_date: string | null; delivered_quantity: number | null; delivered_unit: string | null; bdn_number: string | null
  }
  quotes: Array<{ supplier: string; status: string; quantity: number | null; quantity_unit: string | null; unit_price: number | null; price_unit: string | null; currency: string; total: number | null }>
}

export function buildBunkeringEmail(event: BunkeringEmailEvent, d: BunkeringEmailData, note: string | undefined, actorName: string, openUrl: string) {
  const e = d.enquiry
  const fuel = e.fuel_type === 'Other' ? e.fuel_other : e.fuel_type
  const what = `${fuel ?? 'fuel'}, ${e.quantity ?? '?'} ${unitLabel(e.quantity_unit)}`
  const verb: Record<BunkeringEmailEvent, string> = {
    created: 'New bunkering enquiry', status: `Bunkering enquiry ${STATUS_LABEL[e.status].toLowerCase()}`, approved: 'Bunkering quotation approved',
    delivered: 'Bunkering delivered', comment: 'Comment on bunkering enquiry',
  }
  const subject = `${verb[event]} — ${e.number} — ${e.yacht_name}`
  const who = esc(actorName || e.created_by_name || 'Someone')
  const lead =
    event === 'created' ? `${who} logged a bunkering enquiry for <strong>${esc(e.yacht_name)}</strong>.`
    : event === 'status' ? `${who} moved it to <strong>${esc(STATUS_LABEL[e.status])}</strong>.${note ? ` Note: <em>${esc(note)}</em>` : ''}`
    : event === 'approved' ? `${who} recorded the vessel's approval — <strong>${esc(e.approved_by_name)}</strong> (${esc(e.approved_by_role)}) via ${esc(e.approval_method)}.`
    : event === 'delivered' ? `${who} recorded the delivery: <strong>${esc(e.delivered_quantity)} ${esc(unitLabel(e.delivered_unit))}</strong> on ${esc(day(e.delivered_date))}${e.bdn_number ? ` (BDN ${esc(e.bdn_number)})` : ''}.`
    : `${who} wrote: <em>${esc(note)}</em>`

  const facts: Array<[string, string]> = [
    ['Enquiry', `${e.number} · ${STATUS_LABEL[e.status]}`], ['Yacht', e.yacht_name], ['Fuel and quantity', what],
    ['Port / berth', [e.port, e.berth].filter(Boolean).join(' — ') || '—'],
    ['Preferred', `${day(e.preferred_date)}${e.preferred_time ? ` at ${e.preferred_time.slice(0, 5)}` : ''}`],
    ['Vessel confirmation', e.declared_by_name ? `${e.declared_by_name} (${e.declared_by_role})` : 'Not yet confirmed'],
  ]
  const rows = facts.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#7a828a;font-size:13px;white-space:nowrap">${esc(k)}</td><td style="padding:3px 0;font-size:14px">${esc(v)}</td></tr>`).join('')
  const quoteRows = d.quotes.map((q) => `<tr><td style="padding:3px 12px 3px 0;font-size:14px">${esc(q.supplier)}</td><td style="padding:3px 12px 3px 0;font-size:14px">${esc(q.quantity ?? '')} ${esc(q.quantity_unit ?? '')}</td><td style="padding:3px 12px 3px 0;font-size:14px">${q.unit_price == null ? '' : `${esc(q.currency)} ${esc(q.unit_price)} ${esc(q.price_unit ?? '')}`}</td><td style="padding:3px 0;font-size:14px;color:#555">${esc(q.status)}</td></tr>`).join('')

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f4f6f8;margin:0;padding:24px">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table width="100%" style="max-width:600px;background:#fff;border-radius:10px;border:1px solid #e4e8ec;overflow:hidden">
      <tr><td style="background:#0d1520;padding:14px 24px;color:#fff;font-size:16px;font-weight:700">JLS Yachts — Bunkering</td></tr>
      <tr><td style="padding:22px 24px">
        <h1 style="margin:0 0 12px;font-size:18px;color:#0d1520">${esc(verb[event])} — ${esc(e.number)}</h1>
        <p style="margin:0 0 12px;font-size:14px;color:#333">${lead}</p>
        <table style="margin:6px 0 14px">${rows}</table>
        ${quoteRows ? `<div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:#7a828a;margin:6px 0 4px">QUOTATIONS</div><table style="margin:0 0 14px">${quoteRows}</table>` : ''}
        <p style="margin:16px 0 4px"><a href="${esc(openUrl)}" style="display:inline-block;background:#0d6efd;color:#fff;text-decoration:none;padding:9px 16px;border-radius:7px;font-size:13px">Open ${esc(e.number)} in Polaris</a></p>
      </td></tr>
    </table></td></tr></table></body></html>`
  const text = [`${verb[event]} — ${e.number} — ${e.yacht_name}`, ...(note ? [`Note: ${note}`] : []), ...facts.map(([k, v]) => `${k}: ${v}`), `Open in Polaris: ${openUrl}`].join('\n')
  return { subject, html, text }
}

/** Send the email for something that just happened on an enquiry (the caller has already been checked). */
export async function sendBunkeringNotification(
  enquiryId: string, event: BunkeringEmailEvent, note: string | undefined, actor: { email: string | null; name: string },
): Promise<{ to: string[]; cc: string[] }> {
  const { data: enquiry } = await db().from('bunker_enquiries').select('*').eq('id', enquiryId).maybeSingle()
  if (!enquiry) throw new Error('Enquiry not found')
  const { data: quotes } = await db().from('bunker_quotes').select('supplier, status, quantity, quantity_unit, unit_price, price_unit, currency, total').eq('enquiry_id', enquiryId).order('created_at')
  let creatorEmail: string | null = null
  if (enquiry.created_by) {
    const { data: p } = await db().from('user_profiles').select('email').eq('user_id', enquiry.created_by).maybeSingle()
    creatorEmail = p?.email ?? null
  }
  const to = bunkeringRecipients(creatorEmail, actor.email)
  if (to.to.length === 0) return { to: [], cc: [] }
  const mail = buildBunkeringEmail(event, { enquiry, quotes: quotes ?? [] }, note, actor.name, `${appBaseUrl()}/bunkering?open=${encodeURIComponent(enquiry.number)}`)
  await sendEmail({ to: to.to, cc: to.cc, subject: mail.subject, html: mail.html, text: mail.text })
  return to
}
