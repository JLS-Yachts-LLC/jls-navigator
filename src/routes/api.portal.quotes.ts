/**
 * Client-portal quotations — review a quotation (a QuickBooks Estimate) from any
 * company the vessel is billed by (JLS, Waypoint…) and approve it, decline it,
 * or ask a question. Ids are the finance list's: bare for JLS, `realm:id` otherwise.
 *
 *   GET  /api/portal/quotes            → this vessel's decisions, newest first (to badge the list)
 *   GET  /api/portal/quotes?id=        → one quotation: lines, totals, terms, and its decisions
 *   GET  /api/portal/quotes?pdf=       → the branded quotation PDF
 *   POST /api/portal/quotes            → { id, decision: 'approved' | 'declined' | 'query', note? }
 *
 * Every quotation is checked against the vessel's QuickBooks customer before
 * anything is returned, so an id from another client's quotation finds nothing.
 *
 * A decision is recorded in portal_quote_decisions and raises a Client Request
 * for the team. It is deliberately NOT written to QuickBooks: "Accepted" on an
 * Estimate is the team's own convert-to-Sales-Order step and generates the
 * pro-forma invoice automatically, so it stays with them.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht, portalModulesFor, type PortalYacht } from '@/lib/portal/portal-auth.server'
import { canApproveQuote, canSeeFinance } from '@/lib/portal/portal-positions'
import { sectionEnabled } from '@/lib/portal/portal-modules'
import { accountOf, billingAccounts, docId, JLS_COMPANY, type BillingAccount } from '@/routes/api.portal.finance'
import { logAuditEvent } from '@/lib/admin/audit'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}
type Sb = ReturnType<typeof admin>

const ID_RE = /^(\d{1,20}:)?\d{1,20}$/
const DECISIONS = new Set(['approved', 'declined', 'query'])

/** The Estimate, only if it belongs to one of this vessel's QuickBooks customers. */
async function ownEstimate(yacht: PortalYacht, id: string): Promise<{ est: any; acct: BillingAccount; qboId: string } | null> {
  if (!ID_RE.test(id)) return null
  const hit = accountOf(await billingAccounts(yacht), id)
  if (!hit) return null
  const { qboRequest } = await import('@/lib/qb/qbo.server')
  const res = await qboRequest('GET', `/estimate/${hit.id}?include=enhancedAllCustomFields&minorversion=73`, undefined, hit.acct.realm).catch(() => null)
  const est = res?.Estimate
  if (!est || String(est.CustomerRef?.value) !== String(hit.acct.customerId)) return null
  return { est, acct: hit.acct, qboId: hit.id }
}

async function quoteData(est: any, acct: BillingAccount) {
  const { transformEstimate } = await import('@/lib/qb/estimate-docgen.server')
  const { qboRequest } = await import('@/lib/qb/qbo.server')
  let trnNo = ''
  if (est.CustomerRef?.value) {
    const cust = await qboRequest('GET', `/customer/${est.CustomerRef.value}?minorversion=73`, undefined, acct.realm).catch(() => null)
    trnNo = String(cust?.Customer?.PrimaryTaxIdentifier ?? '')
  }
  return transformEstimate(est, { trnNo })
}

async function callerName(sb: Sb, yacht: PortalYacht): Promise<string> {
  const { data } = await sb.from('captain_accounts').select('display_name')
    .eq('user_id', yacht.userId).eq('yacht_id', yacht.yachtId).eq('active', true).maybeSingle()
  return ((data as any)?.display_name as string | undefined) || yacht.email || 'Client'
}

const money = (n: number, ccy: string) =>
  `${ccy} ${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export async function portalQuotesHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)
  if (!canSeeFinance(yacht.position)) return json({ error: "Your position doesn't include the vessel's accounts." }, 403)
  if (!sectionEnabled('invoices', await portalModulesFor(yacht.yachtId))) return json({ error: "Invoices and quotations aren't switched on for this vessel." }, 403)

  const sb = admin()
  const url = new URL(request.url)

  try {
    if (request.method === 'GET') {
      const pdfId = url.searchParams.get('pdf')
      if (pdfId) {
        const own = await ownEstimate(yacht, pdfId)
        if (!own) return json({ error: 'Not found' }, 404)
        const { est, acct } = own
        let bytes: Uint8Array
        if (acct.realm) {
          // Another company's quotation: QuickBooks' own PDF, on that company's template.
          const { qboPdf } = await import('@/lib/qb/qbo.server')
          bytes = new Uint8Array(await qboPdf(`/estimate/${encodeURIComponent(own.qboId)}/pdf?minorversion=73`, acct.realm))
        } else {
          const { buildQuotationPdf } = await import('@/lib/qb/estimate-docgen.server')
          bytes = await buildQuotationPdf(await quoteData(est, acct))
        }
        return new Response(bytes as unknown as BodyInit, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="Quotation - ${String(est.DocNumber || est.Id).replace(/[^\w.-]+/g, '_')}.pdf"`,
            'Cache-Control': 'no-store',
          },
        })
      }

      const id = url.searchParams.get('id')
      const decisionsQ = sb.from('portal_quote_decisions')
        .select('id, qbo_estimate_id, doc_number, decision, note, decided_by_name, created_at, captain_request_id')
        .eq('yacht_id', yacht.yachtId).order('created_at', { ascending: false })
      if (!id) {
        const { data, error } = await decisionsQ.limit(300)
        if (error) throw error
        return json({ decisions: data ?? [], canApprove: canApproveQuote(yacht.position) && !yacht.preview })
      }

      const own = await ownEstimate(yacht, id)
      if (!own) return json({ error: 'Not found' }, 404)
      const { est, acct } = own
      const q = await quoteData(est, acct)
      const { data: decisions } = await decisionsQ.eq('qbo_estimate_id', id)
      return json({
        id: docId(acct, est.Id),
        company: acct.company,
        docNumber: est.DocNumber ?? null,
        date: est.TxnDate ?? null,
        expiryDate: est.ExpirationDate ?? null,
        qboStatus: (est.TxnStatus ?? 'Pending').toLowerCase(),
        currency: est.CurrencyRef?.value ?? 'AED',
        displayCurrency: q.displayCurrency,
        yachtPO: q.yachtPO || null,
        requestedBy: q.requestedBy || null,
        memo: est.CustomerMemo?.value ?? null,
        items: q.items,
        totals: {
          amount: q.grandAmount, vat: q.grandVat, total: q.grandTotal,
          converted: q.convertedTotal, convertedCurrency: q.convertedCurrency,
        },
        decisions: decisions ?? [],
        canApprove: canApproveQuote(yacht.position) && !yacht.preview,
      })
    }

    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    if (yacht.preview) return json({ error: 'Read-only preview — sign in as the client to make changes.' }, 403)

    const body = (((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>)
    const id = typeof body.id === 'string' ? body.id : ''
    const decision = typeof body.decision === 'string' ? body.decision : ''
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) || null : null
    if (!DECISIONS.has(decision)) return json({ error: 'Unknown decision' }, 400)
    if (decision !== 'query' && !canApproveQuote(yacht.position)) {
      return json({ error: "Your position can ask about quotations but not approve or decline them." }, 403)
    }
    if (decision === 'query' && !note) return json({ error: 'Write your question' }, 400)

    const own = await ownEstimate(yacht, id)
    if (!own) return json({ error: 'Quotation not found' }, 404)
    const { est, acct } = own
    // Named in the request for the team when it isn't a JLS quotation.
    const company = acct.company === JLS_COMPANY ? '' : `${acct.company} `
    const qboStatus = String(est.TxnStatus ?? 'Pending').toLowerCase()
    if (decision !== 'query' && qboStatus !== 'pending') {
      return json({ error: `This quotation is already ${qboStatus} — message JLS if anything needs to change.` }, 400)
    }
    const { data: last } = await sb.from('portal_quote_decisions').select('decision')
      .eq('yacht_id', yacht.yachtId).eq('qbo_estimate_id', id).in('decision', ['approved', 'declined'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (decision !== 'query' && last) return json({ error: `You've already ${(last as any).decision} this quotation.` }, 400)

    const name = await callerName(sb, yacht)
    const doc = String(est.DocNumber || est.Id)
    const total = Number(est.TotalAmt ?? 0)
    const ccy = est.CurrencyRef?.value ?? 'AED'
    const title = decision === 'approved' ? `${company}Quotation ${doc} approved — please proceed`
      : decision === 'declined' ? `${company}Quotation ${doc} declined`
      : `Question on ${company}quotation ${doc}`
    const details = [
      `${name} ${decision === 'approved' ? 'approved' : decision === 'declined' ? 'declined' : 'has a question about'} ${company}quotation ${doc} (${money(total, ccy)}) in the Client Portal.`,
      note ? `\n${decision === 'query' ? 'Question' : 'Note'}: ${note}` : '',
      decision === 'approved' ? `\nAccept it in QuickBooks${company ? ` (${acct.company})` : ''} to convert it to a Sales Order and send the pro-forma.` : '',
    ].join('')

    const { data: cr, error: crErr } = await sb.from('captain_requests').insert({
      yacht_id: yacht.yachtId, created_by: yacht.userId, category: 'general',
      title, details, priority: decision === 'approved' ? 'high' : 'normal', status: 'new',
    }).select('id, reference').single()
    if (crErr || !cr) throw crErr ?? new Error('Could not send to JLS')

    const { error } = await sb.from('portal_quote_decisions').insert({
      yacht_id: yacht.yachtId, qbo_estimate_id: id, doc_number: doc, decision, note, total, currency: ccy,
      decided_by: yacht.userId, decided_by_name: name, captain_request_id: cr.id,
    })
    if (error) throw error

    await logAuditEvent({
      event_type: 'DATA',
      module: 'portal',
      actor_id: null,
      actor_email: yacht.email || '(client portal)',
      actor_role: yacht.position ?? 'captain',
      target_type: 'qbo_estimate',
      target_id: id,
      target_label: `${yacht.vesselName} · quotation ${doc}`,
      detail: `Client portal (${yacht.vesselName}) — ${decision} quotation ${doc} (${money(total, ccy)})${note ? `: ${note.slice(0, 200)}` : ''}`,
      ip_address: request.headers.get('cf-connecting-ip'),
      user_agent: request.headers.get('user-agent'),
      result: 'success',
    })
    return json({ ok: true, requestId: cr.id, requestReference: cr.reference })
  } catch (e: any) {
    console.error('[portal-quotes]', e)
    return json({ error: e?.message ?? 'Could not load the quotation' }, 500)
  }
}
