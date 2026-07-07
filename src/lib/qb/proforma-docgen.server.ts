/**
 * QB (PRO-FORMA) — native port of the n8n workflow (no n8n/OneDrive/ConvertAPI).
 *
 * A Pro-Forma is a QBO Invoice flagged Pro-Forma (custom field "2", classified by
 * the orchestrator). On such an invoice created/updated: ensure it carries a
 * PI26-NNNNN DocNumber (allocate + write back if missing), loop-guard via
 * qbo_doc_logs, render the branded Proforma Invoice PDF + XLSX and attach both to
 * the Invoice, replacing superseded "Proforma Invoice - …" copies.
 * Gated by the qb-proforma-doc toggle (default OFF).
 */
import { qboRequest, qboQuery, qboConfigured } from './qbo.server'
import {
  admin, TAX_CODE_MAP, CURRENCY_MAP, BANK_DETAIL_MAP, bankFor, computeTotals,
  buildDocPdf, buildDocXlsx, docgenGuard, attachAndLog, docgenToggle,
  type DocData, type DocItem,
} from './doc-common.server'

const parseQty = (v: any): number | string => {
  if (v === undefined || v === null || v === '') return ''
  const n = Number(v); return isNaN(n) ? '' : n
}

/** Allocate the next PI26-NNNNN number across all invoices (max+1, 5-digit min). */
async function nextProformaNumber(): Promise<string> {
  const res = await qboQuery("SELECT * FROM Invoice WHERE TxnDate > '2024-01-01' MAXRESULTS 1000").catch(() => null)
  const invoices = (res?.QueryResponse?.Invoice ?? []) as any[]
  let max = 0
  for (const inv of invoices) {
    const m = /^PI26-(\d+)$/.exec(String(inv.DocNumber ?? ''))
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `PI26-${String(max + 1).padStart(5, '0')}`
}

export function transformProforma(invoice: any, extras?: { trnNo?: string }): DocData {
  const docNumber = invoice.DocNumber || invoice.Id
  const billAddr = invoice.BillAddr || {}

  let yachtName = '', yachtPO = '', requestedBy = '', currencyType = '1', bankDetailType = '1', conversionRate = 1
  for (const f of invoice.CustomField ?? []) {
    if (f.Name === 'Yacht.Name') yachtName = f.StringValue || ''
    else if (f.Name === 'Yacht.PO') yachtPO = f.StringValue || ''
    else if (f.Name === 'Currency') currencyType = f.StringValue || '1'
    else if (f.Name === 'Conversion Rate') conversionRate = Number(f.NumberValue ?? f.StringValue) || 1
    else if (f.Name === 'Bank Detail') bankDetailType = f.StringValue || '1'
    else if (f.Name === 'Requested By') requestedBy = f.StringValue || ''
  }
  const displayCurrency = CURRENCY_MAP[currencyType] || 'AED'
  const bankDetail = BANK_DETAIL_MAP[bankDetailType] || 'AED'

  const items: DocItem[] = []
  for (const line of invoice.Line ?? []) {
    if (line.DetailType === 'DescriptionOnly') {
      items.push({ qty: '', description: String(line.Description ?? '').trim(), unitRate: 0, amount: 0, vatPercent: '', vatValue: 0, totalAmount: 0, taxName: '', isDescriptionOnly: true })
    } else if (line.DetailType === 'SalesItemLineDetail') {
      const sd = line.SalesItemLineDetail || {}
      const qty = parseQty(line.Qty ?? sd.Qty)
      const unitRate = Number(sd.UnitPrice || 0)
      const amount = Number(line.Amount ?? Number(qty) * unitRate)
      const taxInfo = TAX_CODE_MAP[sd.TaxCodeRef?.value || '19'] || TAX_CODE_MAP['19']
      const vatValue = taxInfo.rate > 0 ? +(amount * (taxInfo.rate / 100)).toFixed(2) : 0
      const description = String(line.Description || sd.ItemRef?.name || 'Item').trim()
      items.push({ qty, description, unitRate, amount, vatPercent: `${taxInfo.rate}%`, vatValue, totalAmount: +(amount + vatValue).toFixed(2), taxName: taxInfo.name, isDescriptionOnly: false })
    }
  }

  const iso = invoice.MetaData?.CreateTime || new Date().toISOString()
  const dateFormatted = new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const totals = computeTotals(items, displayCurrency, conversionRate)

  return {
    party: {
      name: invoice.CustomerRef?.name || 'Customer',
      address: [billAddr.Line1, billAddr.Line2, billAddr.Line3].filter(Boolean).join(' ').trim(),
      emirates: billAddr.City || 'Dubai',
      trnNo: extras?.trnNo ?? '',
      docNumber: String(docNumber),
      entityId: String(invoice.Id),
    },
    dateFormatted, yachtName, yachtPO, requestedBy,
    displayCurrency, conversionRate, bankDetail, bank: bankFor(bankDetail),
    items, ...totals,
  }
}

export async function runProformaDocgen(entityId: string, rawType: string): Promise<string> {
  if (!qboConfigured()) return 'qbo-not-configured'
  const sb = admin() as any

  const toggle = await docgenToggle(sb, 'qb-proforma-doc', 'QB Pro-Forma — document generation',
    'Native port of the n8n QB (PRO-FORMA) workflow: on a Pro-Forma invoice created/updated, ensures a PI26-NNNNN number, renders the branded Proforma Invoice PDF + XLSX on the worker and attaches both to the Invoice in QuickBooks, replacing prior versions. No n8n, OneDrive or ConvertAPI.')
  if (toggle === 'seeded') return 'docgen-disabled (toggle "QB Pro-Forma — document generation" in Automations)'
  if (!toggle) return 'docgen-disabled'

  let fetched = await qboRequest('GET', `/invoice/${entityId}?include=enhancedAllCustomFields&minorversion=73`)
  let invoice = fetched?.Invoice
  if (!invoice) return 'invoice-not-found'

  // Ensure a Pro-Forma number, writing it back to QBO if missing.
  if (!String(invoice.DocNumber ?? '').includes('PI26-')) {
    const newNo = await nextProformaNumber()
    await qboRequest('POST', '/invoice?minorversion=73', { Id: invoice.Id, SyncToken: invoice.SyncToken, sparse: true, DocNumber: newNo }).catch(() => null)
    fetched = await qboRequest('GET', `/invoice/${entityId}?include=enhancedAllCustomFields&minorversion=73`)
    invoice = fetched?.Invoice ?? invoice
  }

  const lastUpdated = String(invoice.MetaData?.LastUpdatedTime ?? '')
  const createTime = String(invoice.MetaData?.CreateTime ?? '')
  const skip = await docgenGuard(sb, 'Pro-Forma', entityId, rawType, lastUpdated)
  if (skip) return skip

  let trnNo = ''
  const custId = invoice.CustomerRef?.value
  if (custId) {
    const cust = await qboRequest('GET', `/customer/${custId}?minorversion=73`).catch(() => null)
    trnNo = String(cust?.Customer?.PrimaryTaxIdentifier ?? '')
  }

  const data = transformProforma(invoice, { trnNo })
  const docNumber = data.party.docNumber
  const pdfBytes = await buildDocPdf(data, { title: 'PROFORMA INVOICE', partyLabel: 'TO' })
  const xlsxBytes = buildDocXlsx(data, { title: 'PROFORMA INVOICE', partyLabel: 'TO' })

  return attachAndLog({
    sb, entity: 'Invoice', entityId, docType: 'Pro-Forma', docNumber,
    filenamePrefix: 'Proforma Invoice - ',
    files: [
      { name: `Proforma Invoice - ${docNumber}.pdf`, bytes: pdfBytes, contentType: 'application/pdf' },
      { name: `Proforma Invoice - ${docNumber}.xlsx`, bytes: xlsxBytes, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    ],
    createTime, fetchPath: `/invoice/${entityId}?minorversion=73`, stampField: 'Invoice',
  })
}
