/**
 * QB (Purchase Order) — native port of the n8n workflow (no n8n/OneDrive/ConvertAPI).
 *
 * On a PurchaseOrder created/updated webhook: loop-guard via qbo_doc_logs, fetch
 * the PO with custom fields, render the branded PDF + XLSX and attach both to the
 * PurchaseOrder in QuickBooks, replacing any superseded "Purchase Order - …"
 * attachments. Gated by the qb-po-doc toggle (default OFF).
 */
import { qboRequest, qboConfigured } from './qbo.server'
import {
  admin, TAX_CODE_MAP, CURRENCY_MAP, BANK_DETAIL_MAP, bankFor, computeTotals,
  buildDocPdf, buildDocXlsx, docgenGuard, attachAndLog, docgenToggle,
  type DocData, type DocItem,
} from './doc-common.server'

const parseQty = (v: any): number | string => {
  if (v === undefined || v === null || v === '') return ''
  const n = Number(v)
  return isNaN(n) ? '' : n
}

export function transformPurchaseOrder(po: any): DocData {
  const docNumber = po.DocNumber || po.Id || `PO-${po.Id}`
  const addr = po.VendorAddr || {}

  let yachtName = '', yachtPO = '', requestedBy = '', currencyType = '1', bankDetailType = '1', conversionRate = 1
  for (const f of po.CustomField ?? []) {
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
  for (const line of po.Line ?? []) {
    if (line.DetailType === 'DescriptionOnly') {
      items.push({ qty: '', description: String(line.Description ?? '').trim(), unitRate: 0, amount: 0, vatPercent: '', vatValue: 0, totalAmount: 0, taxName: '', isDescriptionOnly: true })
      continue
    }
    if (line.DetailType !== 'AccountBasedExpenseLineDetail' && line.DetailType !== 'ItemBasedExpenseLineDetail') continue
    const isAccountBased = line.DetailType === 'AccountBasedExpenseLineDetail'
    const sd = line.AccountBasedExpenseLineDetail || line.ItemBasedExpenseLineDetail || {}
    const qty = isAccountBased ? '' : parseQty(line.Qty ?? sd.Qty ?? 1)
    const unitRate = isAccountBased ? 0 : Number(sd.UnitPrice || 0)
    const amount = Number(line.Amount || 0)
    const taxInfo = TAX_CODE_MAP[sd.TaxCodeRef?.value || '19'] || TAX_CODE_MAP['19']
    const vatValue = taxInfo.rate > 0 ? +(amount * (taxInfo.rate / 100)).toFixed(2) : 0
    const description = String(line.Description || sd.ItemRef?.name || sd.AccountRef?.name || 'Item').trim()
    items.push({ qty, description, unitRate, amount, vatPercent: `${taxInfo.rate}%`, vatValue, totalAmount: +(amount + vatValue).toFixed(2), taxName: taxInfo.name, isDescriptionOnly: false })
  }

  const iso = po.MetaData?.CreateTime || new Date().toISOString()
  const dateFormatted = new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const totals = computeTotals(items, displayCurrency, conversionRate)

  return {
    party: {
      name: po.VendorRef?.name || 'Unknown Vendor',
      address: [addr.Line1, addr.Line2, addr.Line3, addr.Line4, addr.City].filter(Boolean).join(' ').trim(),
      emirates: addr.City || po.TransactionLocationType || 'Dubai',
      trnNo: '',
      docNumber: String(docNumber),
      entityId: String(po.Id),
    },
    dateFormatted, yachtName, yachtPO, requestedBy,
    shipVia: po.ShipMethodRef?.name || '',
    displayCurrency, conversionRate, bankDetail, bank: bankFor(bankDetail),
    items, ...totals,
  }
}

export async function runPurchaseOrderDocgen(entityId: string, rawType: string): Promise<string> {
  if (!qboConfigured()) return 'qbo-not-configured'
  const sb = admin() as any

  const toggle = await docgenToggle(sb, 'qb-po-doc', 'QB Purchase Order — document generation',
    'Native port of the n8n QB (Purchase Order) workflow: on PO created/updated, renders the branded Purchase Order PDF + XLSX on the worker and attaches both to the PurchaseOrder in QuickBooks, replacing prior versions. No n8n, OneDrive or ConvertAPI.')
  if (toggle === 'seeded') return 'docgen-disabled (toggle "QB Purchase Order — document generation" in Automations)'
  if (!toggle) return 'docgen-disabled'

  const fetched = await qboRequest('GET', `/purchaseorder/${entityId}?include=enhancedAllCustomFields&minorversion=73`)
  const po = fetched?.PurchaseOrder
  if (!po) return 'po-not-found'
  const lastUpdated = String(po.MetaData?.LastUpdatedTime ?? '')
  const createTime = String(po.MetaData?.CreateTime ?? '')

  const skip = await docgenGuard(sb, 'PurchaseOrder', entityId, rawType, lastUpdated)
  if (skip) return skip

  const data = transformPurchaseOrder(po)
  const docNumber = data.party.docNumber
  const pdfBytes = await buildDocPdf(data, { title: 'PURCHASE ORDER', partyLabel: 'VENDOR' })
  const xlsxBytes = buildDocXlsx(data, { title: 'PURCHASE ORDER', partyLabel: 'VENDOR' })

  return attachAndLog({
    sb, entity: 'PurchaseOrder', entityId, docType: 'PurchaseOrder', docNumber,
    filenamePrefix: 'Purchase Order - ',
    files: [
      { name: `Purchase Order - ${docNumber}.pdf`, bytes: pdfBytes, contentType: 'application/pdf' },
      { name: `Purchase Order - ${docNumber}.xlsx`, bytes: xlsxBytes, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    ],
    createTime, fetchPath: `/purchaseorder/${entityId}?minorversion=73`, stampField: 'PurchaseOrder',
  })
}
