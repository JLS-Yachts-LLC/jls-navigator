/**
 * Builds the Bunker Delivery Note PDF (A4, one page) from JLS's "Bunker Delivery" sheet, pre-filled from an approved enquiry.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { BDN_DECLARATION, type BdnPrefill } from '@/lib/bunkering/bdn'
import { pdfSafe } from '@/lib/bunkering/master-declaration.server'

const NAVY = rgb(0.05, 0.10, 0.16)
const GREY = rgb(0.45, 0.49, 0.54)
const LINE = rgb(0.80, 0.83, 0.86)
const W = 595.28, H = 841.89, M = 36
const COL = (W - 2 * M) / 2          // two columns

export async function buildBunkerDeliveryNote(p: Partial<BdnPrefill> = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page: PDFPage = doc.addPage([W, H])
  let y = H - 36

  const text = (s: string, x: number, yy: number, size = 8.5, f: PDFFont = font, color = NAVY) => page.drawText(pdfSafe(s), { x, y: yy, size, font: f, color })
  const hr = (yy: number, x1 = M, x2 = W - M) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.5, color: LINE })
  const bar = (title: string) => {
    page.drawRectangle({ x: M, y: y - 3, width: W - 2 * M, height: 14, color: rgb(0.92, 0.94, 0.96) })
    text(title, M + 6, y + 1, 9, bold)
    y -= 20
  }
  /** label: value, with a dotted line when there is no value. `x` is the column start, `w` its width. */
  const field = (label: string, value: string | undefined, x: number, w: number) => {
    text(label, x, y, 8, bold, GREY)
    const lx = x + Math.min(96, w * 0.42)
    if (value) text(value, lx, y, 8.5)
    page.drawLine({ start: { x: lx, y: y - 2.5 }, end: { x: x + w - 8, y: y - 2.5 }, thickness: 0.5, color: LINE, dashArray: [1, 2] })
  }
  const tick = (label: string, x: number, ticked = false) => {
    page.drawRectangle({ x, y: y - 2, width: 8, height: 8, borderColor: NAVY, borderWidth: 0.8 })
    if (ticked) { text('x', x + 1.6, y - 0.5, 8, bold) }
    text(label, x + 12, y, 8.5)
  }
  const row = (gap = 17) => { y -= gap }

  // ── heading ──
  text('JLS YACHTS LLC', M, y, 13, bold)
  const title = 'BUNKER DELIVERY NOTE'
  text(title, W - M - bold.widthOfTextAtSize(title, 13), y, 13, bold)
  y -= 14
  text('Bunker Supply', M, y, 8.5, font, GREY)
  y -= 18
  field('BDN No.', p.bdnNumber, M, COL); field('PTW No.', undefined, M + COL, COL)
  row(22)

  // ── 1. receiving vessel ──
  bar("Receiving Vessel's Particulars")
  field('Vessel Name', p.vesselName, M, COL); field('Flag', p.flag, M + COL, COL); row()
  field('IMO No.', p.imo, M, COL); field('LOA (m)', p.loa, M + COL, COL); row()
  field('Official No.', undefined, M, COL); field('Draft (m)', undefined, M + COL, COL); row()
  field('Delivery Port', p.deliveryPort, M, COL); field('Berth No.', p.berth, M + COL, COL); row(22)

  // ── 2. connection ──
  bar('Camlock, hose and manifold')
  text('Camlock', M, y, 8, bold, GREY); tick('Adaptor (Male)', M + 70); tick('Coupler (Female)', M + 170); field('Size (dia.)', undefined, M + COL, COL); row()
  field('Hose length (m)', undefined, M, COL); field('Hose size (dia.)', undefined, M + COL, COL); row()
  text('Manifold location', M, y, 8, bold, GREY); tick('Fwd', M + 90); tick('Mid', M + 150); tick('Aft', M + 210)
  text('Mark the bunker manifold location on the vessel diagram.', M + COL, y, 7.5, font, GREY); row(22)

  // ── 3. fuel requirement ──
  bar('Bunker Fuel Requirement')
  field('Fuel Grade', p.grade, M, COL); field('Description', p.description, M + COL, COL); row()
  field('Max. Sulfur Cont.', p.maxSulphur, M, COL); field('Specs.', p.specs, M + COL, COL); row()
  field('Min. Qty', undefined, M, COL / 2); field('Max. Qty', p.maxQty, M + COL / 2, COL / 2); field('UoM', p.uom, M + COL, COL); row()
  field('Bunker Rate / Hour', undefined, M, COL); row()
  text('Delivery Method', M, y, 8, bold, GREY); tick('Ex-Wharf', M + 92, p.deliveryMethodTick === 'Ex-Wharf'); tick('Ex-Truck', M + 160, p.deliveryMethodTick === 'Ex-Truck')
  if (p.deliveryMethodText && !p.deliveryMethodTick) text(`(requested: ${p.deliveryMethodText})`, M + 230, y, 7.5, font, GREY)
  text('Berth Alongside', M + COL, y, 8, bold, GREY); tick('Port', M + COL + 92); tick('Stbd', M + COL + 140); row(22)

  // ── 4. supplier ──
  bar('Bunker Supplier')
  field('Name', p.supplierName, M, COL); field('Driver Name', undefined, M + COL, COL); row()
  field('Address', undefined, M, COL); field('Tanker No.', undefined, M + COL, COL); row()
  field('Contact No.', p.supplierContact, M, COL); field('Tanker Capacity', undefined, M + COL, COL); row(22)

  // ── 5. delivery log and fuel properties ──
  bar('Bunker Delivery Log')
  text('Description', M, y, 8, bold, GREY); text('Date', M + 100, y, 8, bold, GREY); text('Time (24 h)', M + 160, y, 8, bold, GREY)
  text('Fuel Grade', M + COL, y, 8, bold, GREY); y -= 14
  const log: Array<[string, string, string]> = [['Alongside', '', ''], ['Bunker Commence', '', ''], ['Bunker Complete', '', '']]
  const props: Array<[string, string | undefined]> = [
    ['Product Grade', p.grade], ['Viscosity @ 50 C (cSt)', undefined], ['Sulfur Content (% m/m)', undefined],
    ['Flash Point (C)', undefined], ['Density @ 15 C (kg/m3)', undefined], ['Delivered (Mt.)', p.deliveredQty],
  ]
  let ly = y
  for (const [label] of log) { text(label, M, ly, 8.5); page.drawLine({ start: { x: M + 100, y: ly - 2.5 }, end: { x: M + 150, y: ly - 2.5 }, thickness: 0.5, color: LINE, dashArray: [1, 2] }); page.drawLine({ start: { x: M + 160, y: ly - 2.5 }, end: { x: M + 215, y: ly - 2.5 }, thickness: 0.5, color: LINE, dashArray: [1, 2] }); ly -= 17 }
  text('Date: DD-MM-YY   Time: 24 hour', M, ly + 2, 7.5, font, GREY)
  let py = y
  for (const [label, value] of props) {
    text(label, M + COL, py, 8, bold, GREY)
    if (value) text(value, M + COL + 112, py, 8.5)
    page.drawLine({ start: { x: M + COL + 112, y: py - 2.5 }, end: { x: W - M - 8, y: py - 2.5 }, thickness: 0.5, color: LINE, dashArray: [1, 2] })
    py -= 15
  }
  y = Math.min(ly, py) - 10

  // ── 6. declaration ──
  bar('Declaration')
  const wrapDraw = (s: string, x: number, maxW: number, size = 8.5) => {
    let line = ''
    for (const word of pdfSafe(s).split(' ')) {
      const t = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(t, size) <= maxW) line = t
      else { text(line, x, y, size); y -= 11; line = word }
    }
    if (line) { text(line, x, y, size); y -= 11 }
  }
  wrapDraw(BDN_DECLARATION.lead, M, W - 2 * M)
  for (const o of BDN_DECLARATION.options) { page.drawRectangle({ x: M + 6, y: y - 2, width: 8, height: 8, borderColor: NAVY, borderWidth: 0.8 }); wrapDraw(o, M + 22, W - 2 * M - 24) }
  y -= 8

  // ── 7. signatures ──
  const sig = (heading: string, x: number, who: string, stamp: string) => {
    let sy = y
    text(heading, x, sy, 8.5, bold); sy -= 15
    for (const label of ['Date / Time', who, 'Signature']) {
      text(label, x, sy, 8, bold, GREY); page.drawLine({ start: { x: x + 78, y: sy - 2.5 }, end: { x: x + COL - 150, y: sy - 2.5 }, thickness: 0.5, color: LINE, dashArray: [1, 2] }); sy -= 17
    }
    page.drawRectangle({ x: x + COL - 140, y: y - 62, width: 118, height: 62, borderColor: LINE, borderWidth: 0.8, borderDashArray: [2, 3] })
    text(stamp, x + COL - 136, y - 10, 7.5, font, GREY)
  }
  sig('Vessel', M, 'Master / Ch. Eng.', 'Vessel Stamp')
  sig('Supplier', M + COL, 'Supplier Name', 'Supplier Stamp')

  return doc.save()
}
