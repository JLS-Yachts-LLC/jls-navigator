/**
 * ShipSync delivery-note PDF generation (server-side, pdf-lib).
 * Produces a clean A4 note: JLS header, DN number, vessel, driver, date, a table
 * of packages (line / AWB / owner / qty) and a signature block.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { ShipSyncDeliveryNote, ShipSyncPackage } from './model'

const NAVY = rgb(0.05, 0.10, 0.16)
const GREY = rgb(0.45, 0.49, 0.54)
const LINE = rgb(0.85, 0.87, 0.89)

const UNASSIGNED = '—'

export interface BoatSignature {
  imageBytes: Uint8Array | null   // PNG bytes of the customer signature
  receiver: string | null         // who received it
  date: string | null             // delivered date (ISO or date string)
}

export interface DeliveryNotePdfOptions {
  /** Driver assigned to the run (note.driver_id resolved to a name). */
  driverName?: string | null
  /** boat_name → saved berth address, for the Destination line per boat. */
  destByBoat?: Map<string, string | null>
  /** boat_name → captured customer signature (delivery notes only). */
  sigByBoat?: Map<string, BoatSignature>
}

/** Format a date-only string (YYYY-MM-DD) or ISO timestamp as en-GB, avoiding the
 *  UTC-midnight day-shift for date-only values. */
function fmtDate(value: string | null | undefined): string {
  if (!value) return UNASSIGNED
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return isNaN(d.getTime()) ? UNASSIGNED : d.toLocaleDateString('en-GB')
}

export async function buildDeliveryNotePdf(
  note: ShipSyncDeliveryNote,
  packages: ShipSyncPackage[],
  kind: 'predelivery' | 'delivery',
  opts: DeliveryNotePdfOptions = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const W = 595.28, H = 841.89, M = 48

  // Group packages by boat — one note section (starting on a fresh page) per boat.
  const groups = new Map<string, ShipSyncPackage[]>()
  for (const p of packages) {
    const key = p.boat_name || UNASSIGNED
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }
  if (groups.size === 0) groups.set(note.boat_name || UNASSIGNED, [])
  const boats = Array.from(groups.keys()).sort((a, b) =>
    a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b))

  for (let boatIndex = 0; boatIndex < boats.length; boatIndex++) {
    const boat = boats[boatIndex]
    const boatPackages = groups.get(boat)!
    // Each boat gets its own note number: single-boat = DN-0001, multi-boat = DN-0001-1, -2, …
    const noteRef = `DN-${note.number ?? UNASSIGNED}${boats.length > 1 ? `-${boatIndex + 1}` : ''}`
    let page = doc.addPage([W, H])
    let y = H - M
    const text = (s: string, x: number, yy: number, size = 10, f = font, color = NAVY) =>
      page.drawText(s ?? '', { x, y: yy, size, font: f, color })

    // Header
    text('JLS YACHTS', M, y, 18, bold)
    text(kind === 'predelivery' ? 'PRE-DELIVERY NOTE' : 'DELIVERY NOTE', W - M - 170, y, 14, bold)
    y -= 16
    text('Yacht Logistics', M, y, 9, font, GREY)
    text(noteRef, W - M - 170, y, 11, bold)
    y -= 26
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE })
    y -= 22

    // Delivery date = the route's planned delivery date (first parcel that has one),
    // falling back to the note's delivered/created date.
    const plannedDate = boatPackages.map((p) => p.planned_delivery_date).find(Boolean)
    const deliveryDate = plannedDate
      ? fmtDate(plannedDate)
      : fmtDate(note.delivered_at ?? note.created_at ?? null)

    // Meta
    const meta: [string, string][] = [
      ['Vessel', boat === UNASSIGNED ? (note.boat_name ?? UNASSIGNED) : boat],
      ['Driver', opts.driverName || UNASSIGNED],
      ['Delivery date', deliveryDate],
      ['Destination', opts.destByBoat?.get(boat) || note.destination_address || UNASSIGNED],
      ['Packages', String(boatPackages.length)],
    ]
    for (const [k, v] of meta) {
      text(k.toUpperCase(), M, y, 8, bold, GREY)
      text(v, M + 90, y, 10)
      y -= 18
    }
    y -= 8
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE })
    y -= 20

    // Table header
    const cols = [M, M + 36, M + 220, W - M - 50]
    text('#', cols[0], y, 8, bold, GREY)
    text('AWB / REFERENCE', cols[1], y, 8, bold, GREY)
    text('OWNER', cols[2], y, 8, bold, GREY)
    text('QTY', cols[3], y, 8, bold, GREY)
    y -= 6
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE })
    y -= 16

    boatPackages.forEach((p, i) => {
      if (y < M + 120) { page = doc.addPage([W, H]); y = H - M }
      text(String(i + 1), cols[0], y, 10)
      text((p.barcode ?? UNASSIGNED).slice(0, 30), cols[1], y, 10)
      text((p.package_owner ?? UNASSIGNED).slice(0, 26), cols[2], y, 10)
      text(String(p.num_packages ?? 1), cols[3], y, 10)
      y -= 18
    })

    // Signature block — on a delivery note, fill in the captured customer signature.
    const sig = kind === 'delivery' ? opts.sigByBoat?.get(boat) : undefined
    y = Math.max(y - 30, M + 70)
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE })
    y -= 24
    text('Received by:', M, y, 9, bold, GREY)
    text('Signature:', W / 2, y, 9, bold, GREY)
    if (sig?.receiver) text(sig.receiver, M, y - 20, 11)
    if (sig?.imageBytes) {
      try {
        const png = await doc.embedPng(sig.imageBytes)
        const maxW = 190, maxH = 44
        const scale = Math.min(maxW / png.width, maxH / png.height, 1)
        page.drawImage(png, { x: W / 2, y: y - 46, width: png.width * scale, height: png.height * scale })
      } catch { /* bad image — leave the signature line blank */ }
    }
    y -= 40
    page.drawLine({ start: { x: M, y }, end: { x: M + 200, y }, thickness: 0.5, color: LINE })
    page.drawLine({ start: { x: W / 2, y }, end: { x: W / 2 + 200, y }, thickness: 0.5, color: LINE })
    y -= 14
    text(sig ? `${sig.receiver ?? ''}${sig.date ? ` · ${fmtDate(sig.date)}` : ''}` : 'Name / Designation / Date', M, y, 8, font, GREY)
  }

  return doc.save()
}
