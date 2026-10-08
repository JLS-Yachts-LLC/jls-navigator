/**
 * Client-portal Finances — read-only QuickBooks view scoped to the caller's vessel.
 *
 *   GET /api/portal/finance                 → { vessel, invoices[], quotations[], accounts[], summary }
 *   GET /api/portal/finance?invoicePdf=<id>  → streams that invoice's PDF (ownership-verified)
 *   GET /api/portal/finance?statement=1      → statement of account PDF, one per company
 *
 * A vessel can be billed from more than one QuickBooks company: its JLS customer
 * (yachts.qbo_customer_id, falling back to a DisplayName lookup on the vessel
 * name) plus any accounts in yacht_qbo_accounts (e.g. Waypoint Trading LLC).
 * Invoices from a non-JLS company carry the id `${realm}:${id}`; JLS ids stay
 * bare so existing links and quote decisions keep working; quotations use the
 * same ids (api.portal.quotes). Nothing is ever written.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht, portalModulesFor } from '@/lib/portal/portal-auth.server'
import { canSeeFinance } from '@/lib/portal/portal-positions'
import { sectionEnabled } from '@/lib/portal/portal-modules'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const ql = (s: string) => s.replace(/'/g, "\\'")

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Derive a client-friendly invoice status from balance + due date. */
function invoiceStatus(inv: any): 'paid' | 'overdue' | 'open' {
  const bal = Number(inv.Balance ?? 0)
  if (bal <= 0) return 'paid'
  if (inv.DueDate && new Date(inv.DueDate) < new Date(new Date().toDateString())) return 'overdue'
  return 'open'
}

/** The vessel's JLS QuickBooks customer: the linked id, else a lookup by vessel name. */
export async function resolveCustomerId(yacht: { qboCustomerId: string | null; vesselName: string }): Promise<string | null> {
  if (yacht.qboCustomerId) return yacht.qboCustomerId
  const { findQboCustomer } = await import('@/lib/qb/invoice.server')
  const hit = await findQboCustomer(yacht.vesselName).catch(() => null)
  return hit?.Id ?? null
}

/** One QuickBooks customer the vessel is billed under. `realm` undefined = JLS (the default company). */
export type BillingAccount = { realm?: string; customerId: string; company: string }

export const JLS_COMPANY = 'JLS Yachts'

/** Every account the vessel is billed under, JLS first. */
export async function billingAccounts(yacht: { yachtId: string; qboCustomerId: string | null; vesselName: string }): Promise<BillingAccount[]> {
  const out: BillingAccount[] = []
  const jls = await resolveCustomerId(yacht).catch(() => null)
  if (jls) out.push({ customerId: jls, company: JLS_COMPANY })
  const { data } = await admin().from('yacht_qbo_accounts').select('realm_id, customer_id, company_label').eq('yacht_id', yacht.yachtId)
  for (const a of data ?? []) out.push({ realm: a.realm_id, customerId: a.customer_id, company: a.company_label })
  return out
}

/** The portal id for a QuickBooks document in this account. */
export const docId = (acct: BillingAccount, id: string) => (acct.realm ? `${acct.realm}:${id}` : id)

/** Split a portal id back into its account (must be one of the vessel's) and QuickBooks id. */
export function accountOf(accounts: BillingAccount[], id: string): { acct: BillingAccount; id: string } | null {
  const at = id.indexOf(':')
  const realm = at > 0 ? id.slice(0, at) : undefined
  const raw = at > 0 ? id.slice(at + 1) : id
  const acct = accounts.find((a) => a.realm === realm)
  return acct && raw ? { acct, id: raw } : null
}

export async function portalFinanceHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!canSeeFinance(yacht.position)) return json({ error: "Your position doesn't include the vessel's accounts." }, 403)
  if (!sectionEnabled('finances', await portalModulesFor(yacht.yachtId))) return json({ error: "Invoices and balances aren't switched on for this vessel." }, 403)

  const url = new URL(request.url)
  const invoicePdfId = url.searchParams.get('invoicePdf')

  try {
    const accounts = await billingAccounts(yacht)
    const { qboQuery } = await import('@/lib/qb/qbo.server')

    // ── Statement of account PDF (open items, aged) — one statement per company ──
    if (url.searchParams.get('statement')) {
      if (!accounts.length) return json({ error: 'No billing account linked to your vessel yet.' }, 404)
      const { buildStatementPdf } = await import('@/lib/portal/statement-pdf.server')
      const statements = await Promise.all(accounts.map(async (acct) => {
        const res = await qboQuery(
          `select * from Invoice where CustomerRef = '${ql(acct.customerId)}' and Balance > '0' orderby TxnDate maxresults 500`,
          acct.realm,
        )
        const rows = res?.QueryResponse?.Invoice ?? []
        const invoices = rows.map((i: any) => ({
          docNumber: i.DocNumber ?? null, date: i.TxnDate ?? null, dueDate: i.DueDate ?? null,
          total: Number(i.TotalAmt ?? 0), balance: Number(i.Balance ?? 0), currency: i.CurrencyRef?.value ?? 'AED',
        }))
        return { acct, invoices, billTo: (rows[0]?.CustomerRef?.name as string | undefined) ?? null }
      }))
      // A company with nothing owing is left out — unless that's every company.
      const owing = statements.filter((s) => s.invoices.length)
      const pdfs = await Promise.all((owing.length ? owing : statements.slice(0, 1)).map((s) =>
        buildStatementPdf({ vesselName: yacht.vesselName, billTo: s.billTo, invoices: s.invoices, issuer: s.acct.company })))
      let bytes = pdfs[0]
      if (pdfs.length > 1) {
        const { PDFDocument } = await import('pdf-lib')
        const merged = await PDFDocument.create()
        merged.setTitle(`Statement of account — ${yacht.vesselName}`)
        for (const p of pdfs) {
          const src = await PDFDocument.load(p)
          for (const page of await merged.copyPages(src, src.getPageIndices())) merged.addPage(page)
        }
        bytes = await merged.save()
      }
      const stamp = new Date().toISOString().slice(0, 10)
      return new Response(bytes as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="Statement - ${yacht.vesselName.replace(/[^\w .-]+/g, '')} - ${stamp}.pdf"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    // ── Verified invoice PDF download ──
    if (invoicePdfId) {
      const hit = accountOf(accounts, invoicePdfId)
      if (!hit) return json({ error: 'Not found' }, 404)
      const check = await qboQuery(
        `select Id, DocNumber from Invoice where Id = '${ql(hit.id)}' and CustomerRef = '${ql(hit.acct.customerId)}'`,
        hit.acct.realm,
      ).catch(() => null)
      const inv = check?.QueryResponse?.Invoice?.[0]
      if (!inv) return json({ error: 'Not found' }, 404) // don't leak other customers' invoices
      let bytes: Uint8Array
      let fileName: string
      if (!hit.acct.realm) {
        const { renderInvoicePdfById } = await import('@/lib/qb/invoice-doc.server')
        ;({ bytes, fileName } = await renderInvoicePdfById(hit.id))
      } else {
        // Another company's invoice: QuickBooks' own PDF, on that company's template.
        const { qboPdf } = await import('@/lib/qb/qbo.server')
        bytes = new Uint8Array(await qboPdf(`/invoice/${encodeURIComponent(hit.id)}/pdf?minorversion=73`, hit.acct.realm))
        fileName = `Invoice - ${String(inv.DocNumber ?? hit.id).replace(/[^\w .-]+/g, '')}.pdf`
      }
      return new Response(bytes as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${fileName}"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    // ── List invoices + quotations ──
    if (!accounts.length) {
      return json({
        vessel: yacht.vesselName,
        linked: false,
        invoices: [], quotations: [], accounts: [],
        summary: { outstanding: 0, overdue: 0, currency: 'AED', invoiceCount: 0, quotationCount: 0 },
      })
    }

    const perAccount = await Promise.all(accounts.map(async (acct) => {
      const [invRes, estRes, custRes] = await Promise.all([
        qboQuery(`select * from Invoice where CustomerRef = '${ql(acct.customerId)}' orderby TxnDate desc maxresults 200`, acct.realm).catch(() => null),
        qboQuery(`select * from Estimate where CustomerRef = '${ql(acct.customerId)}' orderby TxnDate desc maxresults 200`, acct.realm).catch(() => null),
        qboQuery(`select Id, Balance from Customer where Id = '${ql(acct.customerId)}'`, acct.realm).catch(() => null),
      ])
      const invoices = (invRes?.QueryResponse?.Invoice ?? []).map((i: any) => ({
        id: docId(acct, i.Id),
        docNumber: i.DocNumber ?? null,
        date: i.TxnDate ?? null,
        dueDate: i.DueDate ?? null,
        total: Number(i.TotalAmt ?? 0),
        balance: Number(i.Balance ?? 0),
        currency: i.CurrencyRef?.value ?? 'AED',
        status: invoiceStatus(i),
        company: acct.company,
      }))
      const quotations = (estRes?.QueryResponse?.Estimate ?? []).map((e: any) => ({
        id: docId(acct, e.Id),
        docNumber: e.DocNumber ?? null,
        date: e.TxnDate ?? null,
        expiryDate: e.ExpirationDate ?? null,
        total: Number(e.TotalAmt ?? 0),
        currency: e.CurrencyRef?.value ?? 'AED',
        // QBO TxnStatus: Pending | Accepted | Closed | Rejected
        status: (e.TxnStatus ?? 'Pending').toLowerCase(),
        company: acct.company,
      }))
      const unpaid = invoices.filter((i: any) => i.status !== 'paid')
      // QuickBooks' own open balance (nets off credits), else the unpaid invoices.
      const qboBalance = custRes?.QueryResponse?.Customer?.[0]?.Balance
      const outstanding = qboBalance != null ? Number(qboBalance) : unpaid.reduce((s: number, i: any) => s + i.balance, 0)
      const overdue = invoices.filter((i: any) => i.status === 'overdue').reduce((s: number, i: any) => s + i.balance, 0)
      return { acct, invoices, quotations, outstanding, overdue }
    }))

    const byDateDesc = (a: any, b: any) => String(b.date ?? '').localeCompare(String(a.date ?? ''))
    const invoices = perAccount.flatMap((p) => p.invoices).sort(byDateDesc)
    const quotations = perAccount.flatMap((p) => p.quotations).sort(byDateDesc)
    const outstanding = perAccount.reduce((s, p) => s + p.outstanding, 0)
    const overdue = perAccount.reduce((s, p) => s + p.overdue, 0)
    const currency = invoices[0]?.currency ?? quotations[0]?.currency ?? 'AED'

    return json({
      vessel: yacht.vesselName,
      linked: true,
      invoices, quotations,
      accounts: perAccount.map((p) => ({ company: p.acct.company, outstanding: p.outstanding, overdue: p.overdue })),
      summary: {
        outstanding,
        overdue,
        currency,
        invoiceCount: invoices.length,
        quotationCount: quotations.length,
      },
    })
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500)
  }
}
