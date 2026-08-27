/**
 * ShipSync "arriving in ~5 minutes" alert — email the package receiver once
 * their delivery van's real driving-time ETA to the destination drops to 5
 * minutes or under.
 *
 * Runs on the 5-min cron tick (worker-entry.ts). For every dispatched,
 * not-yet-notified, single-boat delivery note (destination_lat/lng only get
 * set for single-boat routes — see createDeliveryNote() in data.ts — so a
 * multi-boat route is skipped rather than alerting for the wrong stop):
 *   1. Look up the assigned van's live position (crew_vehicles, the same
 *      table the myGPS sync writes to — shipsync_delivery_notes.vehicle_id
 *      references it directly).
 *   2. Ask Google's Routes API for the real driving-time ETA from that
 *      position to the note's destination (not a straight-line distance
 *      guess — accuracy matters for a specific "5 minutes" claim, and roads
 *      around a marina rarely go in a straight line).
 *   3. If the ETA is <= 5 minutes, email the package receiver and mark the
 *      note so it never fires twice for the same delivery.
 *
 * Silent no-ops (logged, not thrown) when: no van assigned, no recent GPS fix
 * (older than 10 min — stale enough that trusting it would be misleading),
 * or the Google Maps integration isn't configured/enabled. All of these are
 * expected states for plenty of notes and shouldn't spam error logs.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendEmail } from '@/lib/ses.server'
import type { ShipSyncPackage } from '@/lib/shipsync/model'

const db = () => supabaseAdmin as any
const LOGISTICS = (process.env as any).SHIPSYNC_LOGISTICS_EMAIL ?? 'logistics@jlsyachts.com'

const ETA_THRESHOLD_SECONDS = 5 * 60
const GPS_STALE_AFTER_MINUTES = 10

async function getGoogleMapsKey(): Promise<string | null> {
  const { data } = await db()
    .from('integration_settings')
    .select('enabled, config')
    .eq('integration_name', 'google_maps')
    .maybeSingle()
  if (!data?.enabled) return null
  const key = data?.config?.api_key
  return typeof key === 'string' && key.trim() ? key.trim() : null
}

/** Real driving-time ETA in seconds, via the same Google Routes API v2 call
 *  lib/google-maps.ts makes client-side — server-to-server here. Returns
 *  null (never throws) so one bad route can't take the whole tick down;
 *  callers just skip that note and try again next tick. */
async function drivingEtaSeconds(key: string, origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): Promise<number | null> {
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.duration',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode: 'DRIVE',
      }),
    })
    const text = await res.text()
    if (!res.ok) {
      // The stored key is documented as a browser key restricted by HTTP
      // referrer (google-maps.ts) — a server-to-server call carries no
      // Referer header, so this is the single most likely failure and worth
      // calling out distinctly rather than a generic "route failed" log line.
      if (/referer|referrer|API keys with referer/i.test(text)) {
        console.error('[shipsync-proximity] Google Maps key rejected the server call — it looks referrer-restricted. Either add an unrestricted/IP-restricted server key, or loosen the existing key\'s referrer restriction in Google Cloud Console.')
      } else {
        console.error(`[shipsync-proximity] Routes API ${res.status}: ${text.slice(0, 300)}`)
      }
      return null
    }
    const data = JSON.parse(text)
    const durSec = Number(String(data?.routes?.[0]?.duration ?? '').replace(/s$/, ''))
    return isNaN(durSec) ? null : durSec
  } catch (e) {
    console.error('[shipsync-proximity] Routes API request failed:', e instanceof Error ? e.message : String(e))
    return null
  }
}

function fmtEta(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60))
  return mins === 1 ? '1 minute' : `${mins} minutes`
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

async function sendArrivalSoonEmail(to: string, boatName: string | null, etaSeconds: number, packages: ShipSyncPackage[]): Promise<void> {
  const boat = esc(boatName ?? 'your vessel')
  const etaLabel = fmtEta(etaSeconds)
  const rows = packages.map((p) => `<tr><td style="padding:4px 10px 4px 0;font-family:monospace">${esc(p.barcode ?? '—')}</td><td style="padding:4px 0;color:#555">${esc(p.package_owner ?? '')}</td></tr>`).join('')
  const html = shell(
    `<h1 style="margin:0 0 10px;font-size:18px;color:#0d1520">Arriving in ~${etaLabel} — ${boat}</h1>
     <p style="margin:8px 0;font-size:14px;color:#333">Your delivery is about ${etaLabel} away.</p>
     <table style="margin:12px 0;font-size:13px;color:#333">${rows}</table>
     <p style="margin:8px 0;font-size:12px;color:#7a828a">JLS Yachts Logistics</p>`,
  )
  const text = `Your delivery to ${boatName ?? ''} is about ${etaLabel} away.`
  await sendEmail({ to: [to], cc: [LOGISTICS], subject: `Arriving in ~${etaLabel} — ${boatName ?? ''}`, html, text })
}

/** Read-only diagnostic: confirms the stored Google Maps key actually works
 *  for a server-to-server Routes API call (the referrer-restriction risk
 *  documented above), using two arbitrary Dubai coordinates — no real
 *  delivery data touched, no email sent. Calls the API directly (rather than
 *  through drivingEtaSeconds) so the raw status/body come back in the
 *  response instead of only to console.error, for one-off diagnosis. */
export async function testGoogleRoutesServerSide(): Promise<Record<string, unknown>> {
  const key = await getGoogleMapsKey()
  if (!key) return { ok: false, reason: 'Google Maps integration not configured/enabled.' }
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.duration' },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: 25.0657, longitude: 55.1713 } } },
        destination: { location: { latLng: { latitude: 25.2048, longitude: 55.2708 } } },
        travelMode: 'DRIVE',
      }),
    })
    const text = await res.text()
    return { ok: res.ok, status: res.status, body: text.slice(0, 500) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface ProximityCheckResult { checked: number; notified: number; skipped: number }

export async function checkDeliveryProximity(): Promise<ProximityCheckResult> {
  const key = await getGoogleMapsKey()
  if (!key) return { checked: 0, notified: 0, skipped: 0 }

  const { data: notes } = await db()
    .from('shipsync_delivery_notes')
    .select('id, number, boat_name, vehicle_id, destination_lat, destination_lng')
    .eq('status', 'dispatched')
    .is('proximity_notified_at', null)
    .not('vehicle_id', 'is', null)
    .not('destination_lat', 'is', null)
    .not('destination_lng', 'is', null)

  let checked = 0, notified = 0, skipped = 0
  const staleCutoff = Date.now() - GPS_STALE_AFTER_MINUTES * 60_000

  for (const note of notes ?? []) {
    checked++
    const { data: van } = await db()
      .from('crew_vehicles')
      .select('last_lat, last_lon, last_location_at')
      .eq('id', note.vehicle_id)
      .maybeSingle()
    if (!van?.last_lat || !van?.last_lon) { skipped++; continue }
    if (!van.last_location_at || new Date(van.last_location_at).getTime() < staleCutoff) { skipped++; continue }

    const etaSeconds = await drivingEtaSeconds(key,
      { lat: van.last_lat, lng: van.last_lon },
      { lat: note.destination_lat, lng: note.destination_lng })
    if (etaSeconds == null || etaSeconds > ETA_THRESHOLD_SECONDS) continue

    const { data: packages } = await db()
      .from('shipsync_packages')
      .select('*')
      .eq('delivery_note_id', note.id)
    const to = (packages ?? []).map((p: ShipSyncPackage) => p.receiver_email).find(Boolean)
    if (!to) {
      // No receiver email to send to, and it won't retroactively appear —
      // mark it handled anyway so this note doesn't burn a Routes API call
      // on every future tick for the rest of its delivery window.
      skipped++
      await db().from('shipsync_delivery_notes').update({ proximity_notified_at: new Date().toISOString() }).eq('id', note.id)
      continue
    }

    try {
      await sendArrivalSoonEmail(to, note.boat_name, etaSeconds, packages ?? [])
      notified++
    } catch (e) {
      console.error(`[shipsync-proximity] email failed for note ${note.number ?? note.id}:`, e instanceof Error ? e.message : String(e))
      continue // don't mark notified — retry next tick
    }
    await db().from('shipsync_delivery_notes').update({ proximity_notified_at: new Date().toISOString() }).eq('id', note.id)
  }

  return { checked, notified, skipped }
}
