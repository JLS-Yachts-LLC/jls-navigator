/**
 * Permit emails — rendering and sending, from the app rather than Outlook.
 *
 * The subject and body come from `email_templates` for the permit type when one
 * exists (so staff can edit the wording under Settings → Email Templates), and
 * fall back to a built-in default written in the same house style. Either way the
 * text is wrapped in the JLS branded shell used by the rest of Polaris' mail, and
 * the permit's own details are rendered as a table rather than pasted as a wall
 * of plain text.
 *
 * Sending goes through sendGraphEmailWithAttachments, so the outbound mail guard
 * applies: while client email is switched off the send is refused loudly and
 * logged as 'blocked' — never silently dropped.
 */
import { emailBrandLockup } from "@/lib/email/brand-mark";
import { createClient } from '@supabase/supabase-js'

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

export const PERMIT_LABELS: Record<string, string> = {
  cruising_mothership: 'Cruising Permit — Mothership',
  cruising_tenders: 'Cruising Permit — Tenders & Appurtenances',
  dma: 'DMA Permit',
  navigation_license: 'Navigation Licence',
  sanitation: 'Sanitation Certificate',
  tdra: 'TDRA Permit',
  exit_entry: 'Exit & Entry Permit',
  gate_pass: 'Gate Pass',
  permit_to_work: 'Permit to Work',
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** dd/mm/yyyy — how the UAE authorities and the team write dates. */
function fmtDate(d: unknown): string {
  const s = String(d ?? '').trim()
  if (!s) return '—'
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : s
}

export type PermitEmailInput = {
  permit: Record<string, any>
  vesselName: string
}

/** The rows shown in the details table — blank fields are left out entirely. */
function detailRows(p: Record<string, any>, vesselName: string): Array<[string, string]> {
  const rows: Array<[string, string | null | undefined]> = [
    ['Vessel', vesselName],
    ['Permit type', PERMIT_LABELS[p.permit_type] ?? p.permit_type],
    ['Permit number', p.permit_number],
    ['Issuing authority', p.issuing_authority],
    ['Date applied', p.issue_date ? fmtDate(p.issue_date) : null],
    ['Expiry date', p.expiry_date ? fmtDate(p.expiry_date) : null],
    ['21-day extension', p.extension_status],
    ['Applied by', p.applied_by],
    ['Requested by', p.requested_by],
    ['Licence no.', p.license_no],
    // preferred_inspection_date is reused per permit type: on a sanitation
    // certificate it really is the requested inspection date, everywhere else it
    // holds the date the authority actually issued the permit.
    [
      p.permit_type === 'sanitation' ? 'Preferred inspection date' : 'Issue date',
      p.preferred_inspection_date ? fmtDate(p.preferred_inspection_date) : null,
    ],
    ['JLS quotation no.', p.jls_quotation_number],
  ]
  return rows
    .filter(([, v]) => v != null && String(v).trim() !== '' && String(v) !== 'None')
    .map(([k, v]) => [k, String(v)])
}

/** Turn the stored template's plain text into paragraphs, keeping any HTML. */
function bodyToHtml(text: string): string {
  const looksLikeHtml = /<\/?(table|p|div|br|ul|ol|strong|em)\b/i.test(text)
  if (looksLikeHtml) return text
  return text.split(/\n{2,}/).map(par =>
    `<p style="margin:0 0 12px;line-height:1.55">${esc(par).replace(/\n/g, '<br>')}</p>`,
  ).join('')
}

const BRAND = '#0f2a3d'

/**
 * @param documentBlock the secure-link button, pre-rendered by the caller (it
 *   owns the share and its expiry). Null when the permit has no document, in
 *   which case the email simply doesn't mention one.
 */
export function renderPermitEmail(
  input: PermitEmailInput,
  template?: { subject: string; body: string } | null,
  documentBlock?: string | null,
): {
  subject: string
  html: string
} {
  const { permit: p, vesselName } = input
  const label = PERMIT_LABELS[p.permit_type] ?? 'Permit'
  const holder = String(p.holder_name ?? '').trim()

  const fill = (s: string) => s
    .replace(/\{\{boat_name\}\}/g, vesselName)
    .replace(/\{\{holder_name\}\}/g, holder || 'Client')
    .replace(/\{\{expiry_date\}\}/g, fmtDate(p.expiry_date))
    .replace(/\{\{issue_date\}\}/g, fmtDate(p.issue_date))
    .replace(/\{\{authority\}\}/g, String(p.issuing_authority ?? '—'))
    .replace(/\{\{applied_by\}\}/g, String(p.applied_by ?? '—'))
    .replace(/\{\{permit_number\}\}/g, String(p.permit_number ?? '—'))
    .replace(/\{\{quotation_number\}\}/g, String(p.jls_quotation_number ?? '—'))
    .replace(/\{\{notes\}\}/g, String(p.remarks ?? p.notes ?? ''))

  const subject = template?.subject
    ? fill(template.subject)
    : `${vesselName} — ${label}`

  const intro = template?.body
    ? bodyToHtml(fill(template.body))
    : `<p style="margin:0 0 12px;line-height:1.55">Dear ${esc(holder || 'Client')},</p>
       <p style="margin:0 0 12px;line-height:1.55">Greetings from JLS Yachts!</p>
       <p style="margin:0 0 12px;line-height:1.55">
         Please find below the details of your ${esc(label)}${documentBlock ? ', and a secure link to the approved permit' : ''}.
       </p>`

  const rows = detailRows(p, vesselName).map(([k, v]) => `
    <tr>
      <td style="padding:8px 12px;border:1px solid #dfe5ea;background:#f6f8fa;font-weight:600;width:42%">${esc(k)}</td>
      <td style="padding:8px 12px;border:1px solid #dfe5ea">${esc(v)}</td>
    </tr>`).join('')

  const remarks = String(p.remarks ?? '').trim()

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#eef2f5">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1d2b36;font-size:14px">
    <div style="background:${BRAND};color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
      ${emailBrandLockup(`<div style="font-size:17px;font-weight:600;letter-spacing:.2px;color:#fff">JLS Yachts</div>
      <div style="font-size:12.5px;opacity:.8;margin-top:2px;color:#fff">${esc(label)}</div>`, 34)}
    </div>
    <div style="background:#fff;padding:20px;border:1px solid #dfe5ea;border-top:none;border-radius:0 0 8px 8px">
      ${intro}
      <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13.5px">${rows}</table>
      ${remarks ? `<p style="margin:0 0 12px;line-height:1.55"><strong>Remarks:</strong> ${esc(remarks)}</p>` : ''}
      ${documentBlock ?? ''}
      <p style="margin:18px 0 0;line-height:1.55">Best regards,<br><strong>JLS Yachts</strong></p>
    </div>
    <div style="text-align:center;color:#7d8b96;font-size:11.5px;padding:14px 8px">
      Sent by JLS Yachts · Port &amp; Operations
    </div>
  </div>
</body></html>`

  return { subject, html }
}

/** Load the permit, its vessel name and any stored template for its type. */
export async function loadPermitForEmail(permitId: string): Promise<{
  permit: Record<string, any>
  vesselName: string
  template: { subject: string; body: string } | null
  /** How this client asked to receive documents: 'secure_link' (default) or 'portal'. */
  delivery: 'secure_link' | 'portal'
}> {
  const sb = admin() as any
  const { data: permit, error } = await sb
    .from('permits')
    .select('*, yachts(vessel_name, preferred_document_delivery)')
    .eq('id', permitId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!permit) throw new Error('Permit not found')

  const { data: tmpl } = await sb
    .from('email_templates')
    .select('subject, body')
    .eq('permit_type', permit.permit_type)
    .limit(1)
    .maybeSingle()

  return {
    permit,
    vesselName: permit.yachts?.vessel_name ?? permit.vessel_name ?? '—',
    template: tmpl ?? null,
    delivery: permit.yachts?.preferred_document_delivery === 'portal' ? 'portal' : 'secure_link',
  }
}

/** One row of a batch email — the permit and its document block, if any. */
export type PermitBatchItem = {
  permit: Record<string, any>
  /** Pre-rendered secure link (or a placeholder for a preview); null when none. */
  documentLink?: { url: string } | null
}

/**
 * Several permits of one type for one vessel in a single email (SD-0081): the
 * vessel gets one message listing every pass instead of one email each. Each
 * permit with a document gets its own secure link in its row.
 *
 * @param delivery 'portal' replaces the per-row links with one pointer to the portal.
 */
export function renderPermitBatchEmail(opts: {
  items: PermitBatchItem[]
  vesselName: string
  delivery: 'secure_link' | 'portal'
  linkExpiresAt?: string | null
}): { subject: string; html: string } {
  const { items, vesselName, delivery } = opts
  const type = items[0]?.permit.permit_type
  const label = PERMIT_LABELS[type] ?? 'Permit'
  const plural = type === 'gate_pass' ? 'Gate Passes' : `${label}s`
  const n = items.length
  const isGatePass = type === 'gate_pass'
  const anyDocument = items.some(i => i.permit.document_url)

  const subject = `${vesselName} — ${n} ${n === 1 ? label : plural}`

  const th = (s: string) =>
    `<th style="padding:8px 10px;border:1px solid #dfe5ea;background:#f6f8fa;text-align:left;font-weight:600">${esc(s)}</th>`
  const td = (s: string) => `<td style="padding:8px 10px;border:1px solid #dfe5ea;vertical-align:top">${s}</td>`

  const head = [
    isGatePass ? 'Visitor' : 'Holder',
    isGatePass ? 'Pass no.' : 'Permit no.',
    isGatePass ? 'Access zone / gate' : 'Authority',
    isGatePass ? 'Entry' : 'Issued',
    'Expiry',
    ...(anyDocument && delivery === 'secure_link' ? ['Document'] : []),
  ].map(th).join('')

  const rows = items.map(({ permit: p, documentLink }) => {
    const doc = anyDocument && delivery === 'secure_link'
      ? [td(documentLink
          ? `<a href="${esc(documentLink.url)}" style="color:#07435e;font-weight:600;text-decoration:underline">View securely</a>`
          : '<span style="color:#7d8b96">—</span>')]
      : []
    return `<tr>${[
      td(esc(String(p.holder_name ?? '').trim() || '—')),
      td(esc(String(p.permit_number ?? p.license_no ?? '').trim() || '—')),
      td(esc(String(p.issuing_authority ?? '').trim() || '—')),
      td(esc(fmtDate(p.issue_date))),
      td(esc(fmtDate(p.expiry_date))),
      ...doc,
    ].join('')}</tr>`
  }).join('')

  const expiry = opts.linkExpiresAt
    ? new Date(opts.linkExpiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null
  const documentNote = !anyDocument ? ''
    : delivery === 'portal'
      ? `<p style="margin:0 0 12px;line-height:1.55">The documents are filed under <strong>Documents</strong> in your JLS Yachts portal.</p>`
      : `<p style="margin:0 0 12px;line-height:1.55;font-size:12.5px;color:#7d8b96">The document links are for you only${expiry ? ` and expire on ${esc(expiry)}` : ''}. If a link has expired, reply to this email and we will send a new one.</p>`

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#eef2f5">
  <div style="max-width:720px;margin:0 auto;padding:24px 16px;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1d2b36;font-size:14px">
    <div style="background:${BRAND};color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
      ${emailBrandLockup(`<div style="font-size:17px;font-weight:600;letter-spacing:.2px;color:#fff">JLS Yachts</div>
      <div style="font-size:12.5px;opacity:.8;margin-top:2px;color:#fff">${esc(plural)}</div>`, 34)}
    </div>
    <div style="background:#fff;padding:20px;border:1px solid #dfe5ea;border-top:none;border-radius:0 0 8px 8px">
      <p style="margin:0 0 12px;line-height:1.55">Dear ${esc(vesselName)} team,</p>
      <p style="margin:0 0 12px;line-height:1.55">Greetings from JLS Yachts!</p>
      <p style="margin:0 0 12px;line-height:1.55">
        Please find below the details of ${n} ${esc(n === 1 ? label : plural)} for ${esc(vesselName)}${anyDocument && delivery === 'secure_link' ? ', each with a secure link to its document' : ''}.
      </p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13px">
        <thead><tr>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${documentNote}
      <p style="margin:18px 0 0;line-height:1.55">Best regards,<br><strong>JLS Yachts</strong></p>
    </div>
    <div style="text-align:center;color:#7d8b96;font-size:11.5px;padding:14px 8px">
      Sent by JLS Yachts · Port &amp; Operations
    </div>
  </div>
</body></html>`

  return { subject, html }
}

/**
 * Load permits for a batch email. They must all be the same type and belong to
 * the same vessel — the batch is one email to one vessel.
 */
export async function loadPermitsForBatchEmail(permitIds: string[]): Promise<{
  permits: Record<string, any>[]
  vesselName: string
  delivery: 'secure_link' | 'portal'
}> {
  const sb = admin() as any
  const { data, error } = await sb
    .from('permits')
    .select('*, yachts(vessel_name, preferred_document_delivery)')
    .in('id', permitIds)
  if (error) throw new Error(error.message)
  const byId = new Map((data ?? []).map((p: any) => [p.id, p]))
  // Keep the order the sender selected them in.
  const permits = permitIds.map(id => byId.get(id)).filter(Boolean) as Record<string, any>[]
  if (permits.length !== permitIds.length) throw new Error('One or more permits were not found')
  if (new Set(permits.map(p => p.permit_type)).size > 1) throw new Error('Select permits of one type only')
  const yachtIds = new Set(permits.map(p => p.yacht_id ?? null))
  if (yachtIds.has(null)) throw new Error('Every selected permit needs a yacht to send them together')
  if (yachtIds.size > 1) throw new Error('Select permits for one vessel only')
  const y = permits[0].yachts
  return {
    permits,
    vesselName: y?.vessel_name ?? '—',
    delivery: y?.preferred_document_delivery === 'portal' ? 'portal' : 'secure_link',
  }
}
