/**
 * POST /api/compass-card/event — Compass Card tells Polaris something happened.
 *
 * Called by compasscard.online (the crew app API, admin portal and vendor portal)
 * when a crew member signs up, a vendor asks to join or is approved / rejected,
 * and an offer is submitted or approved / rejected. Signed with Compass Card's private key
 * (see lib/compass-card/events.server for the format); anything unsigned, stale
 * or badly signed is refused. Each event is stored once, the bell rings from the
 * database, and email goes out now if it's switched on.
 */
import { loadPublicKey, verifySignature, shapeEvent, storeEvent } from '@/lib/compass-card/events.server'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

/** Bodies are small; anything bigger is not a Compass Card event. */
const MAX_BODY = 32 * 1024

export async function compassCardEventHandler(request: Request, ctx?: { waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const raw = await request.text()
  if (raw.length > MAX_BODY) return json({ ok: false, error: 'Too large' }, 413)

  const publicKey = await loadPublicKey()
  if (!publicKey) return json({ ok: false, error: 'Not configured' }, 503)
  const bad = await verifySignature(publicKey, raw, request.headers.get('x-compass-timestamp'), request.headers.get('x-compass-signature'))
  if (bad) return json({ ok: false, error: bad }, 401)

  let body: unknown
  try { body = JSON.parse(raw) } catch { return json({ ok: false, error: 'Body is not JSON' }, 400) }
  const shaped = shapeEvent(body)
  if (typeof shaped === 'string') return json({ ok: false, error: shaped }, 400)

  try {
    const r = await storeEvent(shaped)
    if (r.result === 'created') {
      const send = import('@/lib/compass-card/alerts.server')
        .then((m) => m.sendCompassCardAlerts())
        .catch((e) => console.error('[compass-card-alerts] error:', e instanceof Error ? e.message : String(e)))
      if (ctx) ctx.waitUntil(send); else await send
    }
    return json({ ok: true, result: r.result })
  } catch (e) {
    console.error('[compass-card-event] store failed:', e instanceof Error ? e.message : String(e))
    return json({ ok: false, error: 'Could not store the event' }, 500)
  }
}
