/**
 * POST /api/print-connector/poll — the print connector on the office network collects
 * label jobs and reports how the last ones went.
 *
 * The connector (tools/print-connector) signs in with the token it was given when it
 * was added under ShipSync → Printers; only that token's SHA-256 is stored. Each call:
 *   1. records that the connector is alive (and its host name and version),
 *   2. stores the results of jobs it has finished and the status it read from its printers,
 *   3. waits up to `wait` seconds (max 25) for a job, so a label prints about a second
 *      after it is queued without the connector hammering this endpoint,
 *   4. returns its printers (to watch) and any jobs, rendered to ZPL here — the queue
 *      holds label contents, never printer commands (see src/lib/printing/zpl.ts).
 */
import { createClient } from '@supabase/supabase-js'
import { parseLabels, renderLabels } from '@/lib/printing/zpl'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const MAX_BODY = 64 * 1024
const PRINTER_STATUSES = new Set(['unknown', 'ready', 'paper_out', 'ribbon_out', 'head_open', 'paused', 'unreachable', 'error'])

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null)

type PrinterRow = { id: string; name: string; host: string | null; port: number; dpi: number; label_width_mm: number; label_height_mm: number; active: boolean }

export async function printConnectorHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)
  const auth = request.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer pc_')) return json({ ok: false, error: 'Unauthorized' }, 401)

  const raw = await request.text()
  if (raw.length > MAX_BODY) return json({ ok: false, error: 'Too large' }, 413)
  let body: Record<string, unknown> = {}
  try { body = raw ? JSON.parse(raw) : {} } catch { return json({ ok: false, error: 'Body is not JSON' }, 400) }

  const sb = admin()
  const { data: connector } = await sb.from('print_connectors').select('id, active').eq('token_hash', await sha256Hex(auth.slice(7).trim())).maybeSingle()
  if (!connector || !connector.active) return json({ ok: false, error: 'Unauthorized' }, 401)
  const me = connector.id as string

  await sb.from('print_connectors').update({
    last_seen_at: new Date().toISOString(),
    hostname: str(body.hostname, 120),
    version: str(body.version, 40),
    last_ip: request.headers.get('cf-connecting-ip'),
  }).eq('id', me)

  const { data: printerRows } = await sb.from('label_printers')
    .select('id, name, host, port, dpi, label_width_mm, label_height_mm, active').eq('connector_id', me)
  const printers = (printerRows ?? []) as PrinterRow[]
  const mine = new Map(printers.map((p) => [p.id, p]))

  // Results of jobs it finished since the last call.
  for (const r of Array.isArray(body.results) ? body.results.slice(0, 100) : []) {
    const o = (r ?? {}) as Record<string, unknown>
    const id = str(o.id, 40)
    if (!id) continue
    await sb.from('print_jobs').update({
      status: o.ok === true ? 'printed' : 'failed',
      error: o.ok === true ? null : (str(o.error, 500) ?? 'The printer did not take the job'),
      completed_at: new Date().toISOString(),
    }).eq('id', id).eq('connector_id', me).eq('status', 'sending')
  }

  // What it read from its printers.
  for (const s of Array.isArray(body.printers) ? body.printers.slice(0, 50) : []) {
    const o = (s ?? {}) as Record<string, unknown>
    const id = str(o.id, 40)
    const status = str(o.status, 20)
    if (!id || !mine.has(id) || !status || !PRINTER_STATUSES.has(status)) continue
    await sb.from('label_printers').update({ status, status_detail: str(o.detail, 300), status_at: new Date().toISOString() }).eq('id', id)
  }

  // Wait for work (long poll).
  const wait = Math.max(0, Math.min(25, Number(body.wait) || 0))
  const until = Date.now() + wait * 1000
  let claimed: any[] = []
  for (;;) {
    const { data, error } = await sb.rpc('claim_print_jobs', { p_connector: me, p_limit: 10 })
    if (error) return json({ ok: false, error: 'Could not read the print queue' }, 500)
    claimed = data ?? []
    if (claimed.length || Date.now() >= until || request.signal?.aborted) break
    await new Promise((r) => setTimeout(r, 1000))
  }

  const jobs: { id: string; printer_id: string; host: string; port: number; zpl: string }[] = []
  for (const j of claimed) {
    const p = mine.get(j.printer_id)
    try {
      if (!p?.host) throw new Error('The printer has no address set')
      const zpl = renderLabels(parseLabels(j.labels), { widthMm: Number(p.label_width_mm), heightMm: Number(p.label_height_mm), dpi: p.dpi }, j.copies ?? 1)
      jobs.push({ id: j.id, printer_id: p.id, host: p.host, port: p.port, zpl })
    } catch (e) {
      await sb.from('print_jobs').update({ status: 'failed', error: e instanceof Error ? e.message : 'Could not build the label', completed_at: new Date().toISOString() }).eq('id', j.id)
    }
  }

  return json({
    ok: true,
    printers: printers.filter((p) => p.active && p.host).map((p) => ({ id: p.id, name: p.name, host: p.host, port: p.port })),
    jobs,
  })
}
