/**
 * QB (Quotation/Estimate) — fully worker-native port of the n8n doc-gen workflow.
 *
 * On an estimate created/updated webhook:
 *   1. Loop-guard via qbo_doc_logs (our own attachment writes echo back as
 *      "updated" webhooks — recognise and skip them).
 *   2. Fetch the estimate with custom fields; transform exactly like the n8n
 *      Processing nodes (Yacht.Name / Yacht.PO / Currency / Conversion Rate /
 *      Bank Detail / Requested By custom fields, tax-code map, DescriptionOnly
 *      rows, dd/mm/yyyy dates).
 *   3. Generate the branded Quotation PDF natively with pdf-lib (35 rows/page,
 *      page subtotals, VAT breakdown, bank details, currency-conversion line)
 *      and a matching XLSX (hand-rolled OOXML zip — no dependencies).
 *   4. Upload both to QBO, attach to the estimate, and delete superseded
 *      "Quotation - …" attachments.
 *
 * No n8n, no Google Drive templates, no ConvertAPI.
 */
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { qboRequest, qboQuery, qboUpload, qboConfigured } from './qbo.server'
import { QUOTATION_TEMPLATE_COORDS, type QuotationVariant, type StampField, type StampPage } from './quotation-template-coords'
import { logAutomationRun } from '@/lib/automations.server'

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}

// ── Maps (verbatim from the n8n Code nodes) ───────────────────────────────────
const CURRENCY_MAP: Record<string, string> = { '1': 'AED', '2': 'USD', '3': 'EUR', '4': 'AED TO USD', '5': 'AED TO EUR' }
const BANK_DETAIL_MAP: Record<string, string> = { '1': 'AED', '2': 'USD', '3': 'EURO' }
const TAX_CODE_MAP: Record<string, { name: string; rate: number }> = {
  '19': { name: 'Taxable Amount @ 5%', rate: 5 },
  '17': { name: 'Taxable Amount @ 0%', rate: 0 },
  '18': { name: 'Non Taxable Amount', rate: 0 },
  '21': { name: 'Taxable Amount @ 5%', rate: 5 },
  '22': { name: 'Taxable Amount @ 0%', rate: 0 },
  '24': { name: 'Non Taxable Amount', rate: 0 },
}
const BANK_MAP: Record<string, { bankName: string; accountNumber: string; iban: string }> = {
  USD: { bankName: 'Emirates NBD – Tecom Branch, Dubai, UAE', accountNumber: '102-48474993-02', iban: 'AE32 0260 0010 2484 7499 302' },
  EUR: { bankName: 'Emirates NBD – Barsha Heights (TECOM), Dubai', accountNumber: '102-48474993-03', iban: 'AE05 0260 0010 2484 7499 303' },
  AED: { bankName: 'EMIRATES NBD – TECOM BRANCH, DUBAI UAE', accountNumber: '101-48474993-01', iban: 'AE24 0260 0010 1484 7499 301' },
}
const CURRENCY_SIGN: Record<string, string> = { USD: '$', EUR: '€' }

// ── Transform (port of Processing-3 / Processing-2 / Processing-1) ────────────
export type QuoteItem = {
  qty: number | string
  description: string
  unitRate: number
  amount: number
  vatPercent: string
  vatValue: number
  totalAmount: number
  taxName: string
  isDescriptionOnly: boolean
}

export type QuoteData = {
  customer: { name: string; address: string; emirates: string; trnNo: string; invoiceNo: string; estimateId: string }
  dateFormatted: string
  yachtName: string
  yachtPO: string
  requestedBy: string
  displayCurrency: string       // AED | USD | EUR | AED TO USD | AED TO EUR
  conversionRate: number
  bankDetail: string            // AED | USD | EURO
  bank: { bankName: string; accountNumber: string; iban: string }
  items: QuoteItem[]
  grandAmount: number
  grandVat: number
  grandTotal: number
  vat5Base: number
  vat0Base: number
  nonTaxable: number
  vat5Value: number
  convertedTotal: number | null // grandTotal / conversionRate when "AED TO X"
  convertedCurrency: string | null
  convertedSign: string
}

const fmt = (n: number | null | undefined): string =>
  n == null || isNaN(n as number) || n === 0 ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtAlways = (n: number): string =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function transformEstimate(estimate: any, extras?: { trnNo?: string }): QuoteData {
  const docNumber = estimate.DocNumber || estimate.Id || `QB-${estimate.Id}`
  const billAddr = estimate.BillAddr || {}

  // Custom fields
  let yachtName = '', yachtPO = '', requestedBy = ''
  let currencyType = '1', bankDetailType = '1'
  let conversionRate = 1
  for (const f of estimate.CustomField ?? []) {
    if (f.Name === 'Yacht.Name') yachtName = f.StringValue || ''
    else if (f.Name === 'Yacht.PO') yachtPO = f.StringValue || ''
    else if (f.Name === 'Currency') currencyType = f.StringValue || '1'
    else if (f.Name === 'Conversion Rate') conversionRate = Number(f.NumberValue ?? f.StringValue) || 1
    else if (f.Name === 'Bank Detail') bankDetailType = f.StringValue || '1'
    else if (f.Name === 'Requested By') requestedBy = f.StringValue || ''
  }
  const displayCurrency = CURRENCY_MAP[currencyType] || 'AED'
  const bankDetail = BANK_DETAIL_MAP[bankDetailType] || 'AED'

  // Bank account selection: conversions ("AED TO X") are paid into the AED account.
  const bd = bankDetail.toUpperCase()
  const bankKey = bd.includes('USD') && bd.includes('AED') ? 'AED'
    : bd.includes('EUR') && bd.includes('AED') ? 'AED'
    : bd.includes('USD') ? 'USD'
    : bd.includes('EUR') || bd.includes('EURO') ? 'EUR'
    : 'AED'
  const bank = BANK_MAP[bankKey]

  // Date: dd/mm/yyyy from CreateTime → "Month Day, Year"
  const iso = estimate.MetaData?.CreateTime || new Date().toISOString()
  const d = new Date(iso)
  const dateFormatted = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  // Line items (SalesItemLineDetail + DescriptionOnly), tax mapping identical to n8n.
  const items: QuoteItem[] = []
  for (const line of estimate.Line ?? []) {
    if (line.DetailType === 'DescriptionOnly') {
      const desc = String(line.Description ?? '').trim()
      items.push({ qty: '', description: desc, unitRate: 0, amount: 0, vatPercent: '', vatValue: 0, totalAmount: 0, taxName: '', isDescriptionOnly: true })
    } else if (line.DetailType === 'SalesItemLineDetail') {
      const sd = line.SalesItemLineDetail || {}
      const qtyRaw = line.Qty ?? sd.Qty
      const qty = qtyRaw === undefined || qtyRaw === null || qtyRaw === '' || isNaN(Number(qtyRaw)) ? '' : Number(qtyRaw)
      const unitRate = Number(sd.UnitPrice || 0)
      const amount = Number(line.Amount ?? Number(qty) * unitRate)
      const taxInfo = TAX_CODE_MAP[sd.TaxCodeRef?.value || '19'] || TAX_CODE_MAP['19']
      const vatValue = taxInfo.rate > 0 ? +(amount * (taxInfo.rate / 100)).toFixed(2) : 0
      const description = String(line.Description || sd.ItemRef?.name || 'Item').trim()
      items.push({
        qty, description, unitRate, amount,
        vatPercent: `${taxInfo.rate}%`, vatValue,
        totalAmount: +(amount + vatValue).toFixed(2),
        taxName: taxInfo.name, isDescriptionOnly: false,
      })
    }
  }

  // Totals + VAT breakdown
  let grandAmount = 0, grandVat = 0, grandTotal = 0
  let vat5Base = 0, vat0Base = 0, nonTaxable = 0, vat5Value = 0
  for (const it of items) {
    if (it.isDescriptionOnly) continue
    grandAmount += it.amount; grandVat += it.vatValue; grandTotal += it.totalAmount
    if (it.taxName === 'Taxable Amount @ 5%') { vat5Base += it.amount; vat5Value += it.vatValue }
    else if (it.taxName === 'Taxable Amount @ 0%') vat0Base += it.amount
    else nonTaxable += it.amount
  }

  // Conversion line ("AED TO USD"/"AED TO EUR")
  let convertedTotal: number | null = null
  let convertedCurrency: string | null = null
  const cur = displayCurrency.toUpperCase()
  if (cur.includes('TO')) {
    convertedCurrency = cur.includes('USD') ? 'USD' : cur.includes('EUR') ? 'EUR' : null
    if (convertedCurrency && conversionRate) convertedTotal = grandTotal / conversionRate
  }

  return {
    customer: {
      name: estimate.CustomerRef?.name || 'Customer',
      address: [billAddr.Line1, billAddr.Line2, billAddr.Line3].filter(Boolean).join(' ').trim(),
      emirates: billAddr.City || 'Dubai',
      trnNo: extras?.trnNo ?? '',
      invoiceNo: String(docNumber),
      estimateId: String(estimate.Id),
    },
    dateFormatted, yachtName, yachtPO, requestedBy,
    displayCurrency, conversionRate, bankDetail, bank,
    items, grandAmount, grandVat, grandTotal,
    vat5Base, vat0Base, nonTaxable, vat5Value,
    convertedTotal, convertedCurrency,
    convertedSign: convertedCurrency ? (CURRENCY_SIGN[convertedCurrency] ?? '') : '',
  }
}

// ── PDF generation: stamp values onto the real JLS Quotation template ─────────
// The blank branded backgrounds (placeholders stripped from the original Word
// templates) live in public/qb-templates/quotation-bg-<variant>.pdf with pages
// [single, mid, final, terms]. Values are drawn at the exact coordinates the
// {{placeholders}} occupied (see quotation-template-coords.ts).

/** Which template variant a quote uses, from its Currency custom field. */
export function quotationVariant(displayCurrency: string): QuotationVariant {
  const c = displayCurrency.toUpperCase()
  if (c.includes('TO')) return 'aedconv'
  if (c === 'USD' || c === 'EUR') return 'usdeur'
  return 'aed'
}

// Fields printed inside the template's black bars (need white text).
const WHITE_FIELDS = new Set([
  'totalamount', 'totalvat', 'totalltotalamount',
  'totalamount1', 'totalvat1', 'totalltotalamount1',
  'grandtotalamount', 'grandtotalvat', 'grandtotalltotal',
  'totalamountfinal', 'totalamountfinal1', 'sign',
  'currency', 'newcurrency', // bank-details box header + totals-bar currency label
])

const bgCache = new Map<QuotationVariant, Uint8Array>()

async function fetchBackground(variant: QuotationVariant): Promise<Uint8Array | null> {
  const cached = bgCache.get(variant)
  if (cached) return cached
  const base = process.env.VITE_APP_URL || 'https://jls-navigator.m-peeters-4a0.workers.dev'
  const url = `${base.replace(/\/$/, '')}/qb-templates/quotation-bg-${variant}.pdf`
  try {
    // In production a Worker CANNOT fetch its own hostname (Cloudflare blocks
    // self-requests), which silently dropped us to the unbranded fallback layout.
    // Read the file from the static ASSETS binding instead; plain fetch remains
    // as the dev-server fallback.
    const assets = (globalThis as Record<string, any>).__CF_ENV?.ASSETS
    const res = assets?.fetch ? await assets.fetch(url) : await fetch(url)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    bgCache.set(variant, bytes)
    return bytes
  } catch {
    return null
  }
}

const ROWS_PER_PAGE = 35
const ADDRESS_LINE_PITCH = 13.32

export async function buildQuotationPdf(q: QuoteData, opts?: { background?: Uint8Array }): Promise<Uint8Array> {
  const variant = quotationVariant(q.displayCurrency)
  const bg = opts?.background ?? await fetchBackground(variant)
  if (!bg) return buildQuotationPdfBasic(q)
  const coords = QUOTATION_TEMPLATE_COORDS[variant]

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

  // Wrap text to a width with real glyph metrics.
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

  // Pre-render items into 35-slot visual rows (first row of an item carries the numbers).
  type Row = { cells: Record<string, string>; subAmount: number; subVat: number; subTotal: number }
  const descWidth = Math.min(coords.single.itemRows.descWidth, coords.mid.itemRows.descWidth, coords.final.itemRows.descWidth)
  const rows: Row[] = []
  for (const it of q.items) {
    const lines = wrap(it.description, descWidth, coords.single.itemRows.cols.description?.size ?? 6)
    // Word vertically centres the row, so qty/amounts sit on the middle line of
    // a multi-line description (matches the n8n output).
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

  // Background page indices: [single, mid, final, terms]
  const kinds: Array<'single' | 'mid' | 'final'> = pageCount === 1
    ? ['single']
    : [...Array(pageCount - 1).fill('mid') as 'mid'[], 'final']
  const BG_INDEX = { single: 0, mid: 1, final: 2 } as const

  // Header / footer / totals values shared by every page kind.
  const grandFields: Record<string, string> = {
    name: q.customer.name,
    emirates: q.customer.emirates,
    trnno: q.customer.trnNo,
    date: q.dateFormatted,
    invoiceno: q.customer.invoiceNo,
    placeofsupply: q.requestedBy,
    yachtname: q.yachtName,
    yachtpo: q.yachtPO,
    currency: q.bankDetail,
    newcurrency: q.displayCurrency,
    bank: q.bank.bankName,
    acct: q.bank.accountNumber,
    iban: q.bank.iban,
    // Zero values render blank, matching the n8n output.
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

    // Header fields (repeated on every item page in the template).
    const PAGE_TOTAL_KEYS = new Set(['totalamount', 'totalvat', 'totalltotalamount', 'totalamount1', 'totalvat1', 'totalltotalamount1'])
    for (const [key, f] of Object.entries(pc.fields)) {
      if (key === 'address' || PAGE_TOTAL_KEYS.has(key)) continue
      draw(page, f, grandFields[key] ?? '', WHITE_FIELDS.has(key))
    }
    // Centred black-bar labels containing the currency (Word re-centred these
    // when the placeholders were blanked): black-out and redraw whole.
    for (const rl of (pc as any).relabels ?? []) {
      const value = grandFields[rl.key] ?? ''
      if (!value) continue
      const label = String(rl.template).replace('%', value)
      const size = 7
      const w = bold.widthOfTextAtSize(label, size)
      page.drawRectangle({ x: rl.centerX - (rl.w + 28) / 2, y: rl.y - 2.5, width: rl.w + 28, height: size + 5, color: BLACK })
      page.drawText(label, { x: rl.centerX - w / 2, y: rl.y, size, font: bold, color: WHITE })
    }

    // Address: wrap up to 3 lines below its anchor.
    const addrField = pc.fields['address']
    if (addrField) {
      // 170pt keeps the wrap inside the QUOTE TO box border.
      wrap(q.customer.address, 170, addrField.size).slice(0, 3).forEach((ln, i) => {
        draw(page, { ...addrField, y: addrField.y - i * ADDRESS_LINE_PITCH }, ln)
      })
    }

    // Items.
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

    // Page totals bar (black → white text). Mid pages use the "…1" fields.
    const t = (base: string) => pc.fields[base] ?? pc.fields[`${base}1`]
    if (t('totalamount')) draw(page, t('totalamount')!, fmtAlways(subA), true)
    if (t('totalvat')) draw(page, t('totalvat')!, fmt(subV), true)
    if (t('totalltotalamount')) draw(page, t('totalltotalamount')!, fmtAlways(subT), true)

    // Page numbers are baked as "Page 1 of 1" / "Page 1 of 2" / "Page 2 of 2" —
    // correct for 1- and 2-page quotes; redraw for 3+ item pages.
    if (pageCount > 2 && pc.pageNo) {
      const b = pc.pageNo
      page.drawRectangle({ x: b.x - 1, y: b.y - 1.5, width: b.w + 14, height: b.h + 4, color: WHITE })
      const label = `Page ${pi + 1} of ${pageCount}`
      page.drawText('Page ', { x: b.x, y: b.y, size: 5.2, font: bold, color: BLACK })
      page.drawText(`${pi + 1} of ${pageCount}`, { x: b.x + bold.widthOfTextAtSize('Page ', 5.2), y: b.y, size: 5.2, font, color: BLACK })
      void label
    }
  }

  // Terms & Conditions page (static, last page of the background).
  const [terms] = await pdf.copyPages(src, [3])
  pdf.addPage(terms)

  return pdf.save()
}

// ── Fallback renderer (original native layout, used only if the template
//    background cannot be loaded) ───────────────────────────────────────────────
const NAVY = rgb(0.03, 0.16, 0.28)
const GREY = rgb(0.45, 0.45, 0.45)
const LINE = rgb(0.75, 0.78, 0.82)

export async function buildQuotationPdfBasic(q: QuoteData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const PW = 595.28, PH = 841.89, M = 40
  const cols = [
    { key: 'qty', label: 'QTY', w: 32, align: 'center' as const },
    { key: 'description', label: 'DESCRIPTION', w: 213, align: 'left' as const },
    { key: 'unitRate', label: 'UNIT RATE', w: 58, align: 'right' as const },
    { key: 'amount', label: 'AMOUNT', w: 60, align: 'right' as const },
    { key: 'vatPercent', label: 'VAT %', w: 34, align: 'center' as const },
    { key: 'vatValue', label: 'VAT', w: 56, align: 'right' as const },
    { key: 'totalAmount', label: 'TOTAL', w: 62, align: 'right' as const },
  ]
  const tableW = cols.reduce((s, c) => s + c.w, 0)
  const FS = 7.5, ROW_PAD = 3

  // Wrap a description to the column width (precise glyph metrics — no lookup tables).
  const wrap = (text: string, width: number, size: number): string[] => {
    const out: string[] = []
    for (const hard of String(text).split(/\r?\n/)) {
      const t = hard.trim()
      if (!t) { if (out.length && out[out.length - 1] !== '') out.push(''); continue }
      let rest = t
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
    while (out.length && out[0] === '') out.shift()
    while (out.length && out[out.length - 1] === '') out.pop()
    return out.length ? out : ['']
  }

  // Pre-render every item into visual rows (first row carries the numbers).
  type Row = { cells: Record<string, string>; subAmount: number; subVat: number; subTotal: number }
  const rows: Row[] = []
  for (const it of q.items) {
    const descLines = wrap(it.description, cols[1].w - 8, FS)
    descLines.forEach((ln, i) => {
      rows.push({
        cells: {
          qty: i === 0 && it.qty !== '' ? String(it.qty) : '',
          description: ln,
          unitRate: i === 0 && !it.isDescriptionOnly ? fmt(it.unitRate) : '',
          amount: i === 0 && !it.isDescriptionOnly ? fmt(it.amount) : '',
          vatPercent: i === 0 && !it.isDescriptionOnly ? it.vatPercent : '',
          vatValue: i === 0 && !it.isDescriptionOnly ? fmt(it.vatValue) : '',
          totalAmount: i === 0 && !it.isDescriptionOnly ? fmt(it.totalAmount) : '',
        },
        subAmount: i === 0 && !it.isDescriptionOnly ? it.amount : 0,
        subVat: i === 0 && !it.isDescriptionOnly ? it.vatValue : 0,
        subTotal: i === 0 && !it.isDescriptionOnly ? it.totalAmount : 0,
      })
    })
  }

  const ROWS_PER_PAGE = 35
  const pages: Row[][] = []
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) pages.push(rows.slice(i, i + ROWS_PER_PAGE))
  if (pages.length === 0) pages.push([])
  const pageCount = pages.length

  const text = (page: any, s: string, x: number, y: number, size = FS, f = font, color = NAVY) =>
    page.drawText(s ?? '', { x, y, size, font: f, color })
  const rightText = (page: any, s: string, xRight: number, y: number, size = FS, f = font, color = NAVY) =>
    page.drawText(s ?? '', { x: xRight - f.widthOfTextAtSize(s ?? '', size), y, size, font: f, color })

  pages.forEach((pageRows, pi) => {
    const page = pdf.addPage([PW, PH])
    let y = PH - M

    // ── Header ──
    text(page, 'JLS YACHTS LLC', M, y - 4, 15, bold)
    rightText(page, 'QUOTATION', PW - M, y - 4, 15, bold)
    y -= 20
    text(page, 'Port Operations & Agency · Dubai, UAE', M, y, 7, font, GREY)
    y -= 16
    page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 1, color: NAVY })
    y -= 14

    // Customer block (left) + meta block (right)
    const metaX = PW - M - 200
    text(page, 'TO', M, y, 6.5, bold, GREY)
    const metaRows: Array<[string, string]> = [
      ['Quotation No', q.customer.invoiceNo],
      ['Date', q.dateFormatted],
      ...(q.yachtName ? [['Yacht', q.yachtName] as [string, string]] : []),
      ...(q.yachtPO ? [['Yacht PO', q.yachtPO] as [string, string]] : []),
      ...(q.requestedBy ? [['Requested By', q.requestedBy] as [string, string]] : []),
      ['Currency', q.displayCurrency],
    ]
    let my = y
    for (const [k, v] of metaRows) {
      text(page, k, metaX, my, 7, bold, GREY)
      rightText(page, v, PW - M, my, 7.5, font)
      my -= 11
    }
    y -= 11
    text(page, q.customer.name, M, y, 9, bold); y -= 11
    for (const ln of wrap(q.customer.address, 240, 7.5).slice(0, 3)) { text(page, ln, M, y, 7.5, font, GREY); y -= 9.5 }
    text(page, q.customer.emirates, M, y, 7.5, font, GREY)
    y = Math.min(y, my) - 14

    // ── Table header ──
    page.drawRectangle({ x: M, y: y - 4, width: tableW, height: 14, color: NAVY })
    let x = M
    for (const c of cols) {
      const lx = c.align === 'right' ? x + c.w - 4 - bold.widthOfTextAtSize(c.label, 6.5)
        : c.align === 'center' ? x + (c.w - bold.widthOfTextAtSize(c.label, 6.5)) / 2 : x + 4
      page.drawText(c.label, { x: lx, y, size: 6.5, font: bold, color: rgb(1, 1, 1) })
      x += c.w
    }
    y -= 4

    // ── Rows ──
    const rowH = FS + ROW_PAD * 2 - 1
    let subA = 0, subV = 0, subT = 0
    for (const r of pageRows) {
      y -= rowH
      page.drawLine({ start: { x: M, y: y - ROW_PAD + 1 }, end: { x: M + tableW, y: y - ROW_PAD + 1 }, thickness: 0.4, color: LINE })
      x = M
      for (const c of cols) {
        const v = r.cells[c.key] ?? ''
        if (v) {
          const vx = c.align === 'right' ? x + c.w - 4 - font.widthOfTextAtSize(v, FS)
            : c.align === 'center' ? x + (c.w - font.widthOfTextAtSize(v, FS)) / 2 : x + 4
          page.drawText(v, { x: vx, y, size: FS, font, color: NAVY })
        }
        x += c.w
      }
      subA += r.subAmount; subV += r.subVat; subT += r.subTotal
    }

    // ── Page subtotal ──
    y -= rowH + 2
    page.drawLine({ start: { x: M, y: y + rowH - 4 }, end: { x: M + tableW, y: y + rowH - 4 }, thickness: 0.8, color: NAVY })
    text(page, pageCount > 1 ? `Page subtotal` : 'Subtotal', M + 4, y, 7, bold)
    const colRight = (idx: number) => M + cols.slice(0, idx + 1).reduce((s, c) => s + c.w, 0) - 4
    rightText(page, fmtAlways(subA), colRight(3), y, FS, bold)
    rightText(page, fmtAlways(subV), colRight(5), y, FS, bold)
    rightText(page, fmtAlways(subT), colRight(6), y, FS, bold)

    // ── Final page: grand totals, VAT breakdown, bank details ──
    if (pi === pageCount - 1) {
      y -= 20
      const boxX = PW - M - 230
      const totalRow = (label: string, value: string, strong = false) => {
        text(page, label, boxX, y, strong ? 8 : 7.5, strong ? bold : font, strong ? NAVY : GREY)
        rightText(page, value, PW - M, y, strong ? 8.5 : 7.5, strong ? bold : font)
        y -= 12
      }
      totalRow('Total Amount', fmtAlways(q.grandAmount))
      totalRow('Total VAT', fmtAlways(q.grandVat))
      totalRow(`GRAND TOTAL (${q.displayCurrency.startsWith('AED') ? 'AED' : q.displayCurrency})`, fmtAlways(q.grandTotal), true)
      if (q.convertedTotal != null && q.convertedCurrency) {
        totalRow(`Total (${q.convertedCurrency}) @ ${q.conversionRate}`, `${q.convertedSign}${fmtAlways(q.convertedTotal)}`, true)
      }

      // VAT breakdown (left)
      let vy = y + 12 * (q.convertedTotal != null ? 4 : 3) + 8
      text(page, 'VAT SUMMARY', M, vy, 6.5, bold, GREY); vy -= 11
      const vatRow = (label: string, v: string) => { text(page, label, M, vy, 7, font, GREY); rightText(page, v, M + 190, vy, 7, font); vy -= 10 }
      vatRow('Taxable Amount @ 5%', fmtAlways(q.vat5Base))
      vatRow('Taxable Amount @ 0%', fmtAlways(q.vat0Base))
      vatRow('Non Taxable Amount', fmtAlways(q.nonTaxable))
      vatRow('VAT @ 5%', fmtAlways(q.vat5Value))

      // Bank details
      y = Math.min(y, vy) - 14
      text(page, 'BANK DETAILS', M, y, 6.5, bold, GREY); y -= 11
      text(page, q.bank.bankName, M, y, 7.5, bold); y -= 10
      text(page, `Account: ${q.bank.accountNumber}   ·   IBAN: ${q.bank.iban}   ·   Account currency: ${q.bankDetail}`, M, y, 7, font, GREY)
    }

    // Footer
    rightText(page, `Page ${pi + 1} of ${pageCount}`, PW - M, M - 14, 7, font, GREY)
    text(page, `Quotation ${q.customer.invoiceNo} — JLS Yachts LLC`, M, M - 14, 7, font, GREY)
  })

  return pdf.save()
}

// ── XLSX generation (minimal OOXML, stored zip — dependency-free) ─────────────
function crc32(buf: Uint8Array): number {
  let c: number
  const table = crcTable ?? (crcTable = (() => {
    const t = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    return t
  })())
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}
let crcTable: Int32Array | null = null

/** Build a ZIP with STORED (uncompressed) entries — enough for a small XLSX. */
function buildZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const num = (v: number, bytes: number) => {
    const a = new Uint8Array(bytes)
    for (let i = 0; i < bytes; i++) a[i] = (v >>> (8 * i)) & 0xff
    return a
  }
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const local = new Uint8Array([
      ...num(0x04034b50, 4), ...num(20, 2), ...num(0, 2), ...num(0, 2), ...num(0, 2), ...num(0, 2),
      ...num(crc, 4), ...num(f.data.length, 4), ...num(f.data.length, 4), ...num(name.length, 2), ...num(0, 2),
      ...name,
    ])
    chunks.push(local, f.data)
    central.push(new Uint8Array([
      ...num(0x02014b50, 4), ...num(20, 2), ...num(20, 2), ...num(0, 2), ...num(0, 2), ...num(0, 2), ...num(0, 2),
      ...num(crc, 4), ...num(f.data.length, 4), ...num(f.data.length, 4), ...num(name.length, 2), ...num(0, 2), ...num(0, 2),
      ...num(0, 2), ...num(0, 2), ...num(0, 4), ...num(offset, 4), ...name,
    ]))
    offset += local.length + f.data.length
  }
  const centralStart = offset
  let centralLen = 0
  for (const c of central) { chunks.push(c); centralLen += c.length }
  chunks.push(new Uint8Array([
    ...num(0x06054b50, 4), ...num(0, 2), ...num(0, 2), ...num(files.length, 2), ...num(files.length, 2),
    ...num(centralLen, 4), ...num(centralStart, 4), ...num(0, 2),
  ]))
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let p = 0
  for (const c of chunks) { out.set(c, p); p += c.length }
  return out
}

const xml = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function buildQuotationXlsx(q: QuoteData): Uint8Array {
  type Cell = { v: string | number; num?: boolean }
  const sheetRows: Cell[][] = [
    [{ v: 'JLS YACHTS LLC — QUOTATION' }],
    [{ v: 'Quotation No' }, { v: q.customer.invoiceNo }],
    [{ v: 'Date' }, { v: q.dateFormatted }],
    [{ v: 'Customer' }, { v: q.customer.name }],
    ...(q.yachtName ? [[{ v: 'Yacht' }, { v: q.yachtName }] as Cell[]] : []),
    ...(q.yachtPO ? [[{ v: 'Yacht PO' }, { v: q.yachtPO }] as Cell[]] : []),
    ...(q.requestedBy ? [[{ v: 'Requested By' }, { v: q.requestedBy }] as Cell[]] : []),
    [{ v: 'Currency' }, { v: q.displayCurrency }],
    [],
    [{ v: 'QTY' }, { v: 'Description' }, { v: 'Unit Rate' }, { v: 'Amount' }, { v: 'VAT %' }, { v: 'VAT Value' }, { v: 'Total Amount' }],
    ...q.items.map((it): Cell[] => it.isDescriptionOnly
      ? [{ v: '' }, { v: it.description }]
      : [
          { v: it.qty === '' ? '' : Number(it.qty), num: it.qty !== '' },
          { v: it.description },
          { v: it.unitRate, num: true }, { v: it.amount, num: true },
          { v: it.vatPercent }, { v: it.vatValue, num: true }, { v: it.totalAmount, num: true },
        ]),
    [],
    [{ v: '' }, { v: 'Total Amount' }, { v: '' }, { v: q.grandAmount, num: true }, { v: '' }, { v: q.grandVat, num: true }, { v: q.grandTotal, num: true }],
    ...(q.convertedTotal != null ? [[{ v: '' }, { v: `Total (${q.convertedCurrency}) @ ${q.conversionRate}` }, { v: '' }, { v: '' }, { v: '' }, { v: '' }, { v: +q.convertedTotal.toFixed(2), num: true }] as Cell[]] : []),
    [],
    [{ v: 'Taxable @ 5%' }, { v: q.vat5Base, num: true }],
    [{ v: 'Taxable @ 0%' }, { v: q.vat0Base, num: true }],
    [{ v: 'Non taxable' }, { v: q.nonTaxable, num: true }],
    [{ v: 'VAT @ 5%' }, { v: q.vat5Value, num: true }],
    [],
    [{ v: 'Bank' }, { v: q.bank.bankName }],
    [{ v: 'Account' }, { v: q.bank.accountNumber }],
    [{ v: 'IBAN' }, { v: q.bank.iban }],
  ]

  const colLetter = (i: number) => String.fromCharCode(65 + i)
  const rowsXml = sheetRows.map((cells, ri) =>
    `<row r="${ri + 1}">` + cells.map((c, ci) =>
      c.num
        ? `<c r="${colLetter(ci)}${ri + 1}"><v>${Number(c.v) || 0}</v></c>`
        : `<c r="${colLetter(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(c.v)}</t></is></c>`,
    ).join('') + '</row>',
  ).join('')

  const enc = new TextEncoder()
  return buildZip([
    { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>') },
    { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: 'xl/workbook.xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Quotation" sheetId="1" r:id="rId1"/></sheets></workbook>') },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>') },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="2" width="60" customWidth="1"/><col min="3" max="7" width="14" customWidth="1"/></cols><sheetData>${rowsXml}</sheetData></worksheet>`) },
  ])
}

// ── Orchestration: loop-guard → generate → attach → cleanup ───────────────────
export async function runEstimateDocgen(entityId: string, rawType: string): Promise<string> {
  if (!qboConfigured()) return 'qbo-not-configured'
  const sb = admin() as any

  // Own toggle (Automations → "QB Quotation/Estimate — document generation"),
  // default OFF so estimates can be cut over independently of the main switch.
  const { data: auto } = await sb.from('automations').select('enabled').eq('key', 'qb-estimate-doc').maybeSingle()
  if (!auto) {
    await sb.from('automations').insert({
      key: 'qb-estimate-doc',
      name: 'QB Quotation/Estimate — document generation',
      description: 'Fully native port of the n8n QB (Quotation/Estimate) workflow: on estimate created/updated, generates the branded Quotation PDF + XLSX on the worker and attaches both to the estimate in QuickBooks, replacing any previous versions. No n8n, Google Drive or ConvertAPI involved.',
      category: 'QuickBooks / Finance', source: 'worker', trigger_type: 'webhook', enabled: false,
    })
    return 'docgen-disabled (toggle "QB Quotation/Estimate — document generation" in Automations)'
  }
  if (!auto.enabled) return 'docgen-disabled'

  const fetched = await qboRequest('GET', `/estimate/${entityId}?include=enhancedAllCustomFields&minorversion=73`)
  const estimate = fetched?.Estimate
  if (!estimate) return 'estimate-not-found'
  const lastUpdated = String(estimate.MetaData?.LastUpdatedTime ?? '')
  const createTime = String(estimate.MetaData?.CreateTime ?? '')

  // Loop-guard (port of the n8n "QBO Logs" checks): skip events caused by our
  // own attachment writes, and don't re-process a creation we've already seen.
  const { data: log } = await sb.from('qbo_doc_logs')
    .select('id, last_updated_time, del_last_updated_time, create_last_updated_time')
    .eq('doc_type', 'Estimate').eq('doc_id', String(entityId)).maybeSingle()

  const isCreate = rawType.includes('.created')
  if (isCreate && log) return 'skip-already-created'
  if (!isCreate && log && (
    log.last_updated_time === lastUpdated ||
    log.del_last_updated_time === lastUpdated ||
    log.create_last_updated_time === lastUpdated
  )) return 'skip-own-echo'

  // Existing "Quotation - …" attachments (to supersede after the new upload).
  const attachQuery = `SELECT * FROM Attachable WHERE AttachableRef.EntityRef.Type = 'Estimate' AND AttachableRef.EntityRef.value = '${String(entityId).replace(/'/g, "''")}'`
  const existingRes = await qboQuery(attachQuery)
  const docNumber = String(estimate.DocNumber || estimate.Id)
  const isOurQuotationFile = (a: any) => {
    const fn = String(a.FileName ?? '')
    return fn.startsWith('Quotation') && fn.includes(docNumber) && (/\.pdf$/i.test(fn) || /\.xlsx$/i.test(fn))
  }
  const old = ((existingRes?.QueryResponse?.Attachable ?? []) as any[]).filter(isOurQuotationFile)

  // Customer TRN (shown in the QUOTE TO box, like the n8n flow's customer lookup).
  let trnNo = ''
  const custId = estimate.CustomerRef?.value
  if (custId) {
    const cust = await qboRequest('GET', `/customer/${custId}?minorversion=73`).catch(() => null)
    trnNo = String(cust?.Customer?.PrimaryTaxIdentifier ?? '')
  }

  // Transform + generate + attach.
  const data = transformEstimate(estimate, { trnNo })
  const pdfBytes = await buildQuotationPdf(data)
  const xlsxBytes = buildQuotationXlsx(data)
  const newPdf = await qboUpload(`Quotation - ${docNumber}.pdf`, pdfBytes, 'application/pdf', 'Estimate', String(entityId))
  const newXlsx = await qboUpload(`Quotation - ${docNumber}.xlsx`, xlsxBytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Estimate', String(entityId))
  const keepIds = new Set([newPdf?.Id, newXlsx?.Id].filter(Boolean).map(String))

  // Delete superseded attachments (best-effort). QBO's Attachable query index is
  // eventually consistent: the file the PREVIOUS run uploaded last (the xlsx) can
  // still be missing from the pre-upload snapshot and would survive as a duplicate.
  // Re-query after the upload, union both snapshots, and delete everything that
  // matches except the two files we just uploaded.
  const afterRes = await qboQuery(attachQuery).catch(() => null)
  const supersede = new Map<string, any>()
  for (const a of [...old, ...(((afterRes?.QueryResponse?.Attachable ?? []) as any[]).filter(isOurQuotationFile))]) {
    if (a?.Id && !keepIds.has(String(a.Id))) supersede.set(String(a.Id), a)
  }
  let deleted = 0
  for (const a of supersede.values()) {
    try {
      await qboRequest('POST', '/attachable?operation=delete&minorversion=73', {
        Id: String(a.Id), SyncToken: String(a.SyncToken), domain: 'QBO',
        AttachableRef: a.AttachableRef,
      })
      deleted++
    } catch { /* best-effort */ }
  }

  // Record the post-attachment LastUpdatedTime so the echo webhooks are skipped.
  const after = await qboRequest('GET', `/estimate/${entityId}?minorversion=73`).catch(() => null)
  const newStamp = String(after?.Estimate?.MetaData?.LastUpdatedTime ?? lastUpdated)
  await sb.from('qbo_doc_logs').upsert({
    doc_type: 'Estimate', doc_id: String(entityId), doc_number: docNumber,
    last_updated_time: newStamp, del_last_updated_time: newStamp,
    create_last_updated_time: createTime, updated_at: new Date().toISOString(),
  }, { onConflict: 'doc_type,doc_id' })

  const result = `docgen-ok pdf+xlsx attached${deleted ? `, ${deleted} old removed` : ''}`
  // Stamp this automation's own card so it reflects real activity (rather than
  // being folded only into the qb-webhook summary and reading "Last run: Never").
  await logAutomationRun({
    key: 'qb-estimate-doc', name: 'QB Quotation/Estimate — document generation',
    source: 'worker', trigger_type: 'webhook', category: 'Finance',
    status: 'success', detail: `Q ${docNumber}: ${result}`,
  })
  return result
}
