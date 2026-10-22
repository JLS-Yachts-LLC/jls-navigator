/**
 * Email a Navigation Licence's seaman's cards to the client (SD-0079).
 *
 * The FMA issues a seaman's card to each crew member on the licence and cancels
 * it when they leave; the team sends the client the issued cards, the cancelled
 * cards, or both, in one email. Each card travels as its own secure, expiring
 * link — the issued card, or for a cancelled one its cancellation (falling back
 * to the card itself) — exactly as permit documents do.
 *
 * Logged the same way as a permit send: one yacht_activity_log row against the
 * licence, one audit_log line, and each card stamped as sent.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendGraphEmailWithAttachments } from '@/lib/graph-mail.server'
import { loadPermitForEmail, renderSeamanCardsEmail } from '@/lib/permits/permit-email.server'
import { createDocumentShare, DEFAULT_SHARE_TTL_DAYS } from '@/lib/document-share.server'
import { logAuditEvent } from '@/lib/admin/audit'
import {
  parseEmailList, PermitSendError,
  type PermitAttachment, type PermitSendActor, type PermitBatchResult,
} from '@/lib/permits/send-permit.server'

/** Most cards one email may carry. */
export const MAX_SEAMAN_CARDS = 60

/** The file to send for a card: the cancellation for a cancelled card, else the card. */
function cardFile(card: Record<string, any>): string | null {
  if (card.status === 'cancelled') return card.cancellation_url || card.document_url || null
  return card.document_url || null
}

async function load(permitId: string, cardIds: string[]) {
  const { permit, vesselName, delivery } = await loadPermitForEmail(permitId)
  if (permit.permit_type !== 'navigation_license') throw new PermitSendError("Seaman's cards belong to a Navigation Licence", 400)
  const { data, error } = await (supabaseAdmin as any)
    .from('navigation_license_seaman_cards')
    .select('*')
    .eq('permit_id', permitId)
    .in('id', cardIds)
  if (error) throw new Error(error.message)
  const byId = new Map((data ?? []).map((c: any) => [c.id, c]))
  const cards = cardIds.map(id => byId.get(id)).filter(Boolean) as Record<string, any>[]
  if (cards.length !== cardIds.length) throw new PermitSendError('One or more cards were not found on this licence', 400)
  // Issued first, then cancelled, each in the order they were picked.
  cards.sort((a, b) => Number(a.status === 'cancelled') - Number(b.status === 'cancelled'))
  return { permit, vesselName, delivery, cards }
}

/** What the email would look like, with placeholder links; sends nothing. */
export async function previewSeamanCards(permitId: string, cardIds: string[]) {
  const { permit, vesselName, delivery, cards } = await load(permitId, cardIds)
  const { subject, html } = renderSeamanCardsEmail({
    items: cards.map(card => ({ card, documentLink: cardFile(card) ? { url: '#' } : null })),
    permit, vesselName, delivery,
    linkExpiresAt: new Date(Date.now() + DEFAULT_SHARE_TTL_DAYS * 86400000).toISOString(),
  })
  return {
    subject, html, vesselName, delivery,
    to: parseEmailList(permit.contact_email).join(', '),
    count: cards.length,
    withDocument: cards.filter(cardFile).length,
  }
}

export async function sendSeamanCardsToClient(opts: {
  permitId: string
  cardIds: string[]
  to?: string[]
  cc?: string[]
  extra?: PermitAttachment[]
  actor: PermitSendActor
}): Promise<PermitBatchResult> {
  const { permitId, actor } = opts
  const cc = opts.cc ?? []
  const extra = opts.extra ?? []
  const sb = supabaseAdmin as any

  const { permit, vesselName, delivery, cards } = await load(permitId, opts.cardIds)
  const to = opts.to?.length ? opts.to : parseEmailList(permit.contact_email)
  if (!to.length) throw new PermitSendError('This licence has no client email address.', 400)

  const items = await Promise.all(cards.map(async (card) => {
    const file = cardFile(card)
    const cancelled = card.status === 'cancelled'
    const share = file && delivery === 'secure_link'
      ? await createDocumentShare({
          storageRef: file,
          title: `${cancelled ? 'Cancelled' : 'Issued'} Seaman's Card — ${card.crew_name}`,
          reference: card.card_number ?? null,
          purpose: `${cancelled ? 'The cancelled' : 'The'} seaman's card for ${card.crew_name}, ${vesselName}.`,
          vesselName,
          recipientEmail: to.join(', '),
          sourceTable: 'navigation_license_seaman_cards',
          sourceId: card.id,
          createdBy: actor.id,
        })
      : null
    return { card, share }
  }))
  const linkExpiresAt = items.find(i => i.share)?.share?.expiresAt ?? null
  const { subject, html } = renderSeamanCardsEmail({
    items: items.map(i => ({ card: i.card, documentLink: i.share ? { url: i.share.url } : null })),
    permit, vesselName, delivery, linkExpiresAt,
  })

  const issuedN = cards.filter(c => c.status !== 'cancelled').length
  const cancelledN = cards.length - issuedN
  const counts = [issuedN ? `${issuedN} issued` : null, cancelledN ? `${cancelledN} cancelled` : null].filter(Boolean).join(' + ')
  const licence = String(permit.license_no ?? permit.permit_number ?? '').trim()
  const what = `${counts} seaman's card${cards.length === 1 ? '' : 's'} on Navigation Licence${licence ? ` ${licence}` : ''} for ${vesselName}`
  const recipients = `${to.join(', ')}${cc.length ? ` (cc ${cc.join(', ')})` : ''}`

  const logRow = {
    yacht_id: permit.yacht_id ?? null,
    permit_id: permitId,
    kind: 'seaman_cards',
    channel: 'email',
    subject,
    recipients: to,
    cc,
    body_html: html,
    attachments: [
      ...items.map(({ card, share }) => share
        ? { filename: `seaman's card — ${card.crew_name}`, delivery: 'secure_link', token: share.token, expires_at: share.expiresAt }
        : { filename: `seaman's card — ${card.crew_name}`, delivery: cardFile(card) ? delivery : 'none' }),
      ...extra.map(a => ({ filename: a.filename, delivery: 'attachment', content_type: a.contentType, size: a.size })),
    ],
    actor_id: actor.id,
    actor_name: actor.email,
  }
  const audit = (result: 'success' | 'blocked' | 'failed', detail: string) => logAuditEvent({
    event_type: 'EXPORT',
    module: 'permits',
    actor_id: actor.id, actor_email: actor.email, actor_role: actor.role,
    target_type: 'permit', target_id: permitId, target_label: what,
    detail, ip_address: actor.ip ?? null, user_agent: actor.userAgent ?? null,
    result,
  })

  try {
    await sendGraphEmailWithAttachments({
      to, cc, subject, html,
      attachments: extra.map(({ filename, contentType, contentBase64 }) => ({ filename, contentType, contentBase64 })),
    })
  } catch (e: any) {
    const msg = String(e?.message ?? e)
    const blocked = /switched off|currently disabled/i.test(msg)
    await sb.from('yacht_activity_log').insert([{ ...logRow, status: blocked ? 'blocked' : 'failed', error: msg.slice(0, 500) }])
    await audit(blocked ? 'blocked' : 'failed', `Tried to email ${what} to ${recipients} — ${blocked ? 'blocked' : 'failed'}: ${msg.slice(0, 300)}`)
    throw new PermitSendError(msg, blocked ? 409 : 502, blocked)
  }

  await sb.from('yacht_activity_log').insert([{ ...logRow, status: 'sent' }])
  await audit('success', `Emailed ${what} to ${recipients}${
    linkExpiresAt ? ` — secure links, expire ${linkExpiresAt.slice(0, 10)}` : delivery === 'portal' ? ' — pointed to the client portal' : ''
  }${extra.length ? ` + ${extra.length} attachment${extra.length === 1 ? '' : 's'}` : ''}`)

  await sb.from('navigation_license_seaman_cards')
    .update({ email_sent_at: new Date().toISOString(), email_sent_by: actor.id })
    .in('id', cards.map(c => c.id))
  // Remember who the vessel's contact is, so the licence's own Send works next time.
  if (!String(permit.contact_email ?? '').trim()) {
    await sb.from('permits').update({ contact_email: to[0] }).eq('id', permitId)
  }

  const { notifySentToClient } = await import('@/lib/staff-notifications.server')
  await notifySentToClient({
    userId: actor.id, document: `${cards.length} × Seaman's Card`, reference: licence || null, vessel: vesselName,
    to, cc, secureLinkExpiresAt: linkExpiresAt,
  })

  return {
    to, subject, count: cards.length, delivery,
    secureLinks: items.filter(i => i.share).length,
    linkExpiresAt,
    attachments: extra.length,
  }
}
