/**
 * ShipSync automations — delivery-note PDF generation/storage and the
 * proof-of-delivery email. Mirrors the PowerApp flows, server-side.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendEmail } from '@/lib/ses.server'
import { buildDeliveryNotePdf } from '@/lib/shipsync/pdf.server'
import type { ShipSyncDeliveryNote, ShipSyncPackage } from '@/lib/shipsync/model'

const db = () => supabaseAdmin as any
const LOGISTICS = (process.env as any).SHIPSYNC_LOGISTICS_EMAIL ?? 'logistics@jlsyachts.com'

async function loadNote(noteId: string): Promise<{ note: ShipSyncDeliveryNote; packages: ShipSyncPackage[] }> {
  const { data: note } = await db().from('shipsync_delivery_notes').select('*').eq('id', noteId).maybeSingle()
  if (!note) throw new Error('Delivery note not found')
  const { data: packages } = await db().from('shipsync_packages').select('*').eq('delivery_note_id', noteId).order('boat_name')
  return { note, packages: packages ?? [] }
}

/** Build the note PDF, store it in the shipsync bucket, and save the URL. */
export async function generateNotePdf(noteId: string, kind: 'predelivery' | 'delivery'): Promise<string> {
  const { note, packages } = await loadNote(noteId)

  // Driver name for the note header.
  let driverName: string | null = null
  if (note.driver_id) {
    const { data: driver } = await db().from('shipsync_drivers').select('name').eq('id', note.driver_id).maybeSingle()
    driverName = driver?.name ?? null
  }

  // Saved berth per boat (a multi-boat note has no single destination_address).
  const boatNames = Array.from(new Set(packages.map((p) => p.boat_name).filter(Boolean) as string[]))
  const destByBoat = new Map<string, string | null>()
  if (boatNames.length) {
    const { data: dests } = await db().from('shipsync_destinations').select('boat_name, address').in('boat_name', boatNames)
    for (const d of dests ?? []) destByBoat.set(d.boat_name, d.address ?? null)
  }

  const bytes = await buildDeliveryNotePdf(note, packages, kind, { driverName, destByBoat })
  const path = `delivery-notes/${note.number ?? noteId}/${kind}-${Date.now()}.pdf`
  const up = await supabaseAdmin.storage.from('shipsync').upload(path, bytes, { upsert: true, contentType: 'application/pdf' })
  if (up.error) throw up.error
  const url = supabaseAdmin.storage.from('shipsync').getPublicUrl(path).data.publicUrl
  const field = kind === 'predelivery' ? 'predelivery_pdf_url' : 'delivery_pdf_url'
  await db().from('shipsync_delivery_notes').update({ [field]: url }).eq('id', noteId)
  return url
}

/** Email proof of delivery — links to the delivery-note PDF + a short summary. */
export async function emailProofOfDelivery(noteId: string, toOverride?: string): Promise<{ to: string }> {
  const { note, packages } = await loadNote(noteId)
  let pdfUrl = note.delivery_pdf_url
  if (!pdfUrl) pdfUrl = await generateNotePdf(noteId, 'delivery')

  const to = toOverride
    ?? packages.map((p) => p.receiver_email).find(Boolean)
    ?? null
  if (!to) throw new Error('No recipient email — set a receiver email on a package or pass one explicitly.')

  const ref = `DN-${note.number ?? noteId}`
  const subject = `Proof of delivery — ${note.boat_name ?? ''} (${ref})`
  const rows = packages.map((p) => `<tr><td style="padding:4px 10px 4px 0;font-family:monospace">${esc(p.barcode ?? '—')}</td><td style="padding:4px 0;color:#555">${esc(p.package_owner ?? '')}</td></tr>`).join('')
  const html = shell(
    `<h1 style="margin:0 0 10px;font-size:18px;color:#0d1520">Delivery complete — ${esc(note.boat_name ?? '')}</h1>
     <p style="margin:8px 0;font-size:14px;color:#333">The packages below for delivery note <strong>${ref}</strong> have been delivered.</p>
     <table style="margin:12px 0;font-size:13px;color:#333">${rows}</table>
     <p style="margin:14px 0"><a href="${pdfUrl}" style="display:inline-block;background:#0d6efd;color:#fff;text-decoration:none;padding:9px 16px;border-radius:7px;font-size:13px">View delivery note (PDF)</a></p>
     <p style="margin:8px 0;font-size:12px;color:#7a828a">JLS Yachts Logistics</p>`,
  )
  const txt = `Delivery complete for ${note.boat_name ?? ''} (${ref}). Delivery note: ${pdfUrl}`
  await sendEmail({ to: [to], cc: [LOGISTICS], subject, html, text: txt })
  return { to }
}

const esc = (s: string) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function shell(content: string): string {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f4f6f8;margin:0;padding:24px">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table width="100%" style="max-width:560px;background:#fff;border-radius:10px;border:1px solid #e4e8ec;overflow:hidden">
      <tr><td style="background:#0d1520;padding:16px 24px"><span style="color:#fff;font-size:16px;font-weight:700">JLS Yachts — ShipSync</span></td></tr>
      <tr><td style="padding:24px">${content}</td></tr>
    </table></td></tr></table></body></html>`
}
