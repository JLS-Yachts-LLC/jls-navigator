/**
 * QB (Purchase Order) — native port of the n8n workflow (no n8n/OneDrive/ConvertAPI).
 *
 * On a PurchaseOrder created/updated webhook: loop-guard via qbo_doc_logs, fetch
 * the PO with custom fields, render the branded PDF + XLSX and attach both to the
 * PurchaseOrder in QuickBooks, replacing any superseded "Purchase Order - …"
 * attachments. Gated by the qb-po-doc toggle (default OFF).
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { qboRequest, qboConfigured } from './qbo.server'
import {
  admin, TAX_CODE_MAP, CURRENCY_MAP, BANK_DETAIL_MAP, bankFor, computeTotals,
  buildDocPdf, buildDocXlsx, docgenGuard, attachAndLog, docgenToggle,
  fmt, fmtAlways, CURRENCY_SIGN,
  type DocData, type DocItem,
} from './doc-common.server'
import { PO_TEMPLATE_COORDS } from './po-template-coords'
import { quotationVariant } from './estimate-docgen.server'
import type { StampField, StampPage } from './quotation-template-coords'
import { deepWinAnsiSafe } from '@/lib/pdf-winansi'

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

// ── PDF generation: stamp values onto the real JLS PURCHASE ORDER template ─────
// Blank branded backgrounds live in public/qb-templates/po-bg-<variant>.pdf,
// pages [single, mid, final] (POs have no Terms page); values are drawn at the
// coordinates the {{placeholders}} occupied — same pipeline as Quotation/Pro-Forma.
const WHITE_FIELDS = new Set([
  'totalamount', 'totalvat', 'totalltotalamount',
  'totalamount1', 'totalvat1', 'totalltotalamount1',
  'grandtotalamount', 'grandtotalvat', 'grandtotalltotal',
  'totalamountfinal', 'totalamountfinal1', 'sign',
  'currency', 'newcurrency',
])
const ROWS_PER_PAGE = 35
const ADDRESS_LINE_PITCH = 13.32
const bgCache = new Map<string, Uint8Array>()

async function fetchPoBackground(variant: string): Promise<Uint8Array | null> {
  const cached = bgCache.get(variant)
  if (cached) return cached
  const base = process.env.VITE_APP_URL || 'https://jls-navigator.m-peeters-4a0.workers.dev'
  const url = `${base.replace(/\/$/, '')}/qb-templates/po-bg-${variant}.pdf`
  try {
    // A Worker cannot fetch its own hostname — read via the static ASSETS binding.
    const assets = (globalThis as Record<string, any>).__CF_ENV?.ASSETS
    const res = assets?.fetch ? await assets.fetch(url) : await fetch(url)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    bgCache.set(variant, bytes)
    return bytes
  } catch { return null }
}

export async function buildPurchaseOrderPdf(q: DocData, opts?: { background?: Uint8Array }): Promise<Uint8Array> {
  q = deepWinAnsiSafe(q)
  const variant = quotationVariant(q.displayCurrency)
  const bg = opts?.background ?? await fetchPoBackground(variant)
  if (!bg) return buildDocPdf(q, { title: 'PURCHASE ORDER', partyLabel: 'VENDOR' })
  const coords = PO_TEMPLATE_COORDS[variant]

  const src = await PDFDocument.load(bg)
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const BLACK = rgb(0, 0, 0)
  const WHITE = rgb(1, 1, 1)

  const draw = (page: any, f: StampField, value: string, white = false) => {
    const v = String(value ?? '')
    if (!v) return
    const fnt = f.bold ? bold : font
    const w = fnt.widthOfTextAtSize(v, f.size)
    const x = f.align === 'right' ? f.x - w : f.align === 'center' ? f.x - w / 2 : f.x
    page.drawText(v, { x, y: f.y, size: f.size, font: fnt, color: white ? WHITE : BLACK })
  }

  const wrap = (text: string, width: number, size: number): string[] => {
    const out: string[] = []
    for (const hard of String(text).split(/\r?\n/)) {
      let rest = hard.trim()
      if (!rest) { out.push(''); continue }
      while (rest.length) {
        if (font.widthOfTextAtSize(rest, size) <= width) { out.push(rest); break }
        let cut = rest.length
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--
        const sp = rest.lastIndexOf(' ', cut)
        cut = sp > 0 ? sp : cut
        out.push(rest.slice(0, cut).trim())
        rest = rest.slice(cut).trim()
      }
    }
    while (out.length && out[out.length - 1] === '') out.pop()
    return out.length ? out : ['']
  }

  type RenderRow = { cells: Record<string, string>; subAmount: number; subVat: number; subTotal: number }
  const descWidth = Math.min(coords.single.itemRows.descWidth, coords.mid.itemRows.descWidth, coords.final.itemRows.descWidth)
  const rows: RenderRow[] = []
  for (const it of q.items) {
    const lines = wrap(it.description, descWidth, coords.single.itemRows.cols.description?.size ?? 6)
    const numLine = Math.floor((lines.length - 1) / 2)
    lines.forEach((ln, i) => {
      rows.push({
        cells: {
          qty: i === numLine && it.qty !== '' ? String(it.qty) : '',
          description: ln,
          unitRate: i === numLine && !it.isDescriptionOnly ? fmt(it.unitRate) : '',
          amount: i === numLine && !it.isDescriptionOnly ? fmt(it.amount) : '',
          vatPercent: i === numLine && !it.isDescriptionOnly ? it.vatPercent : '',
          vatValue: i === numLine && !it.isDescriptionOnly ? fmt(it.vatValue) : '',
          totalAmount: i === numLine && !it.isDescriptionOnly ? fmt(it.totalAmount) : '',
        },
        subAmount: i === numLine && !it.isDescriptionOnly ? it.amount : 0,
        subVat: i === numLine && !it.isDescriptionOnly ? it.vatValue : 0,
        subTotal: i === numLine && !it.isDescriptionOnly ? it.totalAmount : 0,
      })
    })
  }
  const pageRows: RenderRow[][] = []
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) pageRows.push(rows.slice(i, i + ROWS_PER_PAGE))
  if (!pageRows.length) pageRows.push([])
  const pageCount = pageRows.length

  const kinds: Array<'single' | 'mid' | 'final'> = pageCount === 1
    ? ['single']
    : [...Array(pageCount - 1).fill('mid') as 'mid'[], 'final']
  const BG_INDEX = { single: 0, mid: 1, final: 2 } as const

  const grandFields: Record<string, string> = {
    name: q.party.name,
    date: q.dateFormatted,
    invoiceno: q.party.docNumber,
    shipvia: q.shipVia ?? '',
    currency: q.bankDetail,
    newcurrency: q.displayCurrency,
    bank: q.bank.bankName,
    acct: q.bank.accountNumber,
    iban: q.bank.iban,
    grandtotalamount: fmtAlways(q.grandAmount),
    grandtotalvat: fmt(q.grandVat),
    grandtotalltotal: fmtAlways(q.grandTotal),
    '5%value': fmt(q.vat5Base),
    '0%value': fmt(q.vat0Base),
    nontaxablevalue: fmt(q.nonTaxable),
    '5%vatvalue': fmt(q.vat5Value),
    totalamountfinal: fmtAlways(q.grandTotal),
    sign: variant === 'aedconv' ? q.convertedSign : variant === 'usdeur' ? (CURRENCY_SIGN[q.displayCurrency.toUpperCase()] ?? q.displayCurrency) : '',
    totalamountfinal1: q.convertedTotal != null ? fmtAlways(+q.convertedTotal.toFixed(2)) : '',
  }

  for (let pi = 0; pi < pageCount; pi++) {
    const kind = kinds[pi]
    const pc: StampPage = coords[kind]
    const [page] = await pdf.copyPages(src, [BG_INDEX[kind]])
    pdf.addPage(page)

    const PAGE_TOTAL_KEYS = new Set(['totalamount', 'totalvat', 'totalltotalamount', 'totalamount1', 'totalvat1', 'totalltotalamount1'])
    for (const [key, f] of Object.entries(pc.fields)) {
      if (key === 'address' || PAGE_TOTAL_KEYS.has(key)) continue
      draw(page, f, grandFields[key] ?? '', WHITE_FIELDS.has(key))
    }
    for (const rl of (pc as any).relabels ?? []) {
      const value = grandFields[rl.key] ?? ''
      if (!value) continue
      const label = String(rl.template).replace('%', value)
      const size = 7
      const w = bold.widthOfTextAtSize(label, size)
      page.drawRectangle({ x: rl.centerX - (rl.w + 28) / 2, y: rl.y - 2.5, width: rl.w + 28, height: size + 5, color: BLACK })
      page.drawText(label, { x: rl.centerX - w / 2, y: rl.y, size, font: bold, color: WHITE })
    }

    const addrField = pc.fields['address']
    if (addrField) {
      wrap(q.party.address, 170, addrField.size).slice(0, 3).forEach((ln, i) => {
        draw(page, { ...addrField, y: addrField.y - i * ADDRESS_LINE_PITCH }, ln)
      })
    }

    let subA = 0, subV = 0, subT = 0
    pageRows[pi].forEach((r, ri) => {
      const y = pc.itemRows.ys[ri]
      if (y == null) return
      for (const [key, cf] of Object.entries(pc.itemRows.cols)) {
        const v = r.cells[key]
        if (v) draw(page, { ...cf, y }, v)
      }
      subA += r.subAmount; subV += r.subVat; subT += r.subTotal
    })

    const t = (base: string) => pc.fields[base] ?? pc.fields[`${base}1`]
    if (t('totalamount')) draw(page, t('totalamount')!, fmtAlways(subA), true)
    if (t('totalvat')) draw(page, t('totalvat')!, fmt(subV), true)
    if (t('totalltotalamount')) draw(page, t('totalltotalamount')!, fmtAlways(subT), true)

    if (pageCount > 2 && pc.pageNo) {
      const b = pc.pageNo
      page.drawRectangle({ x: b.x - 1, y: b.y - 1.5, width: b.w + 14, height: b.h + 4, color: WHITE })
      page.drawText('Page ', { x: b.x, y: b.y, size: 5.2, font: bold, color: BLACK })
      page.drawText(`${pi + 1} of ${pageCount}`, { x: b.x + bold.widthOfTextAtSize('Page ', 5.2), y: b.y, size: 5.2, font, color: BLACK })
    }
  }

  return pdf.save()
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
  // Branded template stamping (real JLS PURCHASE ORDER Word templates); falls
  // back to the plain layout only if the background can't be loaded.
  const pdfBytes = await buildPurchaseOrderPdf(data)
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
