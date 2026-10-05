/**
 * Statement of account — an open-item statement for one vessel's QuickBooks
 * customer: every unpaid invoice with its balance and days overdue, aged into
 * Current / 1–30 / 31–60 / 61–90 / 90+ days, on JLS letterhead. Built with
 * pdf-lib (no external services), streamed by /api/portal/finance?statement=1.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { QB_DOC_IMAGES } from '@/lib/qb/invoice-assets'

export type StatementInvoice = {
  docNumber: string | null; date: string | null; dueDate: string | null; total: number; balance: number; currency: string
}

const INK = rgb(0.08, 0.09, 0.11)
const MUTED = rgb(0.38, 0.41, 0.46)
const RULE = rgb(0.84, 0.82, 0.78)
const GOLD = rgb(0.55, 0.44, 0.23)
const NAVY = rgb(0.04, 0.09, 0.22)

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const money = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'

function daysOverdue(due: string | null, today: Date): number {
  if (!due) return 0
  const d = Math.floor((Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`) - Date.parse(`${due.slice(0, 10)}T00:00:00Z`)) / 86400000)
  return Math.max(0, d)
}

export function ageing(invoices: StatementInvoice[], today = new Date()) {
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 }
  for (const i of invoices) {
    const n = daysOverdue(i.dueDate, today)
    if (n <= 0) buckets.current += i.balance
    else if (n <= 30) buckets.d30 += i.balance
    else if (n <= 60) buckets.d60 += i.balance
    else if (n <= 90) buckets.d90 += i.balance
    else buckets.over90 += i.balance
  }
  return buckets
}

function right(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color = INK) {
  page.drawText(text, { x: x - font.widthOfTextAtSize(text, size), y, size, font, color })
}

export async function buildStatementPdf(opts: {
  vesselName: string; billTo: string | null; invoices: StatementInvoice[]; today?: Date
}): Promise<Uint8Array> {
  const today = opts.today ?? new Date()
  const invoices = [...opts.invoices].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const ccy = invoices[0]?.currency ?? 'AED'
  const total = invoices.reduce((s, i) => s + i.balance, 0)
  const ages = ageing(invoices, today)

  const pdf = await PDFDocument.create()
  pdf.setTitle(`Statement of account — ${opts.vesselName}`)
  pdf.setAuthor('JLS Yachts')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const logo = await pdf.embedPng(b64(QB_DOC_IMAGES.logo))

  const W = 595.28, H = 841.89, M = 48
  let page = pdf.addPage([W, H])
  let y = H - M

  const header = (p: PDFPage) => {
    const lw = 150, lh = (logo.height / logo.width) * lw
    p.drawImage(logo, { x: M, y: H - M - lh, width: lw, height: lh })
    right(p, 'STATEMENT OF ACCOUNT', W - M, H - M - 14, 15, bold, NAVY)
    right(p, `As at ${fmtDate(today.toISOString())}`, W - M, H - M - 32, 9.5, font, MUTED)
    return H - M - Math.max(lh, 40) - 22
  }
  y = header(page)

  // Bill to + summary
  page.drawText('STATEMENT FOR', { x: M, y, size: 8, font: bold, color: GOLD })
  page.drawText(opts.vesselName, { x: M, y: y - 16, size: 13, font: bold, color: INK })
  if (opts.billTo) page.drawText(opts.billTo.slice(0, 70), { x: M, y: y - 31, size: 9.5, font, color: MUTED })
  right(page, 'AMOUNT DUE', W - M, y, 8, bold, GOLD)
  right(page, `${ccy} ${money(total)}`, W - M, y - 18, 16, bold, INK)
  y -= 58

  // Ageing strip
  const cols = [['Current', ages.current], ['1–30 days', ages.d30], ['31–60 days', ages.d60], ['61–90 days', ages.d90], ['Over 90 days', ages.over90]] as const
  const cw = (W - 2 * M) / cols.length
  page.drawRectangle({ x: M, y: y - 38, width: W - 2 * M, height: 44, color: rgb(0.965, 0.955, 0.93) })
  cols.forEach(([label, v], i) => {
    const x = M + i * cw + 10
    page.drawText(label, { x, y: y - 8, size: 8, font, color: MUTED })
    page.drawText(money(v), { x, y: y - 26, size: 11, font: bold, color: i >= 3 && v > 0 ? rgb(0.7, 0.14, 0.09) : INK })
  })
  y -= 66

  // Table
  const X = { date: M, no: M + 78, due: M + 178, days: M + 268, total: W - M - 110, bal: W - M }
  const tableHeader = () => {
    page.drawText('Date', { x: X.date, y, size: 8, font: bold, color: MUTED })
    page.drawText('Invoice', { x: X.no, y, size: 8, font: bold, color: MUTED })
    page.drawText('Due', { x: X.due, y, size: 8, font: bold, color: MUTED })
    page.drawText('Overdue', { x: X.days, y, size: 8, font: bold, color: MUTED })
    right(page, `Amount (${ccy})`, X.total, y, 8, bold, MUTED)
    right(page, `Balance (${ccy})`, X.bal, y, 8, bold, MUTED)
    y -= 8
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: INK })
    y -= 14
  }
  tableHeader()

  if (!invoices.length) {
    page.drawText('Nothing outstanding — the account is fully settled. Thank you.', { x: M, y, size: 10, font, color: INK })
    y -= 20
  }
  for (const inv of invoices) {
    if (y < M + 90) {
      page = pdf.addPage([W, H])
      y = header(page)
      tableHeader()
    }
    const n = daysOverdue(inv.dueDate, today)
    page.drawText(fmtDate(inv.date), { x: X.date, y, size: 9, font, color: INK })
    page.drawText(String(inv.docNumber ?? '—'), { x: X.no, y, size: 9, font, color: INK })
    page.drawText(fmtDate(inv.dueDate), { x: X.due, y, size: 9, font, color: INK })
    page.drawText(n > 0 ? `${n} days` : '—', { x: X.days, y, size: 9, font, color: n > 60 ? rgb(0.7, 0.14, 0.09) : INK })
    right(page, money(inv.total), X.total, y, 9, font)
    right(page, money(inv.balance), X.bal, y, 9, bold)
    y -= 6
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: RULE })
    y -= 13
  }
  y -= 4
  right(page, 'Total due', X.total, y, 10, bold)
  right(page, `${ccy} ${money(total)}`, X.bal, y, 11, bold)
  y -= 34

  const notes = [
    'Bank details are shown on each invoice. Please quote the invoice number with your payment.',
    'Questions about this statement? Message us from your Client Portal or contact Accounts & Finance.',
  ]
  for (const line of notes) {
    if (y < M) break
    page.drawText(line, { x: M, y, size: 8.5, font, color: MUTED })
    y -= 13
  }

  // Footer on every page
  for (const p of pdf.getPages()) {
    p.drawLine({ start: { x: M, y: M - 10 }, end: { x: W - M, y: M - 10 }, thickness: 0.5, color: RULE })
    p.drawText('JLS Yachts · Statement of account', { x: M, y: M - 24, size: 7.5, font, color: MUTED })
    right(p, `Page ${pdf.getPages().indexOf(p) + 1} of ${pdf.getPageCount()}`, W - M, M - 24, 7.5, font, MUTED)
  }
  return pdf.save()
}
