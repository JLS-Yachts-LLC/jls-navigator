/**
 * POST /api/visa/send-to-vessel — email a crew member's issued visa to the yacht.
 *
 * Body: { visaId, to: string[], cc?: string[], message?: string }
 * The visa itself goes as a secure, expiring link (it is personal data); the UAE
 * Arrival Instructions one-pager is still attached, per the standing requirement
 * that it always accompanies the visa. Sent via the Graph draft flow so the large
 * arrival PDF never trips the sendMail size cap. Records the dispatch on the
 * application (visa_dispatched / _at / _channels).
 */
import { createDocumentShare, documentButtonHtml } from '@/lib/document-share.server'
import { createClient } from '@supabase/supabase-js'
import { sendGraphEmailWithAttachments } from '@/lib/graph-mail.server'
import { visaArrivalAttachment } from '@/lib/visa/arrival-instructions.server'

function getAdmin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function visaSendToVesselHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)
  const auth = request.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, 401)
  const sb = getAdmin()
  const { data: { user } } = await sb.auth.getUser(auth.slice(7))
  if (!user) return json({ ok: false, error: 'Unauthorized' }, 401)

  const body = await request.json().catch(() => ({})) as { visaId?: string; to?: string[]; cc?: string[]; message?: string }
  const to = (body.to ?? []).map((e) => String(e).trim()).filter((e) => /.+@.+\..+/.test(e))
  if (!body.visaId) return json({ ok: false, error: 'visaId required' }, 400)
  if (!to.length) return json({ ok: false, error: 'At least one valid recipient email is required' }, 400)

  const { data: visa } = await sb.from('visa_applications')
    .select('id, given_name, surname, visa_number, visa_expiry, first_entry_expiry, visa_document_url, vessel_name, visa_dispatched_channels, yachts(vessel_name)')
    .eq('id', body.visaId).maybeSingle() as { data: any }
  if (!visa) return json({ ok: false, error: 'Visa application not found' }, 404)
  if (!visa.visa_document_url) return json({ ok: false, error: 'No visa document attached to this application yet' }, 400)

  const crewName = [visa.given_name, visa.surname].filter(Boolean).join(' ') || 'Crew member'
  const vessel = visa.vessel_name ?? visa.yachts?.vessel_name ?? ''

  // The visa itself carries the crew member's personal data, so it travels as a
  // secure, expiring link rather than a copy that lives in the vessel's inbox
  // for ever.
  const ext = (visa.visa_document_url.split('.').pop() ?? 'pdf').split('?')[0].toLowerCase()
  const share = await createDocumentShare({
    storageRef: visa.visa_document_url,
    filename: `UAE Crew Visa - ${crewName}.${ext || 'pdf'}`,
    title: `UAE Crew Visa — ${crewName}`,
    reference: visa.visa_number ? String(visa.visa_number) : null,
    purpose: `The issued UAE crew visa for ${crewName}${vessel ? `, joining ${vessel}` : ''}. Please print a copy for the crew member to carry.`,
    vesselName: vessel || null,
    recipientEmail: to.join(', '),
    sourceTable: 'visa_applications',
    sourceId: visa.id,
    createdBy: user.id,
  })

  // The UAE Arrival Instructions MUST always accompany the visa. It stays a real
  // attachment: it holds no personal data, and the crew member has to have it in
  // hand at the immigration counter — an expiring link is the wrong place for it.
  const arrival = await visaArrivalAttachment()
  const attachments = arrival ? [arrival] : []

  const note = body.message ? `<p>${esc(String(body.message))}</p>` : ''
  try {
    await sendGraphEmailWithAttachments({
      to, cc: body.cc,
      subject: `UAE Crew Visa — ${crewName}${vessel ? ` (${vessel})` : ''}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937">
        <h2 style="margin:0 0 8px;font-size:16px">UAE Crew Visa — ${esc(crewName)}</h2>
        ${vessel ? `<p style="margin:0 0 10px;color:#4b5563">Vessel: <strong>${esc(vessel)}</strong>${visa.visa_number ? ` &nbsp;·&nbsp; Visa ref: <strong>${esc(String(visa.visa_number))}</strong>` : ''}</p>` : ''}
        ${note}
        <p>The issued UAE crew visa is available on the secure link below${visa.first_entry_expiry ? ` — <strong>the crew member must enter the UAE before ${new Date(visa.first_entry_expiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>` : ''}.</p>
        ${documentButtonHtml({
          url: share.url,
          title: `UAE Crew Visa — ${crewName}`,
          reference: visa.visa_number ? String(visa.visa_number) : null,
          purpose: 'Please download and print a copy for the crew member to carry.',
          expiresAt: share.expiresAt,
        })}
        <p><strong>UAE Arrival Instructions</strong> are attached — the crew member must use the manual immigration counters (NOT the e-gates) and carry a printed copy of the visa.</p>
        <p style="color:#94a3b8;font-size:12px;">Sent via Polaris · JLS Yachts</p>
      </div>`,
      attachments,
    })
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? 'Send failed' }, 500)
  }

  // Record the dispatch (audit trail on the application).
  const channels = Array.isArray(visa.visa_dispatched_channels) ? visa.visa_dispatched_channels : []
  await sb.from('visa_applications').update({
    visa_dispatched: true,
    visa_dispatched_at: new Date().toISOString(),
    visa_dispatched_channels: [...channels, { channel: 'email', to, cc: body.cc ?? [], by: user.email ?? user.id, at: new Date().toISOString() }],
    updated_at: new Date().toISOString(),
  } as any).eq('id', visa.id)

  return json({ ok: true, sent: to.length, arrivalAttached: !!arrival, secureLink: true, linkExpiresAt: share.expiresAt })
}
