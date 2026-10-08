/**
 * APA statement — the end-of-charter account of the Advance Provisioning
 * Allowance: what the charterer paid in, what was spent by category, every
 * item, and the balance to return (or still owed). In the vessel's name, since
 * it's the captain's statement to the charter party, not a JLS document.
 * pdf-lib only, streamed by /api/portal/expenses?action=apa-statement.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { categoryLabel } from '@/lib/portal/expenses'

const INK = rgb(0.08, 0.09, 0.11)
const MUTED = rgb(0.38, 0.41, 0.46)
const RULE = rgb(0.84, 0.82, 0.78)
const GOLD = rgb(0.55, 0.44, 0.23)
const NAVY = rgb(0.04, 0.09, 0.22)

const money = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'

function right(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color = INK) {
  page.drawText(text, { x: x - font.widthOfTextAtSize(text, size), y, size, font, color })
}

/** pdf-lib's standard fonts are WinAnsi only — keep text printable (WinAnsi has the dashes, quotes and bullet). */
const safe = (s: string | null | undefined) =>
  (s ?? '').replace(/[^\x20-\x7E -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '?')

export type ApaEntry = {
  kind: 'expense' | 'funds_in' | 'return'; amount: number; entry_date: string;
  supplier: string | null; description: string | null; category: string | null; reference: string | null;
}

export async function buildApaStatementPdf(opts: {
  vesselName: string; accountName: string; currency: string;
  charter?: { charterer: string | null; start: string | null; end: string | null; reference: string | null } | null;
  opening: number; entries: ApaEntry[]; preparedBy: string | null; today?: Date;
}): Promise<Uint8Array> {
  const today = opts.today ?? new Date()
  const ccy = opts.currency
  const entries = [...opts.entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date))
  const received = opts.opening + entries.filter((e) => e.kind === 'funds_in').reduce((s, e) => s + Number(e.amount), 0)
  const spent = entries.filter((e) => e.kind === 'expense').reduce((s, e) => s + Number(e.amount), 0)
  const returned = entries.filter((e) => e.kind === 'return').reduce((s, e) => s + Number(e.amount), 0)
  const balance = received - spent - returned

  const byCat = new Map<string, number>()
  for (const e of entries) if (e.kind === 'expense') byCat.set(categoryLabel(e.category), (byCat.get(categoryLabel(e.category)) ?? 0) + Number(e.amount))

  const pdf = await PDFDocument.create()
  pdf.setTitle(`APA statement — ${opts.vesselName}`)
  pdf.setAuthor(opts.vesselName)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const W = 595.28, H = 841.89, M = 48
  let page = pdf.addPage([W, H])
  let y = H - M

  const header = (p: PDFPage) => {
    p.drawText(safe(opts.vesselName.toUpperCase()), { x: M, y: H - M - 16, size: 16, font: bold, color: NAVY })
    right(p, 'APA STATEMENT', W - M, H - M - 14, 15, bold, NAVY)
    right(p, `As at ${fmtDate(today.toISOString())}`, W - M, H - M - 32, 9.5, font, MUTED)
    return H - M - 62
  }
  y = header(page)

  // Charter + summary
  page.drawText('CHARTER', { x: M, y, size: 8, font: bold, color: GOLD })
  page.drawText(safe(opts.charter?.charterer || opts.accountName), { x: M, y: y - 16, size: 13, font: bold, color: INK })
  const sub = [opts.charter?.reference, opts.charter?.start && `${fmtDate(opts.charter.start)} – ${fmtDate(opts.charter?.end ?? null)}`].filter(Boolean).join(' · ')
  if (sub) page.drawText(safe(sub), { x: M, y: y - 31, size: 9.5, font, color: MUTED })
  right(page, balance >= 0 ? 'BALANCE TO RETURN' : 'BALANCE OWED BY CHARTERER', W - M, y, 8, bold, GOLD)
  right(page, `${ccy} ${money(Math.abs(balance))}`, W - M, y - 18, 16, bold, INK)
  y -= 58

  // Summary strip
  const cols = [['APA received', received], ['Spent', spent], ['Returned', returned], ['Balance', balance]] as const
  const cw = (W - 2 * M) / cols.length
  page.drawRectangle({ x: M, y: y - 38, width: W - 2 * M, height: 44, color: rgb(0.965, 0.955, 0.93) })
  cols.forEach(([label, v], i) => {
    const x = M + i * cw + 10
    page.drawText(label, { x, y: y - 8, size: 8, font, color: MUTED })
    page.drawText(`${money(v)}`, { x, y: y - 26, size: 11, font: bold, color: INK })
  })
  y -= 66

  // Spend by category
  if (byCat.size) {
    page.drawText('SPENT BY CATEGORY', { x: M, y, size: 8, font: bold, color: GOLD })
    y -= 16
    for (const [label, amt] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
      page.drawText(safe(label), { x: M, y, size: 9.5, font, color: INK })
      right(page, money(amt), W - M - 60, y, 9.5, font)
      right(page, spent ? `${Math.round((amt / spent) * 100)}%` : '', W - M, y, 9, font, MUTED)
      y -= 14
    }
    y -= 12
  }

  // Every item
  const X = { date: M, item: M + 70, cat: M + 300, amt: W - M }
  const tableHeader = () => {
    page.drawText('Date', { x: X.date, y, size: 8, font: bold, color: MUTED })
    page.drawText('Item', { x: X.item, y, size: 8, font: bold, color: MUTED })
    page.drawText('Category', { x: X.cat, y, size: 8, font: bold, color: MUTED })
    right(page, `Amount (${ccy})`, X.amt, y, 8, bold, MUTED)
    y -= 8
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: INK })
    y -= 14
  }
  tableHeader()
  if (opts.opening) {
    page.drawText('—', { x: X.date, y, size: 9, font, color: INK })
    page.drawText('Opening APA', { x: X.item, y, size: 9, font, color: INK })
    right(page, `+${money(opts.opening)}`, X.amt, y, 9, font)
    y -= 19
  }
  for (const e of entries) {
    if (y < M + 70) {
      page = pdf.addPage([W, H])
      y = header(page)
      tableHeader()
    }
    const item = [e.supplier, e.description].filter(Boolean).join(' — ') || (e.kind === 'funds_in' ? 'APA received' : e.kind === 'return' ? 'Returned to charterer' : 'Expense')
    const shown = font.widthOfTextAtSize(safe(item), 9) > 220 ? `${safe(item).slice(0, 44)}…` : safe(item)
    page.drawText(fmtDate(e.entry_date), { x: X.date, y, size: 9, font, color: INK })
    page.drawText(shown, { x: X.item, y, size: 9, font, color: INK })
    page.drawText(safe(e.kind === 'expense' ? categoryLabel(e.category) : e.kind === 'funds_in' ? 'APA received' : 'Returned'), { x: X.cat, y, size: 9, font, color: MUTED })
    right(page, `${e.kind === 'expense' || e.kind === 'return' ? '-' : '+'}${money(Number(e.amount))}`, X.amt, y, 9, e.kind === 'expense' ? font : bold)
    y -= 6
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: RULE })
    y -= 13
  }
  y -= 4
  page.drawText(balance >= 0 ? 'Balance to return' : 'Balance owed by the charterer', { x: X.cat, y, size: 10, font: bold, color: INK })
  right(page, `${ccy} ${money(Math.abs(balance))}`, X.amt, y, 11, bold)
  y -= 34
  if (y > M + 20) {
    page.drawText('Receipts for every item are held on board and available on request.', { x: M, y, size: 8.5, font, color: MUTED })
    if (opts.preparedBy) page.drawText(safe(`Prepared by ${opts.preparedBy}`), { x: M, y: y - 13, size: 8.5, font, color: MUTED })
  }

  for (const p of pdf.getPages()) {
    p.drawLine({ start: { x: M, y: M - 10 }, end: { x: W - M, y: M - 10 }, thickness: 0.5, color: RULE })
    p.drawText(safe(`${opts.vesselName} · APA statement`), { x: M, y: M - 24, size: 7.5, font, color: MUTED })
    right(p, `Page ${pdf.getPages().indexOf(p) + 1} of ${pdf.getPageCount()}`, W - M, M - 24, 7.5, font, MUTED)
  }
  return pdf.save()
}
