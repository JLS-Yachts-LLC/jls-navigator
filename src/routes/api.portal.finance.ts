/**
 * Client-portal Finances — read-only QuickBooks view scoped to the caller's vessel.
 *
 *   GET /api/portal/finance                 → { vessel, invoices[], quotations[], summary }
 *   GET /api/portal/finance?invoicePdf=<id>  → streams that invoice's PDF (ownership-verified)
 *
 * Invoices/estimates are matched to the vessel's QBO Customer (yachts.qbo_customer_id,
 * falling back to a DisplayName lookup on the vessel name). Nothing is ever written.
 */
import { resolvePortalYacht } from '@/lib/portal/portal-auth.server'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const ql = (s: string) => s.replace(/'/g, "\\'")

/** Derive a client-friendly invoice status from balance + due date. */
function invoiceStatus(inv: any): 'paid' | 'overdue' | 'open' {
  const bal = Number(inv.Balance ?? 0)
  if (bal <= 0) return 'paid'
  if (inv.DueDate && new Date(inv.DueDate) < new Date(new Date().toDateString())) return 'overdue'
  return 'open'
}

async function resolveCustomerId(yacht: { qboCustomerId: string | null; vesselName: string }): Promise<string | null> {
  if (yacht.qboCustomerId) return yacht.qboCustomerId
  const { findQboCustomer } = await import('@/lib/qb/invoice.server')
  const hit = await findQboCustomer(yacht.vesselName).catch(() => null)
  return hit?.Id ?? null
}

export async function portalFinanceHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth

  const url = new URL(request.url)
  const invoicePdfId = url.searchParams.get('invoicePdf')

  try {
    const customerId = await resolveCustomerId(yacht)

    // ── Verified invoice PDF download ──
    if (invoicePdfId) {
      if (!customerId) return json({ error: 'No billing account linked to your vessel yet.' }, 404)
      const { qboQuery } = await import('@/lib/qb/qbo.server')
      const check = await qboQuery(
        `select Id from Invoice where Id = '${ql(invoicePdfId)}' and CustomerRef = '${ql(customerId)}'`,
      ).catch(() => null)
      const owned = check?.QueryResponse?.Invoice?.length > 0
      if (!owned) return json({ error: 'Not found' }, 404) // don't leak other customers' invoices
      const { renderInvoicePdfById } = await import('@/lib/qb/invoice-doc.server')
      const { bytes, fileName } = await renderInvoicePdfById(invoicePdfId)
      return new Response(bytes as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${fileName}"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    // ── List invoices + quotations ──
    if (!customerId) {
      return json({
        vessel: yacht.vesselName,
        linked: false,
        invoices: [], quotations: [],
        summary: { outstanding: 0, currency: 'AED', invoiceCount: 0, quotationCount: 0 },
      })
    }

    const { qboQuery } = await import('@/lib/qb/qbo.server')
    const [invRes, estRes] = await Promise.all([
      qboQuery(`select * from Invoice where CustomerRef = '${ql(customerId)}' orderby TxnDate desc maxresults 200`).catch(() => null),
      qboQuery(`select * from Estimate where CustomerRef = '${ql(customerId)}' orderby TxnDate desc maxresults 200`).catch(() => null),
    ])

    const invoices = (invRes?.QueryResponse?.Invoice ?? []).map((i: any) => ({
      id: i.Id,
      docNumber: i.DocNumber ?? null,
      date: i.TxnDate ?? null,
      dueDate: i.DueDate ?? null,
      total: Number(i.TotalAmt ?? 0),
      balance: Number(i.Balance ?? 0),
      currency: i.CurrencyRef?.value ?? 'AED',
      status: invoiceStatus(i),
    }))

    const quotations = (estRes?.QueryResponse?.Estimate ?? []).map((e: any) => ({
      id: e.Id,
      docNumber: e.DocNumber ?? null,
      date: e.TxnDate ?? null,
      expiryDate: e.ExpirationDate ?? null,
      total: Number(e.TotalAmt ?? 0),
      currency: e.CurrencyRef?.value ?? 'AED',
      // QBO TxnStatus: Pending | Accepted | Closed | Rejected
      status: (e.TxnStatus ?? 'Pending').toLowerCase(),
    }))

    const outstanding = invoices.reduce((s: number, i: any) => s + (i.status !== 'paid' ? i.balance : 0), 0)
    const currency = invoices[0]?.currency ?? quotations[0]?.currency ?? 'AED'

    return json({
      vessel: yacht.vesselName,
      linked: true,
      invoices, quotations,
      summary: {
        outstanding,
        currency,
        invoiceCount: invoices.length,
        quotationCount: quotations.length,
      },
    })
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500)
  }
}
