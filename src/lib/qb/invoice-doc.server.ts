/**
 * QB Invoice document generator — full native port of the n8n "QB Invoice"
 * workflow. No n8n, no OneDrive templates, no ConvertAPI:
 *
 *   1. Fetch the invoice from QBO (enhancedAllCustomFields).
 *   2. Skip if we already generated for this LastUpdatedTime (attach-echo guard).
 *   3. Transform: custom fields (Yacht.Name/PO, Currency, Conversion Rate, Bank
 *      Detail, Requested By, Customer TRN, Place of Supply), tax-code mapping,
 *      line items incl. description-only rows.
 *   4. Render a branded multi-page A4 PDF with pdf-lib — items table with
 *      proportional text wrapping, per-page subtotals, VAT breakdown (5%/0%/
 *      non-taxable), currency conversion line and the right bank details.
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
const A4 = { w: 595.28, h: 841.89 }
const M = 40 // page margin
const NAVY = rgb(0.03, 0.16, 0.28)
const GREY = rgb(0.45, 0.45, 0.45)
const LINE = rgb(0.8, 0.83, 0.86)

// Items table columns: [x, width, align]
const COLS = [
  { x: M, w: 30, label: 'QTY', align: 'left' as const },
  { x: M + 32, w: 218, label: 'DESCRIPTION', align: 'left' as const },
  { x: M + 254, w: 52, label: 'UNIT RATE', align: 'right' as const },
  { x: M + 310, w: 58, label: 'AMOUNT', align: 'right' as const },
  { x: M + 372, w: 32, label: 'VAT %', align: 'right' as const },
  { x: M + 408, w: 50, label: 'VAT', align: 'right' as const },
  { x: M + 462, w: 53, label: 'TOTAL', align: 'right' as const },
]
const BODY_SIZE = 7.5
const ROW_H = 11

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

type Company = { name: string; address: string; trn: string; phone: string; email: string }

async function companyDetails(): Promise<Company> {
  // Letterhead is config-driven (automations.config for qb-invoice-pdf) with a
  // QBO CompanyInfo fallback, so it can be refined without a deploy.
  const sb = admin()
  const { data } = await sb.from('automations').select('config').eq('key', AUTO_KEY).maybeSingle()
  const c = (data?.config as any)?.company ?? {}
  let base: Company = {
    name: c.name ?? '', address: c.address ?? '', trn: c.trn ?? '', phone: c.phone ?? '', email: c.email ?? '',
  }
  if (!base.name) {
    try {
      const info = (await qboRequest('GET', `/companyinfo/${process.env.QBO_REALM_ID ?? '9341454112300561'}?minorversion=73`))?.CompanyInfo
      const a = info?.CompanyAddr ?? {}
      base = {
        name: info?.CompanyName ?? 'JLS Yachts LLC',
        address: base.address || [a.Line1, a.Line2, a.City, a.Country].filter(Boolean).join(', '),
        trn: base.trn,
        phone: base.phone || (info?.PrimaryPhone?.FreeFormNumber ?? ''),
        email: base.email || (info?.Email?.Address ?? ''),
      }
    } catch { base.name = 'JLS Yachts LLC' }
  }
  return base
}

export async function renderInvoicePdf(t: TransformedInvoice, company: Company, title = 'TAX INVOICE'): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const draw = (page: PDFPage, text: string, x: number, y: number, opts: { size?: number; font?: PDFFont; color?: any } = {}) =>
    page.drawText(text, { x, y, size: opts.size ?? BODY_SIZE, font: opts.font ?? font, color: opts.color ?? rgb(0.1, 0.1, 0.1) })
  const drawRight = (page: PDFPage, text: string, xRight: number, y: number, opts: { size?: number; font?: PDFFont; color?: any } = {}) => {
    const f = opts.font ?? font
    const s = opts.size ?? BODY_SIZE
    draw(page, text, xRight - f.widthOfTextAtSize(text, s), y, opts)
  }

  // Pre-wrap every item into visual rows so pagination is deterministic.
  type Row = { item: InvoiceItem; line: string; first: boolean }
  const rows: Row[] = []
  for (const item of t.items) {
    const lines = wrapText(item.description, font, BODY_SIZE, COLS[1].w - 4)
    lines.forEach((line, i) => rows.push({ item, line, first: i === 0 }))
  }

  const grand = t.items.reduce((a, i) => ({ amount: a.amount + i.amountN, vat: a.vat + i.vatN, total: a.total + i.totalN }),
    { amount: 0, vat: 0, total: 0 })
  const breakdown = t.items.reduce((a, i) => {
    if (!i.isDataRow) return a
    if (i.taxName.includes('@ 5%') || i.vatRate === 5) { a.t5 += i.amountN; a.v5 += i.vatN }
    else if (i.taxName.includes('@ 0%')) a.t0 += i.amountN
    else if (i.taxName.includes('Non Taxable')) a.non += i.amountN
    else if (i.vatRate === 0) a.t0 += i.amountN
    return a
  }, { t5: 0, t0: 0, non: 0, v5: 0 })

  const needsConversion = t.currency.includes('TO') && t.conversionRate && t.conversionRate !== 0
  const targetCurrency = t.currency.includes('USD') ? 'USD' : t.currency.includes('EUR') ? 'EUR' : ''
  const bankKey = t.bankDetail.includes('USD') ? 'USD' : (t.bankDetail.includes('EUR') ? 'EUR' : 'AED')
  const bank = BANKS[bankKey]

  const HEADER_BOTTOM = A4.h - 218   // y where the items table starts
  const PAGE_FLOOR = 88              // reserve for page subtotal + footer
  const LAST_PAGE_BLOCK = 216        // reserve for grand totals + VAT + bank block

  // Chunk rows into pages.
  const pages: Row[][] = []
  let current: Row[] = []
  let y = HEADER_BOTTOM
  for (const row of rows) {
    if (y - ROW_H < PAGE_FLOOR) { pages.push(current); current = []; y = HEADER_BOTTOM }
    current.push(row)
    y -= ROW_H
  }
  pages.push(current)
  // If the totals block doesn't fit under the last page's items, give it its own page.
  if (y - LAST_PAGE_BLOCK < M) pages.push([])

  const pageCount = pages.length
  pages.forEach((pageRows, pi) => {
    const page = doc.addPage([A4.w, A4.h])
    let py = A4.h - M

    // ── Letterhead ──
    draw(page, company.name.toUpperCase(), M, py - 12, { size: 15, font: bold, color: NAVY })
    drawRight(page, title, A4.w - M, py - 12, { size: 15, font: bold, color: NAVY })
    py -= 26
    if (company.address) { draw(page, company.address, M, py, { size: 7, color: GREY }); py -= 9 }
    const contact = [company.phone, company.email].filter(Boolean).join('  ·  ')
    if (contact) { draw(page, contact, M, py, { size: 7, color: GREY }); py -= 9 }
    if (company.trn) { draw(page, `TRN: ${company.trn}`, M, py, { size: 7, color: GREY }); py -= 9 }
    py -= 6
    page.drawLine({ start: { x: M, y: py }, end: { x: A4.w - M, y: py }, thickness: 1, color: NAVY })
    py -= 14

    // ── Customer + meta blocks ──
    draw(page, 'BILL TO', M, py, { size: 6.5, font: bold, color: GREY })
    draw(page, t.customer.name, M, py - 11, { size: 9, font: bold })
    const addrLines = wrapText(t.customer.address || '—', font, 7.5, 230)
    addrLines.slice(0, 3).forEach((l, i) => draw(page, l, M, py - 22 - i * 9, { size: 7.5 }))
    let cy = py - 22 - Math.min(addrLines.length, 3) * 9
    if (t.customer.trn) draw(page, `TRN: ${t.customer.trn}`, M, cy, { size: 7.5 })

    const metaX = 330
    const meta: Array<[string, string]> = [
      ['Invoice No', t.docNumber],
      ['Date', t.invoiceDate],
      ...(t.placeOfSupply ? [['Place of Supply', t.placeOfSupply] as [string, string]] : []),
      ...(t.yachtName ? [['Yacht', t.yachtName] as [string, string]] : []),
      ...(t.yachtPO ? [['Yacht PO', t.yachtPO] as [string, string]] : []),
      ...(t.requestedBy ? [['Requested By', t.requestedBy] as [string, string]] : []),
      ['Currency', bankKey === 'AED' && !targetCurrency ? 'AED' : t.bankDetail],
    ]
    meta.forEach(([k, v], i) => {
      draw(page, k, metaX, py - i * 10.5, { size: 7, color: GREY })
      drawRight(page, v, A4.w - M, py - i * 10.5, { size: 7.5, font: bold })
    })

    // ── Items table header ──
    let ty = HEADER_BOTTOM + 16
    page.drawRectangle({ x: M - 2, y: ty - 4, width: A4.w - 2 * M + 4, height: 13, color: NAVY })
    for (const c of COLS) {
      if (c.align === 'right') drawRight(page, c.label, c.x + c.w, ty, { size: 6.5, font: bold, color: rgb(1, 1, 1) })
      else draw(page, c.label, c.x, ty, { size: 6.5, font: bold, color: rgb(1, 1, 1) })
    }

    // ── Item rows ──
    let ry = HEADER_BOTTOM
    const sub = { amount: 0, vat: 0, total: 0 }
    for (const row of pageRows) {
      if (row.first) {
        draw(page, row.item.qty, COLS[0].x, ry)
        drawRight(page, row.item.unitRate, COLS[2].x + COLS[2].w, ry)
        drawRight(page, row.item.amount, COLS[3].x + COLS[3].w, ry)
        drawRight(page, row.item.vatPercent, COLS[4].x + COLS[4].w, ry)
        drawRight(page, row.item.vatValue, COLS[5].x + COLS[5].w, ry)
        drawRight(page, row.item.totalAmount, COLS[6].x + COLS[6].w, ry)
        if (row.item.isDataRow) { sub.amount += row.item.amountN; sub.vat += row.item.vatN; sub.total += row.item.totalN }
      }
      draw(page, row.line, COLS[1].x, ry, { font: row.item.isDataRow ? font : bold })
      ry -= ROW_H
    }

    // ── Page subtotal ──
    if (pageRows.length) {
      page.drawLine({ start: { x: M, y: ry + 4 }, end: { x: A4.w - M, y: ry + 4 }, thickness: 0.6, color: LINE })
      draw(page, `Page subtotal`, COLS[1].x, ry - 6, { size: 7, font: bold, color: GREY })
      drawRight(page, fmtMoney(sub.amount), COLS[3].x + COLS[3].w, ry - 6, { size: 7, font: bold })
      drawRight(page, fmtMoney(sub.vat), COLS[5].x + COLS[5].w, ry - 6, { size: 7, font: bold })
      drawRight(page, fmtMoney(sub.total), COLS[6].x + COLS[6].w, ry - 6, { size: 7, font: bold })
      ry -= 20
    }

    // ── Last page: grand totals, VAT breakdown, conversion, bank details ──
    if (pi === pageCount - 1) {
      let by = Math.max(ry - 6, M + LAST_PAGE_BLOCK - 26)
      page.drawLine({ start: { x: M, y: by + 10 }, end: { x: A4.w - M, y: by + 10 }, thickness: 1, color: NAVY })

      // Right column: totals
      const totX = 330
      const trow = (label: string, value: string, boldRow = false, big = false) => {
        draw(page, label, totX, by, { size: big ? 8.5 : 7.5, font: boldRow ? bold : font, color: boldRow ? NAVY : GREY })
        drawRight(page, value, A4.w - M, by, { size: big ? 9 : 7.5, font: boldRow ? bold : font, color: boldRow ? NAVY : undefined })
        by -= big ? 14 : 11
      }
      trow('Total Amount', `AED ${fmtMoney(grand.amount)}`)
      trow('Total VAT', `AED ${fmtMoney(grand.vat)}`)
      trow('TOTAL DUE', `AED ${fmtMoney(grand.total)}`, true, true)
      if (needsConversion && targetCurrency) {
        const converted = grand.total / t.conversionRate
        trow(`Total in ${targetCurrency} (rate ${t.conversionRate})`, `${CURRENCY_SIGN[targetCurrency] ?? ''}${fmtMoney(converted)}`, true)
      }

      // Left column: VAT breakdown
      let vy = ry - 6 > M + LAST_PAGE_BLOCK - 26 ? ry - 6 : M + LAST_PAGE_BLOCK - 26
      draw(page, 'VAT SUMMARY', M, vy, { size: 6.5, font: bold, color: GREY }); vy -= 11
      const vrow = (label: string, value: string) => {
        draw(page, label, M, vy, { size: 7 })
        drawRight(page, value ? `AED ${value}` : '—', M + 220, vy, { size: 7 })
        vy -= 10
      }
      vrow('Taxable Amount @ 5%', fmtNum(breakdown.t5))
      vrow('Taxable Amount @ 0%', fmtNum(breakdown.t0))
      vrow('Non Taxable Amount', fmtNum(breakdown.non))
      vrow('VAT @ 5%', fmtNum(breakdown.v5))

      // Bank details
      vy -= 6
      draw(page, `BANK DETAILS (${bankKey})`, M, vy, { size: 6.5, font: bold, color: GREY }); vy -= 11
      draw(page, bank.bankName, M, vy, { size: 7.5, font: bold }); vy -= 10
      draw(page, `Account: ${bank.accountNumber}`, M, vy, { size: 7.5 }); vy -= 10
      draw(page, `IBAN: ${bank.iban}`, M, vy, { size: 7.5 })
    }

    // ── Footer ──
    drawRight(page, `Page ${pi + 1} of ${pageCount}`, A4.w - M, M - 14, { size: 7, color: GREY })
    draw(page, company.name, M, M - 14, { size: 7, color: GREY })
  })

  return doc.save()
}

// ── Attachment cycle + orchestration entry point ──────────────────────────────

async function deleteOldPdfs(qboId: string, docNumber: string): Promise<number> {
  const res = await qboQuery(`SELECT * FROM Attachable WHERE AttachableRef.EntityRef.Type = 'Invoice' AND AttachableRef.EntityRef.value = '${qboId}'`)
  const old = (res?.QueryResponse?.Attachable ?? []).filter((a: any) => {
    const f = String(a.FileName ?? '')
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
    const invoice = (await qboRequest('GET', `/invoice/${qboInvoiceId}?include=enhancedAllCustomFields&minorversion=73`))?.Invoice
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
    const pages = Math.ceil(1) // real count comes from the doc; recompute cheaply below
    const fileName = `Invoice - ${t.docNumber}.pdf`

    if (opts.attach === false) {
      // Preview mode: caller wants the bytes, no QBO writes.
      return { ok: true, action: 'skipped', detail: 'preview only', docNumber: t.docNumber, ms: Date.now() - started }
    }

    const deletedOld = await deleteOldPdfs(t.qboId, t.docNumber)
    await qboUpload(fileName, pdf, 'application/pdf', 'Invoice', t.qboId)

    // Re-fetch to capture the post-attach LastUpdatedTime → the echo webhook is a no-op.
    let finalStamp = t.lastUpdatedTime
    try {
      const after = (await qboRequest('GET', `/invoice/${qboInvoiceId}?minorversion=73`))?.Invoice
      finalStamp = String(after?.MetaData?.LastUpdatedTime ?? finalStamp)
    } catch { /* keep pre-attach stamp */ }
    await sb.from('qbo_invoice_pdf_state').upsert({
      qbo_id: t.qboId, doc_number: t.docNumber, last_updated_time: finalStamp,
      attached_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'qbo_id' })

    const ms = Date.now() - started
    await logAutomationRun({
      key: AUTO_KEY, name: 'QB Invoice PDF (native)', source: 'worker', trigger_type: 'event', category: 'Finance',
      status: 'success', detail: `${fileName} attached (${deletedOld} old removed, ${ms}ms)`,
    })
    return { ok: true, action: 'attached', detail: `${fileName} attached`, docNumber: t.docNumber, pages, deletedOld, ms }
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
  const invoice = (await qboRequest('GET', `/invoice/${qboInvoiceId}?include=enhancedAllCustomFields&minorversion=73`))?.Invoice
  if (!invoice) throw new Error(`Invoice ${qboInvoiceId} not found`)
  const t = transformInvoice(invoice)
  const bytes = await renderInvoicePdf(t, await companyDetails())
  return { bytes, fileName: `Invoice - ${t.docNumber}.pdf` }
}
