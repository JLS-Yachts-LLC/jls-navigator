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
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { qboRequest, qboQuery, qboConfigured } from './qbo.server'
import {
  admin, TAX_CODE_MAP, CURRENCY_MAP, BANK_DETAIL_MAP, bankFor, computeTotals,
  buildDocPdf, buildDocXlsx, docgenGuard, attachAndLog, docgenToggle,
  fmt, fmtAlways, CURRENCY_SIGN,
  type DocData, type DocItem,
} from './doc-common.server'
import { PROFORMA_TEMPLATE_COORDS } from './proforma-template-coords'
import { quotationVariant } from './estimate-docgen.server'
import type { StampField, StampPage } from './quotation-template-coords'
import { deepWinAnsiSafe } from '@/lib/pdf-winansi'

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

// ── PDF generation: stamp values onto the real JLS PROFORMA template ───────────
// Blank branded backgrounds (placeholders stripped from Matt's Word templates)
// live in public/qb-templates/proforma-bg-<variant>.pdf, pages [single, mid,
// final, terms]; values are drawn at the coordinates the {{placeholders}}
// occupied (proforma-template-coords.ts) — same pipeline as the Quotation.
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

async function fetchProformaBackground(variant: string): Promise<Uint8Array | null> {
  const cached = bgCache.get(variant)
  if (cached) return cached
  const base = process.env.VITE_APP_URL || 'https://jls-navigator.m-peeters-4a0.workers.dev'
  const url = `${base.replace(/\/$/, '')}/qb-templates/proforma-bg-${variant}.pdf`
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

export async function buildProformaPdf(q: DocData): Promise<Uint8Array> {
  q = deepWinAnsiSafe(q)
  const variant = quotationVariant(q.displayCurrency)
  const bg = await fetchProformaBackground(variant)
  if (!bg) return buildDocPdf(q, { title: 'PROFORMA INVOICE', partyLabel: 'TO' })
  const coords = PROFORMA_TEMPLATE_COORDS[variant]

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

  // Pre-render items into 35-slot visual rows (numbers on the middle line).
  type Row = { cells: Record<string, string>; subAmount: number; subVat: number; subTotal: number }
  const descWidth = Math.min(coords.single.itemRows.descWidth, coords.mid.itemRows.descWidth, coords.final.itemRows.descWidth)
  const rows: Row[] = []
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
  const pageRows: Row[][] = []
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) pageRows.push(rows.slice(i, i + ROWS_PER_PAGE))
  if (!pageRows.length) pageRows.push([])
  const pageCount = pageRows.length

  const kinds: Array<'single' | 'mid' | 'final'> = pageCount === 1
    ? ['single']
    : [...Array(pageCount - 1).fill('mid') as 'mid'[], 'final']
  const BG_INDEX = { single: 0, mid: 1, final: 2 } as const

  const grandFields: Record<string, string> = {
    name: q.party.name,
    emirates: q.party.emirates,
    clienttrn: q.party.trnNo,
    trnno: q.party.trnNo,
    date: q.dateFormatted,
    invoiceno: q.party.docNumber,
    yachtname: q.yachtName,
    yachtpo: q.yachtPO,
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

  // Terms & Conditions page (static, last page of the background).
  const [terms] = await pdf.copyPages(src, [3])
  pdf.addPage(terms)

  return pdf.save()
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
  // Branded template stamping (real JLS PROFORMA Word templates); falls back to
  // the plain layout only if the background can't be loaded.
  const pdfBytes = await buildProformaPdf(data)
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
