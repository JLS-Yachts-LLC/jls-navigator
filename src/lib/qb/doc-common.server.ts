/**
 * Shared QuickBooks document-generation core (native — no n8n / OneDrive / ConvertAPI).
 *
 * Used by the Purchase Order, Pro-Forma and (via its own transform) other QBO
 * document ports. The Quotation/Estimate port has its own module
 * (estimate-docgen.server.ts) with template-stamping; this module provides the
 * shared maps, formatting, a dependency-free native PDF + XLSX renderer, and the
 * common attach / loop-guard machinery so every doc type behaves identically:
 *
 *   loop-guard (qbo_doc_logs) → generate → upload+attach to the QBO entity →
 *   delete superseded "<prefix> - …" attachments → record post-attach stamp.
 */
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { qboRequest, qboQuery, qboUpload } from './qbo.server'

export function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}

// ── Maps (verbatim from the n8n Code nodes; identical across QB doc workflows) ──
export const CURRENCY_MAP: Record<string, string> = { '1': 'AED', '2': 'USD', '3': 'EUR', '4': 'AED TO USD', '5': 'AED TO EUR' }
export const BANK_DETAIL_MAP: Record<string, string> = { '1': 'AED', '2': 'USD', '3': 'EURO' }
export const TAX_CODE_MAP: Record<string, { name: string; rate: number }> = {
  '19': { name: 'Taxable Amount @ 5%', rate: 5 },
  '17': { name: 'Taxable Amount @ 0%', rate: 0 },
  '18': { name: 'Non Taxable Amount', rate: 0 },
  '21': { name: 'Taxable Amount @ 5%', rate: 5 },
  '22': { name: 'Taxable Amount @ 0%', rate: 0 },
  '24': { name: 'Non Taxable Amount', rate: 0 },
}
export const BANK_MAP: Record<string, { bankName: string; accountNumber: string; iban: string }> = {
  USD: { bankName: 'Emirates NBD – Tecom Branch, Dubai, UAE', accountNumber: '102-48474993-02', iban: 'AE32 0260 0010 2484 7499 302' },
  EUR: { bankName: 'Emirates NBD – Barsha Heights (TECOM), Dubai', accountNumber: '102-48474993-03', iban: 'AE05 0260 0010 2484 7499 303' },
  AED: { bankName: 'EMIRATES NBD – TECOM BRANCH, DUBAI UAE', accountNumber: '101-48474993-01', iban: 'AE24 0260 0010 1484 7499 301' },
}
export const CURRENCY_SIGN: Record<string, string> = { USD: '$', EUR: '€' }

/** Select the payout bank account from the Bank Detail label (AED for conversions). */
export function bankFor(bankDetail: string) {
  const bd = (bankDetail || 'AED').toUpperCase()
  const key = bd.includes('USD') && bd.includes('AED') ? 'AED'
    : bd.includes('EUR') && bd.includes('AED') ? 'AED'
    : bd.includes('USD') ? 'USD'
    : bd.includes('EUR') || bd.includes('EURO') ? 'EUR'
    : 'AED'
  return BANK_MAP[key]
}

// ── Shared document shape (same as the Quotation QuoteData) ────────────────────
export type DocItem = {
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
export type DocData = {
  party: { name: string; address: string; emirates: string; trnNo: string; docNumber: string; entityId: string }
  dateFormatted: string
  yachtName: string
  yachtPO: string
  requestedBy: string
  shipVia?: string
  displayCurrency: string
  conversionRate: number
  bankDetail: string
  bank: { bankName: string; accountNumber: string; iban: string }
  items: DocItem[]
  grandAmount: number
  grandVat: number
  grandTotal: number
  vat5Base: number
  vat0Base: number
  nonTaxable: number
  vat5Value: number
  convertedTotal: number | null
  convertedCurrency: string | null
  convertedSign: string
}

export const fmt = (n: number | null | undefined): string =>
  n == null || isNaN(n as number) || n === 0 ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtAlways = (n: number): string =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Build the totals + VAT breakdown + conversion line from a list of items. */
export function computeTotals(items: DocItem[], displayCurrency: string, conversionRate: number) {
  let grandAmount = 0, grandVat = 0, grandTotal = 0, vat5Base = 0, vat0Base = 0, nonTaxable = 0, vat5Value = 0
  for (const it of items) {
    if (it.isDescriptionOnly) continue
    grandAmount += it.amount; grandVat += it.vatValue; grandTotal += it.totalAmount
    if (it.taxName === 'Taxable Amount @ 5%') { vat5Base += it.amount; vat5Value += it.vatValue }
    else if (it.taxName === 'Taxable Amount @ 0%') vat0Base += it.amount
    else nonTaxable += it.amount
  }
  let convertedTotal: number | null = null, convertedCurrency: string | null = null
  const cur = displayCurrency.toUpperCase()
  if (cur.includes('TO')) {
    convertedCurrency = cur.includes('USD') ? 'USD' : cur.includes('EUR') ? 'EUR' : null
    if (convertedCurrency && conversionRate) convertedTotal = grandTotal / conversionRate
  }
  return {
    grandAmount, grandVat, grandTotal, vat5Base, vat0Base, nonTaxable, vat5Value,
    convertedTotal, convertedCurrency,
    convertedSign: convertedCurrency ? (CURRENCY_SIGN[convertedCurrency] ?? '') : '',
  }
}

// ── Native PDF renderer (dependency-free; branded template stamping is added
//    per-doc-type once the real templates are supplied, same as Quotation) ──────
const NAVY = rgb(0.03, 0.16, 0.28)
const GREY = rgb(0.45, 0.45, 0.45)
const LINE = rgb(0.75, 0.78, 0.82)

export async function buildDocPdf(
  q: DocData,
  opts: { title: string; partyLabel: string; currencyLabel?: string },
  background?: Uint8Array | null,
): Promise<Uint8Array> {
  const pdf = background ? await PDFDocument.load(background) : await PDFDocument.create()
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

  type Row = { cells: Record<string, string>; subAmount: number; subVat: number; subTotal: number }
  const rows: Row[] = []
  for (const it of q.items) {
    const descLines = wrap(it.description, cols[1].w - 8, FS)
    const numLine = Math.floor((descLines.length - 1) / 2)
    descLines.forEach((ln, i) => {
      const on = i === numLine && !it.isDescriptionOnly
      rows.push({
        cells: {
          qty: i === numLine && it.qty !== '' ? String(it.qty) : '',
          description: ln,
          unitRate: on ? fmt(it.unitRate) : '',
          amount: on ? fmt(it.amount) : '',
          vatPercent: on ? it.vatPercent : '',
          vatValue: on ? fmt(it.vatValue) : '',
          totalAmount: on ? fmt(it.totalAmount) : '',
        },
        subAmount: on ? it.amount : 0,
        subVat: on ? it.vatValue : 0,
        subTotal: on ? it.totalAmount : 0,
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

  const cur = opts.currencyLabel ?? (q.displayCurrency.startsWith('AED') ? 'AED' : q.displayCurrency)

  pages.forEach((pageRows, pi) => {
    const page = pdf.addPage([PW, PH])
    let y = PH - M
    text(page, 'JLS YACHTS LLC', M, y - 4, 15, bold)
    rightText(page, opts.title, PW - M, y - 4, 15, bold)
    y -= 20
    text(page, 'Port Operations & Agency · Dubai, UAE', M, y, 7, font, GREY)
    y -= 16
    page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 1, color: NAVY })
    y -= 14

    const metaX = PW - M - 200
    text(page, opts.partyLabel, M, y, 6.5, bold, GREY)
    const metaRows: Array<[string, string]> = [
      [`${opts.title === 'PURCHASE ORDER' ? 'PO' : 'Doc'} No`, q.party.docNumber],
      ['Date', q.dateFormatted],
      ...(q.yachtName ? [['Yacht', q.yachtName] as [string, string]] : []),
      ...(q.yachtPO ? [['Yacht PO', q.yachtPO] as [string, string]] : []),
      ...(q.requestedBy ? [['Requested By', q.requestedBy] as [string, string]] : []),
      ...(q.shipVia ? [['Ship Via', q.shipVia] as [string, string]] : []),
      ['Currency', q.displayCurrency],
    ]
    let my = y
    for (const [k, v] of metaRows) { text(page, k, metaX, my, 7, bold, GREY); rightText(page, v, PW - M, my, 7.5, font); my -= 11 }
    y -= 11
    text(page, q.party.name, M, y, 9, bold); y -= 11
    for (const ln of wrap(q.party.address, 240, 7.5).slice(0, 3)) { text(page, ln, M, y, 7.5, font, GREY); y -= 9.5 }
    if (q.party.trnNo) { text(page, `TRN: ${q.party.trnNo}`, M, y, 7.5, font, GREY); y -= 9.5 }
    text(page, q.party.emirates, M, y, 7.5, font, GREY)
    y = Math.min(y, my) - 14

    page.drawRectangle({ x: M, y: y - 4, width: tableW, height: 14, color: NAVY })
    let x = M
    for (const c of cols) {
      const lx = c.align === 'right' ? x + c.w - 4 - bold.widthOfTextAtSize(c.label, 6.5)
        : c.align === 'center' ? x + (c.w - bold.widthOfTextAtSize(c.label, 6.5)) / 2 : x + 4
      page.drawText(c.label, { x: lx, y, size: 6.5, font: bold, color: rgb(1, 1, 1) })
      x += c.w
    }
    y -= 4

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

    y -= rowH + 2
    page.drawLine({ start: { x: M, y: y + rowH - 4 }, end: { x: M + tableW, y: y + rowH - 4 }, thickness: 0.8, color: NAVY })
    text(page, pageCount > 1 ? 'Page subtotal' : 'Subtotal', M + 4, y, 7, bold)
    const colRight = (idx: number) => M + cols.slice(0, idx + 1).reduce((s, c) => s + c.w, 0) - 4
    rightText(page, fmtAlways(subA), colRight(3), y, FS, bold)
    rightText(page, fmtAlways(subV), colRight(5), y, FS, bold)
    rightText(page, fmtAlways(subT), colRight(6), y, FS, bold)

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
      totalRow(`GRAND TOTAL (${cur})`, fmtAlways(q.grandTotal), true)
      if (q.convertedTotal != null && q.convertedCurrency) {
        totalRow(`Total (${q.convertedCurrency}) @ ${q.conversionRate}`, `${q.convertedSign}${fmtAlways(q.convertedTotal)}`, true)
      }
      let vy = y + 12 * (q.convertedTotal != null ? 4 : 3) + 8
      text(page, 'VAT SUMMARY', M, vy, 6.5, bold, GREY); vy -= 11
      const vatRow = (label: string, v: string) => { text(page, label, M, vy, 7, font, GREY); rightText(page, v, M + 190, vy, 7, font); vy -= 10 }
      vatRow('Taxable Amount @ 5%', fmtAlways(q.vat5Base))
      vatRow('Taxable Amount @ 0%', fmtAlways(q.vat0Base))
      vatRow('Non Taxable Amount', fmtAlways(q.nonTaxable))
      vatRow('VAT @ 5%', fmtAlways(q.vat5Value))
      y = Math.min(y, vy) - 14
      text(page, 'BANK DETAILS', M, y, 6.5, bold, GREY); y -= 11
      text(page, q.bank.bankName, M, y, 7.5, bold); y -= 10
      text(page, `Account: ${q.bank.accountNumber}   ·   IBAN: ${q.bank.iban}   ·   Account currency: ${q.bankDetail}`, M, y, 7, font, GREY)
    }
    rightText(page, `Page ${pi + 1} of ${pageCount}`, PW - M, M - 14, 7, font, GREY)
    text(page, `${opts.title === 'PURCHASE ORDER' ? 'Purchase Order' : opts.title === 'PROFORMA INVOICE' ? 'Proforma Invoice' : opts.title} ${q.party.docNumber} — JLS Yachts LLC`, M, M - 14, 7, font, GREY)
  })

  return pdf.save()
}

// ── XLSX (dependency-free STORED-zip OOXML — same technique as the Quotation port) ─
function crc32(buf: Uint8Array): number {
  const table = crcTable ?? (crcTable = (() => {
    const t = new Int32Array(256)
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c }
    return t
  })())
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}
let crcTable: Int32Array | null = null

function buildZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const num = (v: number, bytes: number) => { const a = new Uint8Array(bytes); for (let i = 0; i < bytes; i++) a[i] = (v >>> (8 * i)) & 0xff; return a }
  for (const f of files) {
    const name = enc.encode(f.name); const crc = crc32(f.data)
    const local = new Uint8Array([...num(0x04034b50, 4), ...num(20, 2), ...num(0, 2), ...num(0, 2), ...num(0, 2), ...num(0, 2), ...num(crc, 4), ...num(f.data.length, 4), ...num(f.data.length, 4), ...num(name.length, 2), ...num(0, 2), ...name])
    chunks.push(local, f.data)
    central.push(new Uint8Array([...num(0x02014b50, 4), ...num(20, 2), ...num(20, 2), ...num(0, 2), ...num(0, 2), ...num(0, 2), ...num(0, 2), ...num(crc, 4), ...num(f.data.length, 4), ...num(f.data.length, 4), ...num(name.length, 2), ...num(0, 2), ...num(0, 2), ...num(0, 2), ...num(0, 2), ...num(0, 4), ...num(offset, 4), ...name]))
    offset += local.length + f.data.length
  }
  const centralStart = offset; let centralLen = 0
  for (const c of central) { chunks.push(c); centralLen += c.length }
  chunks.push(new Uint8Array([...num(0x06054b50, 4), ...num(0, 2), ...num(0, 2), ...num(files.length, 2), ...num(files.length, 2), ...num(centralLen, 4), ...num(centralStart, 4), ...num(0, 2)]))
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total); let p = 0
  for (const c of chunks) { out.set(c, p); p += c.length }
  return out
}
const xmlEsc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function buildDocXlsx(q: DocData, opts: { title: string; partyLabel: string }): Uint8Array {
  type Cell = { v: string | number; num?: boolean }
  const sheetRows: Cell[][] = [
    [{ v: `JLS YACHTS LLC — ${opts.title}` }],
    [{ v: `${opts.title === 'PURCHASE ORDER' ? 'PO' : 'Doc'} No` }, { v: q.party.docNumber }],
    [{ v: 'Date' }, { v: q.dateFormatted }],
    [{ v: opts.partyLabel }, { v: q.party.name }],
    ...(q.party.trnNo ? [[{ v: 'TRN' }, { v: q.party.trnNo }] as Cell[]] : []),
    ...(q.yachtName ? [[{ v: 'Yacht' }, { v: q.yachtName }] as Cell[]] : []),
    ...(q.yachtPO ? [[{ v: 'Yacht PO' }, { v: q.yachtPO }] as Cell[]] : []),
    ...(q.requestedBy ? [[{ v: 'Requested By' }, { v: q.requestedBy }] as Cell[]] : []),
    [{ v: 'Currency' }, { v: q.displayCurrency }],
    [],
    [{ v: 'QTY' }, { v: 'Description' }, { v: 'Unit Rate' }, { v: 'Amount' }, { v: 'VAT %' }, { v: 'VAT Value' }, { v: 'Total Amount' }],
    ...q.items.map((it): Cell[] => it.isDescriptionOnly
      ? [{ v: '' }, { v: it.description }]
      : [{ v: it.qty === '' ? '' : Number(it.qty), num: it.qty !== '' }, { v: it.description }, { v: it.unitRate, num: true }, { v: it.amount, num: true }, { v: it.vatPercent }, { v: it.vatValue, num: true }, { v: it.totalAmount, num: true }]),
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
      c.num ? `<c r="${colLetter(ci)}${ri + 1}"><v>${Number(c.v) || 0}</v></c>`
        : `<c r="${colLetter(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c.v)}</t></is></c>`,
    ).join('') + '</row>').join('')
  const enc = new TextEncoder()
  return buildZip([
    { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>') },
    { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: 'xl/workbook.xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>') },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>') },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="2" width="60" customWidth="1"/><col min="3" max="7" width="14" customWidth="1"/></cols><sheetData>${rowsXml}</sheetData></worksheet>`) },
  ])
}

// ── Loop-guard (qbo_doc_logs) — shared echo suppression ────────────────────────
export async function docgenGuard(
  sb: any,
  docType: string,
  entityId: string,
  rawType: string,
  lastUpdated: string,
): Promise<string | null> {
  const { data: log } = await sb.from('qbo_doc_logs')
    .select('id, last_updated_time, del_last_updated_time, create_last_updated_time')
    .eq('doc_type', docType).eq('doc_id', String(entityId)).maybeSingle()
  const isCreate = rawType.includes('.created')
  if (isCreate && log) return 'skip-already-created'
  if (!isCreate && log && (
    log.last_updated_time === lastUpdated ||
    log.del_last_updated_time === lastUpdated ||
    log.create_last_updated_time === lastUpdated
  )) return 'skip-own-echo'
  return null
}

/** Upload the generated file(s), attach to the QBO entity, delete superseded
 *  "<prefix> …" attachments, and record the post-attach LastUpdatedTime. */
export async function attachAndLog(opts: {
  sb: any
  entity: string          // 'PurchaseOrder' | 'Invoice' | 'Payment' | 'Estimate'
  entityId: string
  docType: string         // qbo_doc_logs.doc_type
  docNumber: string
  filenamePrefix: string  // e.g. 'Purchase Order - PO26-' — used to find superseded copies
  files: Array<{ name: string; bytes: Uint8Array; contentType: string }>
  createTime: string
  fetchPath: string       // path to re-read the entity for the post-attach stamp
  stampField: string      // e.g. 'PurchaseOrder' | 'Invoice' | 'Payment'
}): Promise<string> {
  const { sb, entity, entityId, docType, docNumber, filenamePrefix, files, createTime, fetchPath, stampField } = opts

  const existingRes = await qboQuery(
    `SELECT * FROM Attachable WHERE AttachableRef.EntityRef.Type = '${entity}' AND AttachableRef.EntityRef.value = '${String(entityId).replace(/'/g, "''")}'`,
  )
  const old = ((existingRes?.QueryResponse?.Attachable ?? []) as any[]).filter((a) => {
    const fn = String(a.FileName ?? '')
    return fn.startsWith(filenamePrefix.split(' - ')[0]) && fn.includes(docNumber)
  })

  for (const f of files) await qboUpload(f.name, f.bytes, f.contentType, entity, String(entityId))

  let deleted = 0
  for (const a of old) {
    try {
      await qboRequest('POST', '/attachable?operation=delete&minorversion=65', { Id: String(a.Id), SyncToken: String(a.SyncToken), domain: 'QBO', AttachableRef: a.AttachableRef })
      deleted++
    } catch { /* best-effort */ }
  }

  const after = await qboRequest('GET', fetchPath).catch(() => null)
  const newStamp = String(after?.[stampField]?.MetaData?.LastUpdatedTime ?? '')
  await sb.from('qbo_doc_logs').upsert({
    doc_type: docType, doc_id: String(entityId), doc_number: docNumber,
    last_updated_time: newStamp, del_last_updated_time: newStamp, create_last_updated_time: createTime,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'doc_type,doc_id' })

  return `docgen-ok ${files.map((f) => f.name.endsWith('.pdf') ? 'pdf' : 'xlsx').join('+')} attached${deleted ? `, ${deleted} old removed` : ''}`
}

/** Lazily seed an Automations toggle row; returns {enabled} (default OFF). */
export async function docgenToggle(sb: any, key: string, name: string, description: string): Promise<boolean | 'seeded'> {
  const { data: auto } = await sb.from('automations').select('enabled').eq('key', key).maybeSingle()
  if (!auto) {
    await sb.from('automations').insert({ key, name, description, category: 'QuickBooks / Finance', department: 'Finance', source: 'worker', trigger_type: 'webhook', enabled: false })
    return 'seeded'
  }
  return !!auto.enabled
}
