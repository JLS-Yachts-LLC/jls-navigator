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

export function renderPermitEmail(input: PermitEmailInput, template?: { subject: string; body: string } | null): {
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
         Please find below the details of your ${esc(label)}${p.document_url ? ', with the approved permit attached' : ''}.
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
      <div style="font-size:17px;font-weight:600;letter-spacing:.2px">JLS Yachts</div>
      <div style="font-size:12.5px;opacity:.8;margin-top:2px">${esc(label)}</div>
    </div>
    <div style="background:#fff;padding:20px;border:1px solid #dfe5ea;border-top:none;border-radius:0 0 8px 8px">
      ${intro}
      <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13.5px">${rows}</table>
      ${remarks ? `<p style="margin:0 0 12px;line-height:1.55"><strong>Remarks:</strong> ${esc(remarks)}</p>` : ''}
      ${p.document_url
        ? `<p style="margin:16px 0 0;font-size:13px;color:#4a5b68">The approved permit is attached to this email.</p>`
        : ''}
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
}> {
  const sb = admin() as any
  const { data: permit, error } = await sb
    .from('permits')
    .select('*, yachts(vessel_name)')
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
  }
}
