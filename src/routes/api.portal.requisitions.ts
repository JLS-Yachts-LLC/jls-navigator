/**
 * Client-portal requisitions — what the crew need, from raising a list on board
 * to JLS delivering it.
 *
 *   POST   /api/portal/requisitions                      → raise one (body: header + items)
 *   POST   /api/portal/requisitions?action=from-low-stock → raise one from every item at or
 *                                                          below its minimum (body: { department? })
 *   PATCH  /api/portal/requisitions?id=                  → edit header and/or replace its items
 *   POST   /api/portal/requisitions?id=&action=submit    → draft → awaiting approval
 *   POST   /api/portal/requisitions?id=&action=approve   → approve (approver positions only)
 *   POST   /api/portal/requisitions?id=&action=send      → approved → sent to JLS as a
 *                                                          Client Request (approver positions only)
 *   POST   /api/portal/requisitions?id=&action=receive   → received; lines tied to stock top it up
 *                                                          (body: { items: [{ id, received_quantity }] })
 *   POST   /api/portal/requisitions?id=&action=cancel    → cancel (not once it's with JLS)
 *   DELETE /api/portal/requisitions?id=                  → delete a draft
 *
 * The tables are read-only to portal logins at the database; every write here
 * runs with the service role, hard-filtered to the caller's vessel, and only
 * when the vessel has the Management module's Stock feature on and the caller's
 * position can see it. Reads stay on the client through RLS.
 *
 * Sending to JLS creates an ordinary captain_requests row (CR-####) with the
 * items written out, so it lands in staff's Client Requests triage and the crew
 * can talk to JLS about it on that request's thread.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht, portalModulesFor, type PortalYacht } from '@/lib/portal/portal-auth.server'
import { canApproveRequisition, hiddenSections } from '@/lib/portal/portal-positions'
import { sectionEnabled } from '@/lib/portal/portal-modules'
import { isLowStock, requestCategoryFor, suggestedOrder, STOCK_DEPARTMENTS } from '@/lib/portal/onboard'
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

const DEPARTMENTS = new Set<string>(STOCK_DEPARTMENTS.map((d) => d.value))
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ITEMS = 200

const text = (v: unknown, max: number, label: string): string | null => {
  if (v == null || v === '') return null
  if (typeof v !== 'string') throw new BadRequest(`${label} must be text`)
  const t = v.trim()
  if (t.length > max) throw new BadRequest(`${label} is too long`)
  return t || null
}

/** The header fields a body may set. Missing keys are left out. */
function cleanHeader(body: Record<string, unknown>) {
  const out: Record<string, string | null> = {}
  if ('title' in body) out.title = text(body.title, 160, 'Title')
  if ('department' in body) {
    const d = text(body.department, 20, 'Department')
    if (!d || !DEPARTMENTS.has(d)) throw new BadRequest('Unknown department')
    out.department = d
  }
  if ('needed_by' in body) {
    const d = text(body.needed_by, 10, 'Needed by')
    if (d && !DATE_RE.test(d)) throw new BadRequest('Needed by must be a date')
    out.needed_by = d
  }
  if ('notes' in body) out.notes = text(body.notes, 4000, 'Notes')
  return out
}

type Line = { description: string; quantity: number; unit: string | null; notes: string | null; stock_item_id: string | null }

/** Validate the item lines of a body; stock links must be this vessel's. */
async function cleanItems(sb: Sb, yacht: PortalYacht, raw: unknown): Promise<Line[]> {
  if (!Array.isArray(raw)) throw new BadRequest('Items must be a list')
  if (raw.length > MAX_ITEMS) throw new BadRequest(`A requisition can have at most ${MAX_ITEMS} lines`)
  const lines: Line[] = raw.map((r: any, i) => {
    const description = text(r?.description, 300, `Line ${i + 1}`)
    if (!description) throw new BadRequest(`Line ${i + 1} needs a description`)
    const quantity = Number(r?.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e6) throw new BadRequest(`Line ${i + 1} needs a quantity above zero`)
    const stockId = r?.stock_item_id ? String(r.stock_item_id) : null
    if (stockId && !UUID_RE.test(stockId)) throw new BadRequest(`Line ${i + 1} has an unknown stock item`)
    return { description, quantity, unit: text(r?.unit, 40, `Line ${i + 1} unit`), notes: text(r?.notes, 500, `Line ${i + 1} notes`), stock_item_id: stockId }
  })
  const ids = [...new Set(lines.map((l) => l.stock_item_id).filter(Boolean))] as string[]
  if (ids.length) {
    const { data } = await sb.from('onboard_stock_items').select('id').eq('yacht_id', yacht.yachtId).in('id', ids)
    const own = new Set((data ?? []).map((r: any) => r.id))
    if (ids.some((id) => !own.has(id))) throw new BadRequest('A line refers to stock that is not on this vessel')
  }
  return lines
}

async function replaceItems(sb: Sb, yacht: PortalYacht, requisitionId: string, lines: Line[]) {
  const { error: delErr } = await sb.from('onboard_requisition_items').delete().eq('requisition_id', requisitionId).eq('yacht_id', yacht.yachtId)
  if (delErr) throw delErr
  if (!lines.length) return
  const { error } = await sb.from('onboard_requisition_items').insert(
    lines.map((l, i) => ({ ...l, requisition_id: requisitionId, yacht_id: yacht.yachtId, sort_order: i })))
  if (error) throw error
}

/** How the caller is named on the requisition: their portal display name, else their email. */
async function callerName(sb: Sb, yacht: PortalYacht): Promise<string> {
  const { data } = await sb.from('captain_accounts').select('display_name')
    .eq('user_id', yacht.userId).eq('yacht_id', yacht.yachtId).eq('active', true).maybeSingle()
  return ((data as any)?.display_name as string | undefined) || yacht.email || 'Crew'
}

async function ownRequisition(sb: Sb, yacht: PortalYacht, id: string | null) {
  if (!id || !UUID_RE.test(id)) return null
  const { data } = await sb.from('onboard_requisitions').select('*').eq('id', id).eq('yacht_id', yacht.yachtId).maybeSingle()
  return (data as any) ?? null
}

async function itemsOf(sb: Sb, yacht: PortalYacht, requisitionId: string) {
  const { data, error } = await sb.from('onboard_requisition_items').select('*')
    .eq('requisition_id', requisitionId).eq('yacht_id', yacht.yachtId).order('sort_order')
  if (error) throw error
  return (data ?? []) as any[]
}

async function setStatus(sb: Sb, yacht: PortalYacht, id: string, patch: Record<string, unknown>) {
  const { error } = await sb.from('onboard_requisitions').update(patch).eq('id', id).eq('yacht_id', yacht.yachtId)
  if (error) throw error
}

async function audit(request: Request, yacht: PortalYacht, verb: string, req: { id: string; reference: string; title: string }) {
  await logAuditEvent({
    event_type: 'DATA',
    module: 'portal',
    actor_id: yacht.preview ? yacht.userId : null,
    actor_email: yacht.email || '(client portal)',
    actor_role: yacht.position ?? 'captain',
    target_type: 'onboard_requisitions',
    target_id: req.id,
    target_label: `${yacht.vesselName} · ${req.reference}`,
    detail: `Client portal (${yacht.vesselName}) — ${verb} requisition ${req.reference}: ${req.title}`,
    ip_address: request.headers.get('cf-connecting-ip'),
    user_agent: request.headers.get('user-agent'),
    result: 'success',
  })
}

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))))

/** The request JLS receives: the items written out, one per line. */
function requestDetails(req: any, lines: any[], approvedBy: string): string {
  const dept = STOCK_DEPARTMENTS.find((d) => d.value === req.department)?.label ?? req.department
  const out = [
    `Requisition ${req.reference} · ${dept}`,
    `Raised by ${req.raised_by_name ?? 'crew'} · approved by ${approvedBy}`,
    '',
    ...lines.map((l) => `• ${fmtQty(Number(l.quantity))}${l.unit ? ` ${l.unit}` : ''} × ${l.description}${l.notes ? ` — ${l.notes}` : ''}`),
  ]
  if (req.notes) out.push('', `Notes: ${req.notes}`)
  return out.join('\n')
}

export async function portalRequisitionsHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)
  if (yacht.preview) return json({ error: 'Read-only preview — sign in as the client to make changes.' }, 403)

  const modules = await portalModulesFor(yacht.yachtId)
  if (!sectionEnabled('stock', modules)) return json({ error: "Stock & requisitions isn't switched on for your vessel." }, 403)
  if (hiddenSections(yacht.position).has('stock')) return json({ error: "Your position doesn't include stock & requisitions." }, 403)

  const sb = admin()
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const action = url.searchParams.get('action')
  const approver = canApproveRequisition(yacht.position)

  try {
    if (request.method === 'DELETE') {
      const req = await ownRequisition(sb, yacht, id)
      if (!req) return json({ error: 'Requisition not found' }, 404)
      if (req.status !== 'draft') return json({ error: 'Only a draft can be deleted — cancel it instead.' }, 400)
      const { error } = await sb.from('onboard_requisitions').delete().eq('id', req.id).eq('yacht_id', yacht.yachtId)
      if (error) throw error
      await audit(request, yacht, 'deleted', req)
      return json({ ok: true })
    }

    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
    if (typeof body !== 'object') return json({ error: 'Expected a JSON body' }, 400)

    // ── Raise ──────────────────────────────────────────────────────────────
    if (request.method === 'POST' && !id) {
      const name = await callerName(sb, yacht)
      let header = cleanHeader(body)
      let lines: Line[]

      if (action === 'from-low-stock') {
        const dept = header.department ?? null
        let q = sb.from('onboard_stock_items').select('id, name, unit, quantity, min_quantity, par_quantity, department')
          .eq('yacht_id', yacht.yachtId)
        if (dept) q = q.eq('department', dept)
        const { data, error } = await q.order('name')
        if (error) throw error
        const low = ((data ?? []) as any[]).filter(isLowStock)
        if (!low.length) return json({ error: 'Nothing is at or below its minimum level.' }, 400)
        lines = low.slice(0, MAX_ITEMS).map((i) => ({
          description: i.name, quantity: suggestedOrder(i), unit: i.unit ?? null, notes: null, stock_item_id: i.id,
        }))
        const deptLabel = dept ? STOCK_DEPARTMENTS.find((d) => d.value === dept)?.label : null
        header = {
          ...header,
          department: dept ?? low[0].department,
          title: header.title || `${deptLabel ?? 'Stock'} top-up`,
        }
      } else {
        if (!header.title) return json({ error: 'Give the requisition a title' }, 400)
        lines = await cleanItems(sb, yacht, body.items ?? [])
      }

      const { data, error } = await sb.from('onboard_requisitions')
        .insert({ ...header, yacht_id: yacht.yachtId, status: 'draft', raised_by_name: name })
        .select('id, reference, title').single()
      if (error || !data) throw error ?? new Error('Could not raise the requisition')
      await replaceItems(sb, yacht, data.id, lines)
      await audit(request, yacht, 'raised', data as any)
      return json({ ok: true, id: data.id, reference: data.reference }, 201)
    }

    const req = await ownRequisition(sb, yacht, id)
    if (!req) return json({ error: 'Requisition not found' }, 404)

    // ── Edit ───────────────────────────────────────────────────────────────
    if (request.method === 'PATCH') {
      // Anyone can edit a draft; once it's awaiting approval, only an approver can.
      if (!(req.status === 'draft' || (req.status === 'submitted' && approver))) {
        return json({ error: "This requisition can't be changed now." }, 400)
      }
      const header = cleanHeader(body)
      if ('title' in header && !header.title) return json({ error: 'Give the requisition a title' }, 400)
      if (Object.keys(header).length) await setStatus(sb, yacht, req.id, header)
      if ('items' in body) await replaceItems(sb, yacht, req.id, await cleanItems(sb, yacht, body.items))
      await audit(request, yacht, 'edited', req)
      return json({ ok: true })
    }

    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    const name = await callerName(sb, yacht)
    const now = new Date().toISOString()

    if (action === 'submit') {
      if (req.status !== 'draft') return json({ error: 'Only a draft can be submitted.' }, 400)
      if (!(await itemsOf(sb, yacht, req.id)).length) return json({ error: 'Add at least one item first.' }, 400)
      await setStatus(sb, yacht, req.id, { status: 'submitted', submitted_at: now })
      await audit(request, yacht, 'submitted', req)
      return json({ ok: true, status: 'submitted' })
    }

    if (action === 'approve') {
      if (!approver) return json({ error: "Your position can raise requisitions but not approve them." }, 403)
      if (!['draft', 'submitted'].includes(req.status)) return json({ error: 'This requisition is not waiting for approval.' }, 400)
      if (!(await itemsOf(sb, yacht, req.id)).length) return json({ error: 'Add at least one item first.' }, 400)
      await setStatus(sb, yacht, req.id, {
        status: 'approved', approved_by_name: name, approved_at: now, submitted_at: req.submitted_at ?? now,
      })
      await audit(request, yacht, 'approved', req)
      return json({ ok: true, status: 'approved' })
    }

    if (action === 'send') {
      if (!approver) return json({ error: "Your position can't send requisitions to JLS." }, 403)
      if (req.status !== 'approved') return json({ error: 'Approve the requisition before sending it to JLS.' }, 400)
      const lines = await itemsOf(sb, yacht, req.id)
      if (!lines.length) return json({ error: 'Add at least one item first.' }, 400)
      const { data: cr, error: crErr } = await sb.from('captain_requests').insert({
        yacht_id: yacht.yachtId,
        created_by: yacht.userId,
        category: requestCategoryFor(req.department),
        title: `${req.reference} · ${req.title}`.slice(0, 200),
        details: requestDetails(req, lines, req.approved_by_name ?? name),
        priority: 'normal',
        status: 'new',
        needed_by: req.needed_by,
      }).select('id, reference').single()
      if (crErr || !cr) throw crErr ?? new Error('Could not send to JLS')
      await setStatus(sb, yacht, req.id, { status: 'sent', sent_by_name: name, sent_at: now, captain_request_id: cr.id })
      await audit(request, yacht, `sent to JLS as ${cr.reference}`, req)
      return json({ ok: true, status: 'sent', requestId: cr.id, requestReference: cr.reference })
    }

    if (action === 'receive') {
      if (!['approved', 'sent'].includes(req.status)) return json({ error: 'Only an approved or sent requisition can be received.' }, 400)
      const lines = await itemsOf(sb, yacht, req.id)
      const given = new Map<string, number>()
      if (Array.isArray(body.items)) {
        for (const r of body.items as any[]) {
          const q = Number(r?.received_quantity)
          if (r?.id && Number.isFinite(q) && q >= 0 && q <= 1e6) given.set(String(r.id), q)
        }
      }
      for (const l of lines) {
        // A line not mentioned is taken as received in full.
        const q = given.has(l.id) ? given.get(l.id)! : Number(l.quantity)
        const { error } = await sb.from('onboard_requisition_items').update({ received_quantity: q }).eq('id', l.id).eq('yacht_id', yacht.yachtId)
        if (error) throw error
        if (l.stock_item_id && q > 0) {
          const { data: item } = await sb.from('onboard_stock_items').select('quantity')
            .eq('id', l.stock_item_id).eq('yacht_id', yacht.yachtId).maybeSingle()
          if (item) {
            const { error: sErr } = await sb.from('onboard_stock_items')
              .update({ quantity: Number((item as any).quantity ?? 0) + q, updated_by_name: name })
              .eq('id', l.stock_item_id).eq('yacht_id', yacht.yachtId)
            if (sErr) throw sErr
          }
        }
      }
      await setStatus(sb, yacht, req.id, { status: 'received', received_by_name: name, received_at: now })
      await audit(request, yacht, 'received', req)
      return json({ ok: true, status: 'received' })
    }

    if (action === 'cancel') {
      if (req.status === 'sent') return json({ error: "It's already with JLS — message us on the request to cancel it." }, 400)
      if (['received', 'cancelled'].includes(req.status)) return json({ error: 'This requisition is closed.' }, 400)
      if (req.status !== 'draft' && !approver) return json({ error: 'Ask the Captain to cancel it.' }, 403)
      await setStatus(sb, yacht, req.id, { status: 'cancelled' })
      await audit(request, yacht, 'cancelled', req)
      return json({ ok: true, status: 'cancelled' })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e: any) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400)
    console.error('[portal-requisitions]', e)
    return json({ error: e?.message ?? 'Could not save the requisition' }, 500)
  }
}
