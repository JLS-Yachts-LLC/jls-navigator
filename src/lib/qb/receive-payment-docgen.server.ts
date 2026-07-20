/**
 * QB (Receive Payment) — native port of the n8n workflow (no n8n/OneDrive/ConvertAPI).
 *
 * On a Payment created webhook: fetch the payment + customer, render a branded
 * Sales Receipt PDF (amount in words, dirhams/fils) natively and attach it to the
 * QBO Payment. Gated by the qb-payment-doc toggle (default OFF). The n8n version
 * used a OneDrive .docx template + ConvertAPI (and a hardcoded token) — both are
 * dropped; the receipt is drawn directly with pdf-lib.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { deepWinAnsiSafe } from '@/lib/pdf-winansi'
import { qboRequest, qboConfigured } from './qbo.server'
import { admin, fmtAlways, docgenGuard, attachAndLog, docgenToggle } from './doc-common.server'

// ── Verbatim helpers from the n8n Code nodes ───────────────────────────────────
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const SCALES = ['', ' thousand', ' million', ' billion', ' trillion']

function threeDigitsToWords(n: number): string {
  let s = ''
  const h = Math.floor(n / 100), r = n % 100
  if (h) s += ONES[h] + ' hundred' + (r ? ' ' : '')
  if (r < 20) s += ONES[r]
  else s += TENS[Math.floor(r / 10)] + (r % 10 ? '-' + ONES[r % 10] : '')
  return s
}

function numberToWords(amount: number): string {
  const dhs = Math.floor(amount)
  const decimalPart = Math.round((amount - dhs) * 100)
  let words = ''
  if (dhs === 0) words = 'zero'
  else {
    const groups: number[] = []
    let n = dhs
    while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000) }
    words = groups
      .map((g, i) => (g ? threeDigitsToWords(g) + SCALES[i] : ''))
      .filter(Boolean).reverse().join(' ')
  }
  if (decimalPart > 0) {
    words += ' point'
    for (const d of String(decimalPart).padStart(2, '0')) words += ' ' + (ONES[Number(d)] || 'zero')
  }
  words += ' only'
  return words.replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDateSlash(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}
const withCommas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

type ReceiptData = {
  receiptNo: string; date: string; receivedFrom: string; sumInWords: string
  dhs: string; fils: number; totalAmt: number; currency: string
}

async function buildSalesReceiptPdf(r: ReceiptData): Promise<Uint8Array> {
  r = deepWinAnsiSafe(r) // stop pdf-lib crashing on non-WinAnsi chars
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const NAVY = rgb(0.03, 0.16, 0.28), GREY = rgb(0.45, 0.45, 0.45), LINE = rgb(0.75, 0.78, 0.82)
  const PW = 595.28, PH = 841.89, M = 48
  const page = pdf.addPage([PW, PH])
  let y = PH - M

  page.drawText('JLS YACHTS LLC', { x: M, y: y - 6, size: 17, font: bold, color: NAVY })
  const title = 'SALES RECEIPT'
  page.drawText(title, { x: PW - M - bold.widthOfTextAtSize(title, 17), y: y - 6, size: 17, font: bold, color: NAVY })
  y -= 24
  page.drawText('Port Operations & Agency · Dubai, UAE', { x: M, y, size: 8, font, color: GREY })
  y -= 18
  page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 1, color: NAVY })
  y -= 34

  const label = (t: string, yy: number) => page.drawText(t, { x: M, y: yy, size: 9, font: bold, color: GREY })
  const value = (t: string, yy: number) => page.drawText(t, { x: M + 130, y: yy, size: 11, font, color: NAVY })
  const row = (l: string, v: string) => { label(l, y); value(v, y); y -= 26 }

  row('Receipt No', r.receiptNo)
  row('Date', r.date)
  row('Received from', r.receivedFrom)

  // Sum in words — wrapped
  label('The sum of', y)
  const words = r.sumInWords
  const maxW = PW - M - (M + 130)
  const lines: string[] = []
  let rest = words
  while (rest.length) {
    if (font.widthOfTextAtSize(rest, 11) <= maxW) { lines.push(rest); break }
    let cut = rest.length
    while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), 11) > maxW) cut--
    const sp = rest.lastIndexOf(' ', cut); cut = sp > 0 ? sp : cut
    lines.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim()
  }
  lines.forEach((ln, i) => page.drawText(ln, { x: M + 130, y: y - i * 15, size: 11, font, color: NAVY }))
  y -= Math.max(26, lines.length * 15 + 8)

  row('Cash / Cheque No', r.receiptNo)
  row('Dated', r.date)

  // Amount box
  y -= 10
  page.drawRectangle({ x: M, y: y - 30, width: PW - 2 * M, height: 40, borderColor: LINE, borderWidth: 1 })
  page.drawText(`${r.currency}`, { x: M + 14, y: y - 12, size: 9, font: bold, color: GREY })
  const amtStr = `${r.dhs} Dhs  ${String(r.fils).padStart(2, '0')} Fils`
  page.drawText(amtStr, { x: M + 14, y: y - 26, size: 13, font: bold, color: NAVY })
  const grand = `${r.currency} ${fmtAlways(r.totalAmt)}`
  page.drawText(grand, { x: PW - M - 14 - bold.widthOfTextAtSize(grand, 13), y: y - 22, size: 13, font: bold, color: NAVY })
  y -= 70

  page.drawText('Received with thanks.', { x: M, y, size: 9, font, color: GREY })
  page.drawText('Authorised Signature', { x: PW - M - 150, y: M + 20, size: 9, font, color: GREY })
  page.drawLine({ start: { x: PW - M - 150, y: M + 34 }, end: { x: PW - M, y: M + 34 }, thickness: 0.6, color: LINE })
  page.drawText(`Sales Receipt ${r.receiptNo} — JLS Yachts LLC`, { x: M, y: M - 6, size: 7, font, color: GREY })

  return pdf.save()
}

export async function runReceivePaymentDocgen(entityId: string, rawType: string): Promise<string> {
  if (!qboConfigured()) return 'qbo-not-configured'
  // The n8n workflow handles payment CREATE only.
  // Intuit sends present-tense event types ('qbo.payment.create'); accept the
  // past-tense form too so the gate can't silently skip every real payment.
  if (!rawType.includes('.create')) return 'payment-skip-non-create'
  const sb = admin() as any

  const toggle = await docgenToggle(sb, 'qb-payment-doc', 'QB Receive Payment — Sales Receipt',
    'Native port of the n8n QB (Receive Payment) workflow: on a payment created, renders a branded Sales Receipt PDF (amount in words) on the worker and attaches it to the Payment in QuickBooks. No n8n, OneDrive or ConvertAPI.')
  if (toggle === 'seeded') return 'docgen-disabled (toggle "QB Receive Payment — Sales Receipt" in Automations)'
  if (!toggle) return 'docgen-disabled'

  const fetched = await qboRequest('GET', `/payment/${entityId}?minorversion=73`)
  const payment = fetched?.Payment
  if (!payment) return 'payment-not-found'
  const lastUpdated = String(payment.MetaData?.LastUpdatedTime ?? '')
  const createTime = String(payment.MetaData?.CreateTime ?? '')

  const skip = await docgenGuard(sb, 'Payment', entityId, rawType, lastUpdated)
  if (skip) return skip

  let customerName = payment.CustomerRef?.name ?? ''
  const custId = payment.CustomerRef?.value
  if (custId) {
    const cust = await qboRequest('GET', `/customer/${custId}?minorversion=73`).catch(() => null)
    customerName = cust?.Customer?.DisplayName || customerName
  }

  const totalAmt = Number(payment.TotalAmt || 0)
  const dhs = Math.floor(totalAmt)
  const fils = Math.round((totalAmt - dhs) * 100)
  const receiptNo = String(payment.PaymentRefNum || payment.Id)
  const data: ReceiptData = {
    receiptNo: `SR26-${receiptNo}`,
    date: formatDateSlash(payment.MetaData?.CreateTime),
    receivedFrom: customerName || 'Customer',
    sumInWords: numberToWords(totalAmt),
    dhs: withCommas(dhs),
    fils,
    totalAmt,
    currency: payment.CurrencyRef?.value || 'AED',
  }
  const pdfBytes = await buildSalesReceiptPdf(data)

  return attachAndLog({
    sb, entity: 'Payment', entityId, docType: 'Payment', docNumber: receiptNo,
    filenamePrefix: 'Sales Receipt - ',
    files: [{ name: `Sales Receipt - ${data.receiptNo}.pdf`, bytes: pdfBytes, contentType: 'application/pdf' }],
    createTime, fetchPath: `/payment/${entityId}?minorversion=73`, stampField: 'Payment',
  })
}
