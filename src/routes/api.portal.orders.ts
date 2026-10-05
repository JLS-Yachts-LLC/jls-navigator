/**
 * Client-portal orders — order from JLS line by line (Agency with JLS).
 *
 *   GET  /api/portal/orders   → this vessel's orders, newest first, with their request's status
 *   POST /api/portal/orders   → place one (body: { category, title, lines[], needed_by?, deliver_to?, notes? })
 *
 * An order raises a Client Request with the lines written out (category mapped
 * to the request's), and keeps the lines structured on portal_orders. The table
 * is read-only to portal logins at the database; writes run here with the
 * service role, hard-filtered to the caller's vessel, and only when the vessel
 * has Requests & orders switched on.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht, portalModulesFor, type PortalYacht } from '@/lib/portal/portal-auth.server'
import { hiddenSections } from '@/lib/portal/portal-positions'
import { sectionEnabled } from '@/lib/portal/portal-modules'
import { ORDER_CATEGORIES } from '@/lib/portal/orders'
import { logAuditEvent } from '@/lib/admin/audit'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}
type Sb = ReturnType<typeof admin>

class BadRequest extends Error {}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_LINES = 200

const text = (v: unknown, max: number, label: string): string | null => {
  if (v == null || v === '') return null
  if (typeof v !== 'string') throw new BadRequest(`${label} must be text`)
  const t = v.trim()
  if (t.length > max) throw new BadRequest(`${label} is too long`)
  return t || null
}

type Line = { description: string; quantity: number; unit: string | null; notes: string | null }

function cleanLines(raw: unknown): Line[] {
  if (!Array.isArray(raw)) throw new BadRequest('Items must be a list')
  if (raw.length > MAX_LINES) throw new BadRequest(`An order can have at most ${MAX_LINES} lines`)
  const out: Line[] = []
  for (const [i, r] of (raw as any[]).entries()) {
    const description = text(r?.description, 300, `Line ${i + 1}`)
    if (!description) continue
    const quantity = Number(r?.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e6) throw new BadRequest(`Line ${i + 1} needs a quantity above zero`)
    out.push({ description, quantity, unit: text(r?.unit, 40, `Line ${i + 1} unit`), notes: text(r?.notes, 300, `Line ${i + 1} notes`) })
  }
  return out
}

async function callerName(sb: Sb, yacht: PortalYacht): Promise<string> {
  const { data } = await sb.from('captain_accounts').select('display_name')
    .eq('user_id', yacht.userId).eq('yacht_id', yacht.yachtId).eq('active', true).maybeSingle()
  return ((data as any)?.display_name as string | undefined) || yacht.email || 'Client'
}

const qty = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))))
const fmt = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export async function portalOrdersHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)
  if (!sectionEnabled('orders', await portalModulesFor(yacht.yachtId))) return json({ error: "Ordering isn't switched on for your vessel." }, 403)
  if (hiddenSections(yacht.position).has('orders')) return json({ error: "Your position doesn't include ordering." }, 403)

  const sb = admin()
  try {
    if (request.method === 'GET') {
      const [{ data, error }, { data: y }] = await Promise.all([
        sb.from('portal_orders').select('*, captain_requests(reference, status)')
          .eq('yacht_id', yacht.yachtId).order('created_at', { ascending: false }).limit(200),
        sb.from('yachts').select('berth, location').eq('id', yacht.yachtId).maybeSingle(),
      ])
      if (error) throw error
      const where = [(y as any)?.berth && `Berth ${(y as any).berth}`, (y as any)?.location].filter(Boolean).join(', ')
      return json({ orders: data ?? [], defaultDeliverTo: where || null, readOnly: !!yacht.preview })
    }

    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    if (yacht.preview) return json({ error: 'Read-only preview — sign in as the client to make changes.' }, 403)

    const body = (((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>)
    const cat = ORDER_CATEGORIES.find((c) => c.value === body.category)
    if (!cat) return json({ error: 'Choose what kind of order this is' }, 400)
    const title = text(body.title, 160, 'Title')
    if (!title) return json({ error: 'Give the order a title' }, 400)
    const lines = cleanLines(body.lines ?? [])
    if (!lines.length) return json({ error: 'Add at least one item' }, 400)
    const needed_by = typeof body.needed_by === 'string' && DATE_RE.test(body.needed_by) ? body.needed_by : null
    const deliver_to = text(body.deliver_to, 200, 'Deliver to')
    const notes = text(body.notes, 2000, 'Notes')

    const name = await callerName(sb, yacht)
    const details = [
      `${cat.label} order from ${yacht.vesselName}, placed by ${name}.`,
      needed_by ? `Needed by ${fmt(needed_by)}` : null,
      deliver_to ? `Deliver to: ${deliver_to}` : null,
      '',
      ...lines.map((l) => `• ${qty(l.quantity)}${l.unit ? ` ${l.unit}` : ''} × ${l.description}${l.notes ? ` — ${l.notes}` : ''}`),
      notes ? `\nNotes: ${notes}` : null,
    ].filter((l) => l !== null).join('\n')

    const { data: order, error: oErr } = await sb.from('portal_orders').insert({
      yacht_id: yacht.yachtId, category: cat.value, title, lines, needed_by, deliver_to, notes,
      ordered_by: yacht.userId, ordered_by_name: name,
    }).select('id, reference').single()
    if (oErr || !order) throw oErr ?? new Error('Could not place the order')

    const { data: cr, error: crErr } = await sb.from('captain_requests').insert({
      yacht_id: yacht.yachtId, created_by: yacht.userId, category: cat.requestCategory,
      title: `${(order as any).reference} · ${title}`.slice(0, 200), details,
      priority: needed_by && (Date.parse(needed_by) - Date.now()) / 86400000 < 2 ? 'high' : 'normal',
      status: 'new', needed_by,
    }).select('id, reference').single()
    if (crErr || !cr) throw crErr ?? new Error('Could not send to JLS')
    await sb.from('portal_orders').update({ captain_request_id: cr.id }).eq('id', (order as any).id).eq('yacht_id', yacht.yachtId)

    await logAuditEvent({
      event_type: 'DATA', module: 'portal', actor_id: null,
      actor_email: yacht.email || '(client portal)', actor_role: yacht.position ?? 'captain',
      target_type: 'portal_orders', target_id: (order as any).id, target_label: `${yacht.vesselName} · ${(order as any).reference}`,
      detail: `Client portal (${yacht.vesselName}) — placed ${cat.label.toLowerCase()} order ${(order as any).reference} (${lines.length} lines) as ${cr.reference}`,
      ip_address: request.headers.get('cf-connecting-ip'), user_agent: request.headers.get('user-agent'), result: 'success',
    })
    return json({ ok: true, id: (order as any).id, reference: (order as any).reference, requestId: cr.id, requestReference: cr.reference }, 201)
  } catch (e: any) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400)
    console.error('[portal-orders]', e)
    return json({ error: e?.message ?? 'Could not place the order' }, 500)
  }
}
