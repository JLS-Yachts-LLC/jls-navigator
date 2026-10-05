/**
 * Client-portal checklists (On board) — the vessel's own checklists and each
 * time one is gone through.
 *
 *   POST   /api/portal/checklists?kind=template                 → add a checklist (or { library: "<key>" } to copy a starter)
 *   PATCH  /api/portal/checklists?kind=template&id=             → edit it
 *   DELETE /api/portal/checklists?kind=template&id=             → delete it (past runs are kept)
 *   POST   /api/portal/checklists?kind=run&template=            → start a run from a checklist
 *   PATCH  /api/portal/checklists?kind=run&id=                  → tick / untick / note items (body: { item, done?, note? }) or set run notes
 *   POST   /api/portal/checklists?kind=run&id=&action=complete  → finish the run
 *   DELETE /api/portal/checklists?kind=run&id=                  → discard a run still in progress
 *
 * Tables are read-only to portal logins at the database; writes run here with
 * the service role, hard-filtered to the caller's vessel, and only when the
 * vessel has the Management module's Checklists feature and the caller's
 * position can see it.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht, portalModulesFor, type PortalYacht } from '@/lib/portal/portal-auth.server'
import { hiddenSections } from '@/lib/portal/portal-positions'
import { sectionEnabled } from '@/lib/portal/portal-modules'
import { STOCK_DEPARTMENTS } from '@/lib/portal/onboard'
import { CHECKLIST_FREQUENCIES, CHECKLIST_LIBRARY, libraryItems, newItemId, type ChecklistItem, type ChecklistResult } from '@/lib/portal/checklists'
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
const FREQUENCIES = new Set<string>(CHECKLIST_FREQUENCIES.map((f) => f.value))
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ITEM_ID_RE = /^[A-Za-z0-9_-]{1,40}$/
const MAX_ITEMS = 150

const text = (v: unknown, max: number, label: string): string | null => {
  if (v == null || v === '') return null
  if (typeof v !== 'string') throw new BadRequest(`${label} must be text`)
  const t = v.trim()
  if (t.length > max) throw new BadRequest(`${label} is too long`)
  return t || null
}

/** A checklist's items, validated; items without an id get one. */
function cleanItems(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) throw new BadRequest('Items must be a list')
  if (raw.length > MAX_ITEMS) throw new BadRequest(`A checklist can have at most ${MAX_ITEMS} items`)
  const seen = new Set<string>()
  const out: ChecklistItem[] = []
  for (const [i, r] of (raw as any[]).entries()) {
    const label = text(r?.label, 300, `Item ${i + 1}`)
    if (!label) continue
    let id = typeof r?.id === 'string' && ITEM_ID_RE.test(r.id) ? r.id : newItemId()
    while (seen.has(id)) id = newItemId()
    seen.add(id)
    out.push({ id, label, section: text(r?.section, 80, `Item ${i + 1} section`) })
  }
  return out
}

function cleanTemplate(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  if ('title' in body) out.title = text(body.title, 160, 'Title')
  if ('department' in body) {
    const d = text(body.department, 20, 'Department')
    if (!d || !DEPARTMENTS.has(d)) throw new BadRequest('Unknown department')
    out.department = d
  }
  if ('frequency' in body) {
    const f = text(body.frequency, 30, 'Frequency')
    if (!f || !FREQUENCIES.has(f)) throw new BadRequest('Unknown frequency')
    out.frequency = f
  }
  if ('items' in body) out.items = cleanItems(body.items)
  if ('active' in body) out.active = !!body.active
  return out
}

async function callerName(sb: Sb, yacht: PortalYacht): Promise<string> {
  const { data } = await sb.from('captain_accounts').select('display_name')
    .eq('user_id', yacht.userId).eq('yacht_id', yacht.yachtId).eq('active', true).maybeSingle()
  return ((data as any)?.display_name as string | undefined) || yacht.email || 'Crew'
}

async function own(sb: Sb, yacht: PortalYacht, table: string, id: string | null) {
  if (!id || !UUID_RE.test(id)) return null
  const { data } = await sb.from(table).select('*').eq('id', id).eq('yacht_id', yacht.yachtId).maybeSingle()
  return (data as any) ?? null
}

async function audit(request: Request, yacht: PortalYacht, verb: string, table: string, id: string, label: string) {
  await logAuditEvent({
    event_type: 'DATA',
    module: 'portal',
    actor_id: yacht.preview ? yacht.userId : null,
    actor_email: yacht.email || '(client portal)',
    actor_role: yacht.position ?? 'captain',
    target_type: table,
    target_id: id,
    target_label: `${yacht.vesselName} · ${label}`,
    detail: `Client portal (${yacht.vesselName}) — ${verb}: ${label}`,
    ip_address: request.headers.get('cf-connecting-ip'),
    user_agent: request.headers.get('user-agent'),
    result: 'success',
  })
}

export async function portalChecklistsHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)
  if (yacht.preview) return json({ error: 'Read-only preview — sign in as the client to make changes.' }, 403)

  const modules = await portalModulesFor(yacht.yachtId)
  if (!sectionEnabled('checklists', modules)) return json({ error: "Checklists aren't switched on for your vessel." }, 403)
  if (hiddenSections(yacht.position).has('checklists')) return json({ error: "Your position doesn't include checklists." }, 403)

  const sb = admin()
  const url = new URL(request.url)
  const kind = url.searchParams.get('kind')
  const id = url.searchParams.get('id')
  const action = url.searchParams.get('action')

  try {
    const body = request.method === 'DELETE' ? {} : (((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>)
    if (typeof body !== 'object') return json({ error: 'Expected a JSON body' }, 400)

    // ── Checklists ─────────────────────────────────────────────────────────
    if (kind === 'template') {
      if (request.method === 'POST') {
        const name = await callerName(sb, yacht)
        let row: Record<string, unknown>
        if (typeof body.library === 'string') {
          const entry = CHECKLIST_LIBRARY.find((e) => e.key === body.library)
          if (!entry) return json({ error: 'Unknown starter checklist' }, 400)
          row = { title: entry.title, department: entry.department, frequency: entry.frequency, items: libraryItems(entry) }
        } else {
          row = cleanTemplate(body)
          if (!row.title) return json({ error: 'Give the checklist a title' }, 400)
        }
        const { data, error } = await sb.from('onboard_checklist_templates')
          .insert({ ...row, yacht_id: yacht.yachtId, created_by_name: name }).select('id, title').single()
        if (error || !data) throw error ?? new Error('Could not save')
        await audit(request, yacht, 'added checklist', 'onboard_checklist_templates', data.id, data.title)
        return json({ ok: true, id: data.id }, 201)
      }
      const t = await own(sb, yacht, 'onboard_checklist_templates', id)
      if (!t) return json({ error: 'Checklist not found' }, 404)
      if (request.method === 'PATCH') {
        const row = cleanTemplate(body)
        if ('title' in row && !row.title) return json({ error: 'Give the checklist a title' }, 400)
        const { error } = await sb.from('onboard_checklist_templates').update(row).eq('id', t.id).eq('yacht_id', yacht.yachtId)
        if (error) throw error
        await audit(request, yacht, 'edited checklist', 'onboard_checklist_templates', t.id, (row.title as string) ?? t.title)
        return json({ ok: true })
      }
      if (request.method === 'DELETE') {
        const { error } = await sb.from('onboard_checklist_templates').delete().eq('id', t.id).eq('yacht_id', yacht.yachtId)
        if (error) throw error
        await audit(request, yacht, 'deleted checklist', 'onboard_checklist_templates', t.id, t.title)
        return json({ ok: true })
      }
      return json({ error: 'Method not allowed' }, 405)
    }

    // ── Runs ───────────────────────────────────────────────────────────────
    if (kind === 'run') {
      const name = await callerName(sb, yacht)

      if (request.method === 'POST' && !id) {
        const t = await own(sb, yacht, 'onboard_checklist_templates', url.searchParams.get('template'))
        if (!t) return json({ error: 'Checklist not found' }, 404)
        if (!Array.isArray(t.items) || !t.items.length) return json({ error: 'This checklist has no items yet.' }, 400)
        const { data, error } = await sb.from('onboard_checklist_runs').insert({
          yacht_id: yacht.yachtId, template_id: t.id, title: t.title, department: t.department,
          items: t.items, results: {}, status: 'in_progress', started_by_name: name,
        }).select('id').single()
        if (error || !data) throw error ?? new Error('Could not start the checklist')
        return json({ ok: true, id: data.id }, 201)
      }

      const run = await own(sb, yacht, 'onboard_checklist_runs', id)
      if (!run) return json({ error: 'Checklist run not found' }, 404)

      if (request.method === 'DELETE') {
        if (run.status !== 'in_progress') return json({ error: 'A completed checklist is part of the record and is kept.' }, 400)
        const { error } = await sb.from('onboard_checklist_runs').delete().eq('id', run.id).eq('yacht_id', yacht.yachtId)
        if (error) throw error
        return json({ ok: true })
      }

      if (run.status !== 'in_progress') return json({ error: 'This checklist has been completed.' }, 400)

      if (request.method === 'PATCH') {
        let results = run.results ?? {}
        if (typeof body.item === 'string') {
          const item = (run.items as ChecklistItem[]).find((i) => i.id === body.item)
          if (!item) return json({ error: 'Unknown item' }, 400)
          const prev: ChecklistResult = results[item.id] ?? { done: false }
          const next: ChecklistResult = { ...prev }
          if ('done' in body) { next.done = !!body.done; next.by = name; next.at = new Date().toISOString() }
          if ('note' in body) next.note = text(body.note, 1000, 'Note')
          // Merged in the database, so another crew member's tick a moment ago is kept.
          const { data, error } = await sb.rpc('onboard_checklist_set_result', {
            p_run_id: run.id, p_yacht_id: yacht.yachtId, p_item_id: item.id, p_result: next,
          })
          if (error) throw error
          results = (data as any) ?? results
        }
        if ('notes' in body) {
          const { error } = await sb.from('onboard_checklist_runs')
            .update({ notes: text(body.notes, 4000, 'Notes') }).eq('id', run.id).eq('yacht_id', yacht.yachtId)
          if (error) throw error
        }
        return json({ ok: true, results })
      }

      if (request.method === 'POST' && action === 'complete') {
        const { error } = await sb.from('onboard_checklist_runs')
          .update({ status: 'completed', completed_by_name: name, completed_at: new Date().toISOString() })
          .eq('id', run.id).eq('yacht_id', yacht.yachtId)
        if (error) throw error
        const done = (run.items as ChecklistItem[]).filter((i) => run.results?.[i.id]?.done).length
        await audit(request, yacht, `completed checklist (${done}/${run.items.length})`, 'onboard_checklist_runs', run.id, run.title)
        return json({ ok: true })
      }

      return json({ error: 'Method not allowed' }, 405)
    }

    return json({ error: 'Unknown kind' }, 400)
  } catch (e: any) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400)
    console.error('[portal-checklists]', e)
    return json({ error: e?.message ?? 'Could not save the checklist' }, 500)
  }
}
