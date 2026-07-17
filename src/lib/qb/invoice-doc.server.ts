/**
 * QB Invoice document generator — full native port of the n8n "QB Invoice"
 * workflow. No n8n, no OneDrive templates, no ConvertAPI:
 *
 *   1. Fetch the invoice from QBO (enhancedAllCustomFields).
 *   2. Skip if we already generated for this LastUpdatedTime (attach-echo guard).
 *   3. Transform: custom fields (Yacht.Name/PO, Currency, Conversion Rate, Bank
 *      Detail, Requested By, Customer TRN, Place of Supply), tax-code mapping,
 *      line items incl. description-only rows.
 *   4. Render the JLS Yachts invoice with pdf-lib as a faithful reproduction of
 *      the original Word templates (assets/N8N/TAX INVOICE *): every position,
 *      column width, font size and image was measured from the template files
 *      and their Word-rendered PDFs. 35 item lines per page, per-page subtotal
 *      bar, grand-total bar + VAT breakdown on the last page, currency
 *      conversion row and the matching Emirates NBD bank details.
 *   5. Delete the previous "Invoice - <no>.pdf" attachments on the QBO invoice
 *      and upload the fresh one (IncludeOnSend: false).
 *   6. Record the post-attach LastUpdatedTime so the webhook echo is ignored.
 *
 * Gated by the "qb-invoice-pdf" automation toggle (default OFF so it can never
 * double-attach while the n8n workflow is still live).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { createClient } from '@supabase/supabase-js'
import { qboRequest, qboQuery, qboUpload, qboConfigured } from './qbo.server'
import { logAutomationRun } from '@/lib/automations.server'
import { QB_DOC_IMAGES } from './invoice-assets'

const AUTO_KEY = 'qb-invoice-pdf'

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}

// ── Mappings (ported verbatim from the n8n Code nodes) ────────────────────────
const PLACE_OF_SUPPLY: Record<string, string> = { '1': 'Dubai', '2': 'KSA', '3': 'Abu Dhabi', '4': 'Turkey', '5': 'UAE' }
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
const BANKS: Record<string, { bankName: string; accountNumber: string; iban: string }> = {
  USD: { bankName: 'Emirates NBD – Tecom Branch, Dubai, UAE', accountNumber: '102-48474993-02', iban: 'AE32 0260 0010 2484 7499 302' },
  EUR: { bankName: 'Emirates NBD – Barsha Heights (TECOM), Dubai', accountNumber: '102-48474993-03', iban: 'AE05 0260 0010 2484 7499 303' },
  AED: { bankName: 'EMIRATES NBD – TECOM BRANCH, DUBAI UAE', accountNumber: '101-48474993-01', iban: 'AE24 0260 0010 1484 7499 301' },
}
const CURRENCY_SIGN: Record<string, string> = { USD: '$', EUR: '€' }

const fmtNum = (n: number | null | undefined): string =>
  n == null || isNaN(n) || n === 0 ? '' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtMoney = (n: number): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export type InvoiceItem = {
  qty: string; description: string; unitRate: string; amount: string;
  vatPercent: string; vatValue: string; totalAmount: string;
  taxName: string; isDataRow: boolean;
  amountN: number; vatN: number; totalN: number; vatRate: number;
}

export type TransformedInvoice = {
  docNumber: string; qboId: string; lastUpdatedTime: string;
  customer: { name: string; address: string; emirates: string; trn: string }
  invoiceDate: string; placeOfSupply: string; yachtName: string; yachtPO: string;
  requestedBy: string; currency: string; conversionRate: number; bankDetail: string;
  items: InvoiceItem[];
}

/** Port of the n8n "Processing-3 / Processing-" transform. */
export function transformInvoice(invoice: any): TransformedInvoice {
  const docNumber = String(invoice.DocNumber ?? invoice.Id ?? '')
  const billAddr = invoice.BillAddr ?? {}

  let yachtName = '', yachtPO = '', requestedBy = '', trn = '', placeOfSupply = ''
  let currencyType = '1', conversionRate = 1, bankDetailType = '1'
  for (const f of invoice.CustomField ?? []) {
    if (f.Name === 'Yacht.Name') yachtName = f.StringValue ?? ''
    else if (f.Name === 'Yacht.PO') yachtPO = f.StringValue ?? ''
    else if (f.Name === 'Currency') currencyType = f.StringValue || '1'
    else if (f.Name === 'Conversion Rate') conversionRate = Number(f.NumberValue ?? f.StringValue ?? 1) || 1
    else if (f.Name === 'Bank Detail') bankDetailType = f.StringValue || '1'
    else if (f.Name === 'Requested By') requestedBy = f.StringValue ?? ''
    else if (f.Name === 'Customer TRN') trn = f.StringValue ?? ''
    else if (f.Name === 'Place of Supply') placeOfSupply = PLACE_OF_SUPPLY[f.StringValue] ?? f.StringValue ?? ''
    else if (f.Name === 'Sale Location') placeOfSupply = placeOfSupply || (f.StringValue ?? '')
  }

  // Invoice date: TxnDate (business date) preferred, CreateTime as fallback,
  // rendered "July 3, 2026" like the n8n Processing-1 formatter.
  const rawDate = invoice.TxnDate ?? invoice.MetaData?.CreateTime ?? new Date().toISOString()
  const invoiceDate = new Date(rawDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const items: InvoiceItem[] = []
  for (const line of invoice.Line ?? []) {
    if (line.DetailType === 'DescriptionOnly') {
      const description = String(line.Description ?? '').trim()
      if (description) items.push({
        qty: '', description, unitRate: '', amount: '', vatPercent: '', vatValue: '', totalAmount: '',
        taxName: '', isDataRow: false, amountN: 0, vatN: 0, totalN: 0, vatRate: 0,
      })
    } else if (line.DetailType === 'SalesItemLineDetail') {
      const d = line.SalesItemLineDetail ?? {}
      const qtyRaw = line.Qty ?? d.Qty
      const qty = qtyRaw == null || qtyRaw === '' || isNaN(Number(qtyRaw)) ? '' : String(Number(qtyRaw))
      const unitRate = Number(d.UnitPrice ?? 0)
      const amount = Number(line.Amount ?? (Number(qty) || 0) * unitRate)
      const tax = TAX_CODE_MAP[d.TaxCodeRef?.value ?? '19'] ?? TAX_CODE_MAP['19']
      const vatValue = tax.rate > 0 ? +(amount * tax.rate / 100).toFixed(2) : 0
      const total = +(amount + vatValue).toFixed(2)
      items.push({
        qty,
        description: String(line.Description ?? d.ItemRef?.name ?? '').trim(),
        unitRate: fmtNum(unitRate), amount: fmtNum(amount),
        vatPercent: tax.rate > 0 ? `${tax.rate}%` : (tax.name.includes('0%') ? '0%' : ''),
        vatValue: fmtNum(vatValue), totalAmount: fmtNum(total),
        taxName: tax.name, isDataRow: true,
        amountN: amount, vatN: vatValue, totalN: total, vatRate: tax.rate,
      })
    }
  }

  return {
    docNumber, qboId: String(invoice.Id), lastUpdatedTime: String(invoice.MetaData?.LastUpdatedTime ?? ''),
    customer: {
      name: invoice.CustomerRef?.name ?? 'Unknown Customer',
      address: [billAddr.Line1, billAddr.Line2, billAddr.Line3, billAddr.City].filter(Boolean).join(' ').trim(),
      emirates: billAddr.City ?? 'Dubai',
      trn,
    },
    invoiceDate, placeOfSupply, yachtName, yachtPO, requestedBy,
    currency: CURRENCY_MAP[currencyType] ?? 'AED',
    conversionRate,
    bankDetail: BANK_DETAIL_MAP[bankDetailType] ?? 'AED',
    items,
  }
}

// ── PDF rendering ──────────────────────────────────────────────────────────────
// Faithful reproduction of the JLS Yachts Word templates. Every constant below
// was measured from the template document.xml (dxa/20 → pt) and cross-checked
// against Word-rendered PDFs of the templates, so the output matches what the
// old n8n + ConvertAPI pipeline produced.
const A4 = { w: 595.32, h: 841.92 }
const BLACK = rgb(0, 0, 0)
const WHITE = rgb(1, 1, 1)

// Main item table (grid 883/4160/1073/1424/793/1003/1548 dxa @ x=25.55, centred)
const TBL_X = 25.55
const TBL_W = 544.2
const COL_W = [44.15, 208, 53.65, 71.2, 39.65, 50.15, 77.4]
const COL_X = COL_W.reduce<number[]>((acc, w, i) => [...acc, (acc[i] ?? TBL_X) + w], [TBL_X])
const COL_LABELS = ['QTY', 'DESCRIPTION', 'UNIT RATE', 'AMOUNT', 'VAT%', 'VAT', 'TOTAL AMOUNT']
const CELL_PAD = 5.4                 // Word TableNormal cell margin (108 dxa)
const HEADER_Y = 202.6               // black header bar top (from page top)
const HEADER_H = 21.36
const LINE0_Y = 224.4                // first item line top
const LINE_PITCH = 10.2              // 6pt Arial + 3.3pt paragraph spacing
const LINES_PER_PAGE = 35
const SUBTOTAL_BAR_Y = 602.4
const SUBTOTAL_BAR_H = 17.04
const GRAND_BAR_H = 8.2              // slimmer bar directly under the subtotal bar
const ITEM_SIZE = 6                  // item rows are 6pt Arial in the template
const LABEL_SIZE = 7                 // everything else is 7pt

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = []
  for (const hard of String(text).split(/\r?\n/)) {
    const line = hard.trim()
    if (!line) { if (out.length && out[out.length - 1] !== '') out.push(''); continue }
    let rest = line
    while (rest.length) {
      if (font.widthOfTextAtSize(rest, size) <= maxWidth) { out.push(rest); break }
      // binary-search the cut point, then back off to the last space
      let lo = 1, hi = rest.length
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (font.widthOfTextAtSize(rest.slice(0, mid), size) <= maxWidth) lo = mid; else hi = mid - 1
      }
      let cut = rest.lastIndexOf(' ', lo)
      if (cut <= 0) cut = lo
      out.push(rest.slice(0, cut).trim())
      rest = rest.slice(cut).trim()
    }
  }
  while (out.length && out[0] === '') out.shift()
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.length ? out : ['']
}

type Company = { name: string; addressLines: string[]; contact: string; website: string; trn: string }

// Letterhead exactly as printed on the Word templates. automations.config.company
// (for qb-invoice-pdf) can override any part without a deploy.
const TEMPLATE_LETTERHEAD: Company = {
  name: 'JLS YACHTS LLC',
  addressLines: ['Office 58-2 Leader Sport Compound, Plot 598-1000', 'DIP 1, P.O.Box 341766, Dubai, United Arab Emirates'],
  contact: 'T: +971(0)4 331 3555 | E: info@jlsyachts.com',
  website: 'Website: www.jlsyachts.com',
  trn: 'TRN NO: 100293518500003',
}

async function companyDetails(): Promise<Company> {
  const sb = admin()
  const { data } = await sb.from('automations').select('config').eq('key', AUTO_KEY).maybeSingle()
  const c = (data?.config as any)?.company ?? {}
  return {
    name: c.name || TEMPLATE_LETTERHEAD.name,
    addressLines: c.address ? String(c.address).split(/\s*\n\s*|\s*\|\s*/).slice(0, 2) : TEMPLATE_LETTERHEAD.addressLines,
    contact: c.phone || c.email
      ? `T: ${c.phone ?? '+971(0)4 331 3555'} | E: ${c.email ?? 'info@jlsyachts.com'}`
      : TEMPLATE_LETTERHEAD.contact,
    website: c.website ? `Website: ${c.website}` : TEMPLATE_LETTERHEAD.website,
    trn: c.trn ? `TRN NO: ${c.trn}` : TEMPLATE_LETTERHEAD.trn,
  }
}

export async function renderInvoicePdf(t: TransformedInvoice, company: Company, title = 'TAX INVOICE'): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)      // metric twin of the template's Arial
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const logo = await doc.embedPng(QB_DOC_IMAGES.logo)
  const divisions = await doc.embedPng(QB_DOC_IMAGES.divisions)
  const badges = await doc.embedPng(QB_DOC_IMAGES.badges)
  const dirham = await doc.embedPng(QB_DOC_IMAGES.dirham)

  // All positions are expressed as distance-from-page-top (like the template
  // measurements); Y() flips to pdf-lib's bottom-origin space.
  const Y = (fromTop: number) => A4.h - fromTop
  const draw = (page: PDFPage, text: string, x: number, yTop: number, opts: { size?: number; font?: PDFFont; color?: any } = {}) =>
    page.drawText(text, { x, y: Y(yTop), size: opts.size ?? LABEL_SIZE, font: opts.font ?? font, color: opts.color ?? BLACK })
  const drawRight = (page: PDFPage, text: string, xRight: number, yTop: number, opts: { size?: number; font?: PDFFont; color?: any } = {}) => {
    const f = opts.font ?? font, s = opts.size ?? LABEL_SIZE
    draw(page, text, xRight - f.widthOfTextAtSize(text, s), yTop, opts)
  }
  const drawCenter = (page: PDFPage, text: string, xCenter: number, yTop: number, opts: { size?: number; font?: PDFFont; color?: any } = {}) => {
    const f = opts.font ?? font, s = opts.size ?? LABEL_SIZE
    draw(page, text, xCenter - f.widthOfTextAtSize(text, s) / 2, yTop, opts)
  }
  const bar = (page: PDFPage, x: number, yTop: number, w: number, h: number) =>
    page.drawRectangle({ x, y: Y(yTop + h), width: w, height: h, color: BLACK })
  const box = (page: PDFPage, x: number, yTop: number, w: number, h: number) =>
    page.drawRectangle({ x, y: Y(yTop + h), width: w, height: h, borderColor: BLACK, borderWidth: 0.6 })
  const vline = (page: PDFPage, x: number, yTop: number, yBottom: number) =>
    page.drawLine({ start: { x, y: Y(yTop) }, end: { x, y: Y(yBottom) }, thickness: 0.6, color: BLACK })

  // Pre-wrap every item into visual line slots (the template has 35 per page).
  type Row = { item: InvoiceItem; line: string; first: boolean }
  const rows: Row[] = []
  for (const item of t.items) {
    const lines = wrapText(item.description, font, ITEM_SIZE, COL_W[1] - 2 * CELL_PAD - 1)
    lines.forEach((line, i) => rows.push({ item, line, first: i === 0 }))
  }
  const pages: Row[][] = []
  for (let i = 0; i < Math.max(rows.length, 1); i += LINES_PER_PAGE) pages.push(rows.slice(i, i + LINES_PER_PAGE))
  const pageCount = pages.length

  const grand = t.items.reduce((a, i) => ({ amount: a.amount + i.amountN, vat: a.vat + i.vatN, total: a.total + i.totalN }),
    { amount: 0, vat: 0, total: 0 })
  const breakdown = t.items.reduce((a, i) => {
    if (!i.isDataRow) return a
    if (i.taxName.includes('@ 5%') || i.vatRate === 5) { a.t5 += i.amountN; a.v5 += i.vatN }
    else if (i.taxName.includes('Non Taxable')) a.non += i.amountN
    else a.t0 += i.amountN
    return a
  }, { t5: 0, t0: 0, non: 0, v5: 0 })

  // Currency variants, exactly like the three template families:
  //  AED            → "(UAE DIRHAMS)" bar + dirham-icon Total Amount
  //  USD / EUR      → "( USD )" bar + "Total Amount $" final row
  //  AED TO USD/EUR → "(UAE DIRHAMS)" bar + AED final row + converted final row
  const isConversion = t.currency.includes('TO')
  const directCurrency = !isConversion && (t.currency === 'USD' || t.currency === 'EUR') ? t.currency : ''
  const targetCurrency = isConversion ? (t.currency.includes('USD') ? 'USD' : 'EUR') : directCurrency
  const barCurrencyLabel = directCurrency ? `Total Amount ( ${directCurrency} )` : 'Total Amount (UAE DIRHAMS)'
  const bankKey = t.bankDetail.includes('USD') ? 'USD' : (t.bankDetail.includes('EUR') ? 'EUR' : 'AED')
  const bank = BANKS[bankKey]
  const converted = isConversion && t.conversionRate ? grand.total / t.conversionRate : 0

  pages.forEach((pageRows, pi) => {
    const page = doc.addPage([A4.w, A4.h])
    const isLast = pi === pageCount - 1

    // ── Letterhead: logo top-left, big title + company block right-aligned ──
    page.drawImage(logo, { x: 24.5, y: Y(18.1 + 54), width: 204, height: 54 })
    drawRight(page, title, 566.5, 45, { size: 30.5, font: bold })
    drawRight(page, company.name, 571.1, 66.5, { size: 10.5, font: bold })
    const letterhead = [...company.addressLines, company.contact, company.website, company.trn]
    letterhead.forEach((l, i) => drawRight(page, l, 571.1, 76 + i * 8.6, { size: LABEL_SIZE }))

    // ── INVOICE TO (left) ──
    const INV_X = 25.92, INV_W = 214.61
    bar(page, INV_X, 106.2, INV_W, 14.04)
    drawCenter(page, 'INVOICE TO', INV_X + INV_W / 2, 116, { font: bold, color: WHITE })
    const invLabelX = INV_X + CELL_PAD, invValueX = INV_X + 38.45 + CELL_PAD
    draw(page, 'Name', invLabelX, 129.5); draw(page, t.customer.name, invValueX, 129.5)
    draw(page, 'Address', invLabelX, 142.8)
    wrapText(t.customer.address, font, LABEL_SIZE, INV_W - 38.45 - 2 * CELL_PAD).slice(0, 3)
      .forEach((l, i) => draw(page, l, invValueX, 142.8 + i * 8.6))
    draw(page, 'Emirates', invLabelX, 171.6); draw(page, t.customer.emirates, invValueX, 171.6)
    draw(page, 'TRN No', invLabelX, 185.9); draw(page, t.customer.trn, invValueX, 185.9)
    box(page, INV_X, 106.2, INV_W, 84.2)

    // ── Date / Invoice No / Place of Supply (right) + page number ──
    const DX = 379.5
    const dateRows: Array<[string, string]> = [
      ['Date', t.invoiceDate], ['Invoice No', t.docNumber], ['Place of Supply', t.placeOfSupply],
    ]
    dateRows.forEach(([k, v], i) => {
      const yTop = 140.5 + i * 11.35
      draw(page, k, DX, yTop, { font: bold })
      draw(page, ':', DX + 66, yTop, { font: bold })
      draw(page, v, DX + 72, yTop)
    })
    drawCenter(page, `Page ${pi + 1} of ${pageCount}`, 451.4, 183)

    // ── Item table: black header bar with white centred labels ──
    bar(page, TBL_X, HEADER_Y, TBL_W, HEADER_H)
    COL_LABELS.forEach((label, c) =>
      drawCenter(page, label, (COL_X[c] + COL_X[c + 1]) / 2, HEADER_Y + HEADER_H / 2 + 2.5, { color: WHITE }))

    // Column separators + outer edges down the item area
    for (let c = 0; c <= 7; c++) vline(page, COL_X[c], HEADER_Y + HEADER_H, SUBTOTAL_BAR_Y)

    // ── 35 item line slots (6pt, template alignments per column) ──
    const sub = { amount: 0, vat: 0, total: 0 }
    pageRows.forEach((row, i) => {
      const yTop = LINE0_Y + i * LINE_PITCH + 5.9
      if (row.first) {
        drawCenter(page, row.item.qty, (COL_X[0] + COL_X[1]) / 2, yTop, { size: ITEM_SIZE })
        drawRight(page, row.item.unitRate, COL_X[3] - CELL_PAD, yTop, { size: ITEM_SIZE })
        drawRight(page, row.item.amount, COL_X[4] - CELL_PAD, yTop, { size: ITEM_SIZE })
        drawCenter(page, row.item.vatPercent, (COL_X[4] + COL_X[5]) / 2, yTop, { size: ITEM_SIZE })
        drawRight(page, row.item.vatValue, COL_X[6] - CELL_PAD, yTop, { size: ITEM_SIZE })
        drawRight(page, row.item.totalAmount, COL_X[7] - CELL_PAD, yTop, { size: ITEM_SIZE })
        if (row.item.isDataRow) { sub.amount += row.item.amountN; sub.vat += row.item.vatN; sub.total += row.item.totalN }
      }
      draw(page, row.line, COL_X[1] + CELL_PAD, yTop, { size: ITEM_SIZE })
    })

    // ── Per-page subtotal bar (grand totals bar under it on the last page) ──
    bar(page, TBL_X, SUBTOTAL_BAR_Y, TBL_W, SUBTOTAL_BAR_H)
    const sbY = SUBTOTAL_BAR_Y + SUBTOTAL_BAR_H / 2 + 2.5
    drawCenter(page, barCurrencyLabel, (TBL_X + COL_X[3]) / 2, sbY, { color: WHITE })
    drawRight(page, fmtNum(sub.amount), COL_X[4] - CELL_PAD, sbY, { color: WHITE })
    drawRight(page, fmtNum(sub.vat), COL_X[6] - CELL_PAD, sbY, { color: WHITE })
    drawRight(page, fmtNum(sub.total), COL_X[7] - CELL_PAD, sbY, { color: WHITE })

    const hasGrandBar = isLast && pageCount > 1
    if (hasGrandBar) {
      const gTop = SUBTOTAL_BAR_Y + SUBTOTAL_BAR_H
      bar(page, TBL_X, gTop, TBL_W, GRAND_BAR_H)
      const gY = gTop + GRAND_BAR_H / 2 + 2.1
      drawCenter(page, `Grand ${barCurrencyLabel}`, (TBL_X + COL_X[3]) / 2, gY, { size: 5.8, color: WHITE })
      drawRight(page, fmtNum(grand.amount), COL_X[4] - CELL_PAD, gY, { size: 5.8, color: WHITE })
      drawRight(page, fmtNum(grand.vat), COL_X[6] - CELL_PAD, gY, { size: 5.8, color: WHITE })
      drawRight(page, fmtNum(grand.total), COL_X[7] - CELL_PAD, gY, { size: 5.8, color: WHITE })
    }

    // ── BANK DETAILS (bottom left, every page) ──
    const BK_X = 26.04, BK_W = 233.21, BK_DIV = BK_X + 44.75
    bar(page, BK_X, 627.7, BK_W, 14.04)
    drawCenter(page, `BANK DETAILS ( ${t.bankDetail} )`, BK_X + BK_W / 2, 637.4, { font: bold, color: WHITE })
    const bankRows: Array<[string, string]> = [
      ['NAME', 'JLS YACHTS LLC'], ['BANK', bank.bankName], ['ACCT.#', bank.accountNumber],
      ['IBAN', bank.iban], ['SWIFT', 'EBILAEAD'],
    ]
    bankRows.forEach(([k, v], i) => {
      const yTop = 641.74 + i * 12.3 + 8.8
      draw(page, k, BK_X + CELL_PAD, yTop)
      draw(page, v, BK_DIV + CELL_PAD, yTop)
    })
    box(page, BK_X, 627.7, BK_W, 14.04 + 5 * 12.3 + 3)
    vline(page, BK_DIV, 641.74, 627.7 + 14.04 + 5 * 12.3 + 3)

    // ── VAT summary + Total Amount bar(s) (bottom right, last page only) ──
    if (isLast) {
      const VX = 352.63, LBL_W = 137.42, VAL_W = 80.05
      const vTop0 = hasGrandBar ? 629.1 : 626.4
      const vRows: Array<[string, string, number]> = [
        ['Taxable Amount @ 5%', fmtNum(breakdown.t5), 14.85],
        ['Taxable Amount @ 0%', fmtNum(breakdown.t0), 12.75],
        ['Non Taxable Amount', fmtNum(breakdown.non), 11.45],
        ['5% VAT', fmtNum(breakdown.v5), 12.35],
      ]
      let vy = vTop0
      for (const [label, value, h] of vRows) {
        box(page, VX, vy, LBL_W, h)
        box(page, VX + LBL_W, vy, VAL_W, h)
        drawCenter(page, label, VX + LBL_W / 2, vy + h / 2 + 2.5, { font: bold })
        drawRight(page, value, VX + LBL_W + VAL_W - CELL_PAD, vy + h / 2 + 2.5, { font: bold })
        vy += h
      }
      const finalBar = (label: string, value: string, withDirhamIcon: boolean) => {
        bar(page, VX, vy, LBL_W + VAL_W, 16.92)
        const byTop = vy + 16.92 / 2 + 2.5
        // Label and dirham icon are centred together as one unit, like the template.
        const labelW = bold.widthOfTextAtSize(label, LABEL_SIZE)
        const unitW = labelW + (withDirhamIcon ? 11.9 : 0)
        const startX = VX + LBL_W / 2 - unitW / 2
        draw(page, label, startX, byTop, { font: bold, color: WHITE })
        if (withDirhamIcon) page.drawImage(dirham, { x: startX + labelW + 3, y: Y(vy + 4.2 + 8.7), width: 8.9, height: 8.7 })
        drawRight(page, value, VX + LBL_W + VAL_W - CELL_PAD, byTop, { font: bold, color: WHITE })
        vy += 16.92
      }
      if (directCurrency) {
        finalBar(`Total Amount ${CURRENCY_SIGN[directCurrency] ?? ''}`, fmtNum(grand.total), false)
      } else {
        finalBar('Total Amount', fmtNum(grand.total), true)
        if (isConversion && converted) finalBar(`Total Amount ${CURRENCY_SIGN[targetCurrency] ?? ''}`, fmtNum(converted), false)
      }
    }

    // ── Footer strip: divisions banner + certification badges (every page) ──
    page.drawImage(divisions, { x: 21.4, y: Y(735.0 + 66.8), width: 554.3, height: 66.8 })
    page.drawImage(badges, { x: 377.6, y: Y(801.1 + 39), width: 199.3, height: 39 })
  })

  return doc.save()
}

// ── Attachment cycle + orchestration entry point ──────────────────────────────

async function deleteOldPdfs(qboId: string, docNumber: string, excludeId?: string): Promise<number> {
  const res = await qboQuery(`SELECT * FROM Attachable WHERE AttachableRef.EntityRef.Type = 'Invoice' AND AttachableRef.EntityRef.value = '${qboId}'`)
  const old = (res?.QueryResponse?.Attachable ?? []).filter((a: any) => {
    const f = String(a.FileName ?? '')
    if (excludeId && String(a.Id) === excludeId) return false
    return f.startsWith('Invoice -') && f.includes(docNumber) && f.toLowerCase().endsWith('.pdf')
  })
  let deleted = 0
  for (const a of old) {
    try {
      await qboRequest('POST', `/attachable?operation=delete&minorversion=73`, {
        Id: a.Id, SyncToken: a.SyncToken, domain: 'QBO',
        AttachableRef: a.AttachableRef,
      })
      deleted++
    } catch { /* best-effort: a failed delete never blocks the fresh upload */ }
  }
  return deleted
}

export type InvoicePdfResult = {
  ok: boolean; action: 'attached' | 'skipped' | 'disabled' | 'error';
  detail: string; docNumber?: string; pages?: number; deletedOld?: number; ms?: number;
}

/** Full pipeline for one invoice. `force` bypasses the toggle + dedup (manual runs). */
/** Accept either a QBO internal invoice Id (numeric) OR a DocNumber like
 *  "JLS26-22917" — resolve a DocNumber to the internal Id so the tester/UI can
 *  use the human-readable invoice number the finance team actually knows. */
async function resolveInvoiceId(idOrDocNumber: string): Promise<string> {
  const v = String(idOrDocNumber).trim()
  if (/^\d+$/.test(v)) return v // already the internal Id
  const res = await qboQuery(`SELECT Id FROM Invoice WHERE DocNumber = '${v.replace(/'/g, "\\'")}'`)
  const id = res?.QueryResponse?.Invoice?.[0]?.Id
  if (!id) throw new Error(`No invoice found with number "${v}" — enter the QuickBooks invoice number or its internal Id.`)
  return id
}

export async function generateAndAttachInvoicePdf(qboInvoiceId: string, opts: { force?: boolean; attach?: boolean } = {}): Promise<InvoicePdfResult> {
  const started = Date.now()
  const sb = admin()

  if (!qboConfigured()) return { ok: false, action: 'error', detail: 'QBO not configured' }

  // Toggle gate (default OFF — n8n still owns this until the cutover).
  if (!opts.force) {
    const { data: auto } = await sb.from('automations').select('enabled').eq('key', AUTO_KEY).maybeSingle()
    if (!auto?.enabled) return { ok: true, action: 'disabled', detail: 'qb-invoice-pdf toggle is off' }
  }

  try {
    const invId = await resolveInvoiceId(qboInvoiceId)
    const invoice = (await qboRequest('GET', `/invoice/${invId}?include=enhancedAllCustomFields&minorversion=73`))?.Invoice
    if (!invoice) return { ok: false, action: 'error', detail: `Invoice ${qboInvoiceId} not found` }

    const t = transformInvoice(invoice)

    // Attach-echo / duplicate guard: skip when nothing changed since our last run.
    if (!opts.force) {
      const { data: state } = await sb.from('qbo_invoice_pdf_state').select('last_updated_time').eq('qbo_id', t.qboId).maybeSingle()
      if (state?.last_updated_time && state.last_updated_time === t.lastUpdatedTime) {
        return { ok: true, action: 'skipped', detail: `unchanged since last run (${t.lastUpdatedTime})`, docNumber: t.docNumber }
      }
    }

    const company = await companyDetails()
    const pdf = await renderInvoicePdf(t, company)
    const fileName = `Invoice - ${t.docNumber}.pdf`

    if (opts.attach === false) {
      // Preview mode: caller wants the bytes, no QBO writes.
      return { ok: true, action: 'skipped', detail: 'preview only', docNumber: t.docNumber, ms: Date.now() - started }
    }

    // Upload FIRST, then clean up: QBO's Attachable query index is eventually
    // consistent, so deleting from a pre-upload snapshot can miss the previous
    // run's file and leave a duplicate. Post-upload, everything older is indexed —
    // delete all matching PDFs except the one just uploaded.
    const att = await qboUpload(fileName, pdf, 'application/pdf', 'Invoice', t.qboId)
    const deletedOld = await deleteOldPdfs(t.qboId, t.docNumber, String(att?.Id ?? ''))
    // Diagnostic: what did QBO actually return for the link?
    const linkedTo = (Array.isArray(att?.AttachableRef) && att.AttachableRef[0]?.EntityRef?.value) || 'NONE'

    // Re-fetch to capture the post-attach LastUpdatedTime → the echo webhook is a no-op.
    let finalStamp = t.lastUpdatedTime
    try {
      const after = (await qboRequest('GET', `/invoice/${t.qboId}?minorversion=73`))?.Invoice
      finalStamp = String(after?.MetaData?.LastUpdatedTime ?? finalStamp)
    } catch { /* keep pre-attach stamp */ }
    await sb.from('qbo_invoice_pdf_state').upsert({
      qbo_id: t.qboId, doc_number: t.docNumber, last_updated_time: finalStamp,
      attached_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'qbo_id' })

    const ms = Date.now() - started
    await logAutomationRun({
      key: AUTO_KEY, name: 'QB Invoice PDF (native)', source: 'worker', trigger_type: 'event', category: 'Finance',
      status: 'success', detail: `${fileName} attached → linkedTo=${linkedTo} (${deletedOld} old removed, ${ms}ms)`,
    })
    return { ok: true, action: 'attached', detail: `${fileName} attached`, docNumber: t.docNumber, deletedOld, ms }
  } catch (e: any) {
    const detail = e?.message ?? String(e)
    await logAutomationRun({
      key: AUTO_KEY, name: 'QB Invoice PDF (native)', source: 'worker', trigger_type: 'event', category: 'Finance',
      status: 'error', detail,
    })
    return { ok: false, action: 'error', detail }
  }
}

/** Render only — used by the preview endpoint so the layout can be checked
 *  against a real invoice without touching QBO. */
export async function renderInvoicePdfById(qboInvoiceId: string): Promise<{ bytes: Uint8Array; fileName: string }> {
  const invId = await resolveInvoiceId(qboInvoiceId)
  const invoice = (await qboRequest('GET', `/invoice/${invId}?include=enhancedAllCustomFields&minorversion=73`))?.Invoice
  if (!invoice) throw new Error(`Invoice ${qboInvoiceId} not found`)
  const t = transformInvoice(invoice)
  const bytes = await renderInvoicePdf(t, await companyDetails())
  return { bytes, fileName: `Invoice - ${t.docNumber}.pdf` }
}
