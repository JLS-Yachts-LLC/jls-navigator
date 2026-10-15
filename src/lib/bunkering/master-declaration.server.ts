/**
 * Builds the Master's declaration PDF (A4, one page), pre-filled from an enquiry or blank. The wording of the declaration is JLS's own
 * form, word for word; only the fields JLS already knows are filled in.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { declarationDate, type DeclarationPrefill } from '@/lib/bunkering/master-declaration'
import { JLS_COMPANY } from '@/lib/brand/jls-company'

const NAVY = rgb(0.05, 0.10, 0.16)
const GREY = rgb(0.45, 0.49, 0.54)
const W = 595.28, H = 841.89, M = 56

/** The standard fonts only carry Latin-1: anything else a person typed becomes "?" rather than failing the whole PDF. */
export function pdfSafe(s: string): string {
  return String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of pdfSafe(text).split(' ')) {
    const trial = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(trial, size) <= maxW) line = trial
    else { if (line) out.push(line); line = word }
  }
  if (line) out.push(line)
  return out
}

export async function buildMasterDeclaration(prefill: Partial<DeclarationPrefill> = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page: PDFPage = doc.addPage([W, H])
  let y = H - 50
  const centre = (s: string, size: number, f: PDFFont, color = NAVY) => {
    const t = pdfSafe(s)
    page.drawText(t, { x: (W - f.widthOfTextAtSize(t, size)) / 2, y, size, font: f, color })
  }
  const paragraph = (s: string, size = 10, gap = 14, f = font, color = NAVY) => {
    for (const l of wrap(s, f, size, W - 2 * M)) { page.drawText(l, { x: M, y, size, font: f, color }); y -= gap }
  }

  // letterhead
  centre('JLS YACHTS LLC', 16, bold); y -= 16
  centre(JLS_COMPANY.address, 8.5, font, GREY); y -= 12
  centre('Tel.: +971 (0)4 447 0782 | E-mail: info@jlsyachts.com | Web: www.jlsyachts.com', 8.5, font, GREY); y -= 14
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: GREY })
  y -= 30

  centre('DECLARATION FOR INTERNATIONAL TRANSPORTATION', 13, bold); y -= 28
  paragraph('This declaration is pursuant to Article (45) clause (7) of the Federal Decree-Law No. (8) of 2017 on Value Added Tax and Article (33) of the Cabinet Decision No. (52) of 2017 on the Executive Regulations of the Federal Decree-Law No (8) of 2017 on Value Added Tax, which allows supply of goods to ships as part of international transportation services for passengers and goods to be eligible for Zero rating of VAT.')
  y -= 10

  // fields: a value where JLS knows it, otherwise a dotted line for the Master to fill in
  const field = (label: string, value = '') => {
    page.drawText(pdfSafe(label), { x: M, y, size: 10, font: bold, color: NAVY })
    const x = M + 190
    const v = pdfSafe(value)
    if (v) page.drawText(v, { x, y, size: 10, font, color: NAVY })
    page.drawLine({ start: { x, y: y - 3 }, end: { x: W - M, y: y - 3 }, thickness: 0.6, color: GREY, dashArray: [1, 2.5] })
    y -= 24
  }
  field('Ship arrival date:')
  field('Date of bunker supply:', declarationDate(prefill.bunkerDate))
  field('Port of bunker supply:', prefill.portOfSupply ?? '')
  field('Name of Ship:', prefill.shipName ?? '')
  field('IMO number:', prefill.imo ?? '')
  field('Last port of call:')
  field('Load port (if other than last port):')
  field('Next Port of call:')
  field('Final destination port (if next port is in UAE):')
  y -= 4

  paragraph('I hereby declare that the ship transportation service where the bunker was supplied is in one of the following categories (tick as appropriate):')
  y -= 4
  const box = (text: string) => {
    page.drawRectangle({ x: M + 4, y: y - 2, width: 12, height: 12, borderColor: NAVY, borderWidth: 1 })
    const lines = wrap(text, font, 10, W - 2 * M - 34)
    for (const l of lines) { page.drawText(l, { x: M + 26, y, size: 10, font, color: NAVY }); y -= 14 }
    y -= 6
  }
  box('a) Transporting passengers or goods from a place in the United Arab Emirates to a place outside the United Arab Emirates.')
  box('b) Sailing within the United Arab Emirates Territorial waters')
  y -= 6

  field('Name of Master:', prefill.masterName ?? '')
  field('Signature:')
  field('Date:')
  y -= 4
  page.drawText('Ship Stamp:', { x: M, y, size: 10, font: bold, color: NAVY })
  page.drawRectangle({ x: M + 190, y: y - 70, width: 170, height: 84, borderColor: GREY, borderWidth: 0.8, borderDashArray: [2, 3] })
  y -= 96

  y = Math.min(y, 90)
  paragraph('* This declaration must be returned to the supplier of bunkers along with the bunker delivery receipt for us to invoice the supply at zero rate or at standard rate as applicable under the United Arab Emirates Tax laws.', 8, 11, font, GREY)

  return doc.save()
}
