/**
 * Client-portal On board — the crew's task board (Tasks & backlog).
 *
 *   POST   /api/portal/tasks                         → add a card
 *   PATCH  /api/portal/tasks?id=                     → edit a card (any of FIELDS, labels, checklist)
 *   POST   /api/portal/tasks?id=&action=move         → move a card (body: { status, sort_order })
 *   POST   /api/portal/tasks?id=&action=comment      → comment on a card (body: { body })
 *   DELETE /api/portal/tasks?id=                     → remove a card (and its comments)
 *
 * onboard_tasks / onboard_task_comments are read-only to portal logins at the
 * database (captain_select only), so writes come through here with the service
 * role, hard-filtered to the vessel resolved from the caller's JWT. A write is
 * refused unless the vessel has the Management module's Tasks feature on and
 * the caller's position can see it. Moves, assignments and completion are
 * written to the card's history as 'event' comments. Reads stay on the client
 * through RLS, which also works in staff preview.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht, portalModulesFor, type PortalYacht } from '@/lib/portal/portal-auth.server'
import { hiddenSections } from '@/lib/portal/portal-positions'
import { sectionEnabled } from '@/lib/portal/portal-modules'
import { TASK_STATUSES, TASK_PRIORITIES, TASK_STATUS_LABEL } from '@/lib/portal/tasks'
import { logAuditEvent } from '@/lib/admin/audit'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}
type Sb = ReturnType<typeof admin>

const DEPARTMENTS = ['galley', 'interior', 'bar', 'deck', 'engine', 'safety', 'other'] as const
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

class BadRequest extends Error {}

type ChecklistItem = { id: string; text: string; done: boolean }

const text = (v: unknown, max: number, label: string): string | null => {
  if (v == null || v === '') return null
  if (typeof v !== 'string') throw new BadRequest(`${label} must be text`)
  const t = v.trim()
  if (t.length > max) throw new BadRequest(`${label} is too long`)
  return t || null
}

/** Validate the editable fields present in the body ('' / null clears). */
async function cleanTask(sb: Sb, yacht: PortalYacht, body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  if ('title' in body) out.title = text(body.title, 200, 'The title')
  if ('description' in body) out.description = text(body.description, 6000, 'The description')
  if ('waiting_on' in body) out.waiting_on = text(body.waiting_on, 160, 'Waiting on')
  if ('status' in body) {
    if (!TASK_STATUSES.includes(body.status as any)) throw new BadRequest('Unknown column')
    out.status = body.status
  }
  if ('priority' in body) {
    if (!TASK_PRIORITIES.includes(body.priority as any)) throw new BadRequest('Unknown priority')
    out.priority = body.priority
  }
  if ('department' in body) {
    if (body.department == null || body.department === '') out.department = null
    else if (!DEPARTMENTS.includes(body.department as any)) throw new BadRequest('Unknown department')
    else out.department = body.department
  }
  if ('due_date' in body) {
    if (body.due_date == null || body.due_date === '') out.due_date = null
    else if (typeof body.due_date !== 'string' || !DATE_RE.test(body.due_date)) throw new BadRequest('The due date must be a date')
    else out.due_date = body.due_date
  }
  // Assigned to a crew member on this vessel, or a free-text name (a team, a contractor).
  if ('assignee_crew_id' in body) {
    const id = body.assignee_crew_id
    if (id == null || id === '') {
      out.assignee_crew_id = null
      out.assignee_name = 'assignee_name' in body ? text(body.assignee_name, 120, 'The assignee') : null
    } else {
      if (typeof id !== 'string' || !UUID_RE.test(id)) throw new BadRequest('That crew member is not valid')
      const { data } = await sb.from('crew_members').select('id, full_name, first_name, last_name')
        .eq('id', id).eq('yacht_id', yacht.yachtId).maybeSingle()
      if (!data) throw new BadRequest('That crew member is not on this vessel')
      const c = data as any
      out.assignee_crew_id = id
      out.assignee_name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Crew'
    }
  } else if ('assignee_name' in body) {
    out.assignee_crew_id = null
    out.assignee_name = text(body.assignee_name, 120, 'The assignee')
  }
  if ('labels' in body) {
    if (!Array.isArray(body.labels)) throw new BadRequest('Labels must be a list')
    const labels = [...new Set((body.labels as unknown[]).map((l) => String(l ?? '').trim()).filter(Boolean))]
    if (labels.length > 10) throw new BadRequest('A card can have at most 10 labels')
    if (labels.some((l) => l.length > 30)) throw new BadRequest('Labels can be up to 30 characters')
    out.labels = labels
  }
  if ('checklist' in body) {
    if (!Array.isArray(body.checklist)) throw new BadRequest('The checklist must be a list')
    if (body.checklist.length > 50) throw new BadRequest('A checklist can have at most 50 items')
    out.checklist = (body.checklist as any[]).map((i, n): ChecklistItem => {
      const t = String(i?.text ?? '').trim()
      if (!t) throw new BadRequest('A checklist item is empty')
      if (t.length > 200) throw new BadRequest('A checklist item is too long')
      const id = String(i?.id ?? '').slice(0, 40) || `i${n}-${Date.now().toString(36)}`
      return { id, text: t, done: i?.done === true }
    })
  }
  if ('sort_order' in body) {
    const n = Number(body.sort_order)
    if (!Number.isFinite(n) || Math.abs(n) > 1e12) throw new BadRequest('Bad position')
    out.sort_order = n
  }
  return out
}

async function callerName(sb: Sb, yacht: PortalYacht): Promise<string> {
  const { data } = await sb.from('captain_accounts').select('display_name')
    .eq('user_id', yacht.userId).eq('yacht_id', yacht.yachtId).eq('active', true).maybeSingle()
  return ((data as any)?.display_name as string | undefined) || yacht.email || 'Crew'
}

async function ownTask(sb: Sb, yacht: PortalYacht, id: string | null): Promise<any | null> {
  if (!id || !UUID_RE.test(id)) return null
  const { data } = await sb.from('onboard_tasks').select('*').eq('id', id).eq('yacht_id', yacht.yachtId).maybeSingle()
  return data ?? null
}

/** A line in the card's history. Never fails the write it describes. */
async function event(sb: Sb, yacht: PortalYacht, taskId: string, who: string, body: string) {
  await sb.from('onboard_task_comments').insert({ task_id: taskId, yacht_id: yacht.yachtId, kind: 'event', author_name: who, body })
    .then(() => undefined, () => undefined)
}

/** Completion stamps follow the column: set on entering Done, cleared on leaving it. */
function completion(prev: string | null, next: string, who: string) {
  if (next === 'done' && prev !== 'done') return { completed_at: new Date().toISOString(), completed_by_name: who }
  if (next !== 'done' && prev === 'done') return { completed_at: null, completed_by_name: null }
  return {}
}

async function audit(request: Request, yacht: PortalYacht, verb: string, id: string, label: string) {
  await logAuditEvent({
    event_type: 'DATA',
    module: 'portal',
    actor_id: yacht.preview ? yacht.userId : null,
    actor_email: yacht.email || '(client portal)',
    actor_role: yacht.position ?? 'captain',
    target_type: 'onboard_tasks',
    target_id: id,
    target_label: `${yacht.vesselName} · ${label}`,
    detail: `Client portal (${yacht.vesselName}) — ${verb} task: ${label}`,
    ip_address: request.headers.get('cf-connecting-ip'),
    user_agent: request.headers.get('user-agent'),
    result: 'success',
  })
}

export async function portalTasksHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)
  if (yacht.preview) return json({ error: 'Read-only preview — sign in as the client to make changes.' }, 403)

  const modules = await portalModulesFor(yacht.yachtId)
  if (!sectionEnabled('tasks', modules)) return json({ error: "Tasks aren't switched on for your vessel." }, 403)
  if (hiddenSections(yacht.position).has('tasks')) return json({ error: "Your position doesn't include Tasks." }, 403)

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const action = url.searchParams.get('action')
  const sb = admin()

  try {
    if (request.method === 'DELETE') {
      const task = await ownTask(sb, yacht, id)
      if (!task) return json({ error: 'Not found' }, 404)
      const { error } = await sb.from('onboard_tasks').delete().eq('id', task.id).eq('yacht_id', yacht.yachtId)
      if (error) throw error
      await audit(request, yacht, 'deleted', task.id, `${task.reference} ${task.title}`)
      return json({ ok: true })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') return json({ error: 'Expected a JSON body' }, 400)
    const who = await callerName(sb, yacht)

    if (request.method === 'POST' && action === 'comment') {
      const task = await ownTask(sb, yacht, id)
      if (!task) return json({ error: 'Not found' }, 404)
      const msg = text(body.body, 4000, 'The comment')
      if (!msg) return json({ error: 'Write a comment first' }, 400)
      const { data, error } = await sb.from('onboard_task_comments')
        .insert({ task_id: task.id, yacht_id: yacht.yachtId, kind: 'comment', author_name: who, body: msg })
        .select('id, kind, author_name, body, created_at').single()
      if (error) throw error
      return json({ ok: true, comment: data }, 201)
    }

    if (request.method === 'POST' && action === 'move') {
      const task = await ownTask(sb, yacht, id)
      if (!task) return json({ error: 'Not found' }, 404)
      const fields = await cleanTask(sb, yacht, { status: body.status, sort_order: body.sort_order })
      const status = String(fields.status)
      const update = { ...fields, ...completion(task.status, status, who) }
      const { error } = await sb.from('onboard_tasks').update(update).eq('id', task.id).eq('yacht_id', yacht.yachtId)
      if (error) throw error
      if (status !== task.status) await event(sb, yacht, task.id, who, `moved this to ${TASK_STATUS_LABEL[status as keyof typeof TASK_STATUS_LABEL]}`)
      return json({ ok: true, ...update })
    }

    if (request.method === 'POST' && !action) {
      const fields = await cleanTask(sb, yacht, body)
      if (!fields.title) return json({ error: 'A title is required' }, 400)
      const status = String(fields.status ?? 'backlog')
      // New cards go to the top of their column.
      const { data: top } = await sb.from('onboard_tasks').select('sort_order')
        .eq('yacht_id', yacht.yachtId).eq('status', status).order('sort_order', { ascending: true }).limit(1).maybeSingle()
      const row: Record<string, unknown> = {
        ...fields, status, yacht_id: yacht.yachtId, created_by_name: who,
        sort_order: 'sort_order' in fields ? fields.sort_order : Number((top as any)?.sort_order ?? 0) - 1,
        ...completion(null, status, who),
      }
      const { data, error } = await sb.from('onboard_tasks').insert(row).select('id, reference').single()
      if (error || !data) throw error ?? new Error('Could not save')
      await event(sb, yacht, (data as any).id, who, `created this in ${TASK_STATUS_LABEL[status as keyof typeof TASK_STATUS_LABEL]}`)
      await audit(request, yacht, 'added', (data as any).id, `${(data as any).reference} ${fields.title}`)
      return json({ ok: true, id: (data as any).id, reference: (data as any).reference }, 201)
    }

    if (request.method === 'PATCH') {
      const task = await ownTask(sb, yacht, id)
      if (!task) return json({ error: 'Not found' }, 404)
      const fields = await cleanTask(sb, yacht, body)
      if ('title' in fields && !fields.title) return json({ error: 'A title is required' }, 400)
      const update: Record<string, unknown> = { ...fields }
      if (fields.status && fields.status !== task.status) Object.assign(update, completion(task.status, String(fields.status), who))
      if (!Object.keys(update).length) return json({ ok: true })
      const { error } = await sb.from('onboard_tasks').update(update).eq('id', task.id).eq('yacht_id', yacht.yachtId)
      if (error) throw error
      if (fields.status && fields.status !== task.status) {
        await event(sb, yacht, task.id, who, `moved this to ${TASK_STATUS_LABEL[fields.status as keyof typeof TASK_STATUS_LABEL]}`)
      }
      if ('assignee_name' in fields && (fields.assignee_name ?? null) !== (task.assignee_name ?? null)) {
        await event(sb, yacht, task.id, who, fields.assignee_name ? `assigned this to ${fields.assignee_name}` : 'unassigned this')
      }
      // Only log real edits, not every checklist tick.
      if (Object.keys(fields).some((k) => !['checklist', 'sort_order', 'status', 'assignee_crew_id', 'assignee_name'].includes(k))) {
        await audit(request, yacht, 'edited', task.id, `${task.reference} ${fields.title ?? task.title}`)
      }
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (e: any) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400)
    console.error('[portal-tasks]', e)
    return json({ error: e?.message ?? 'Could not save' }, 500)
  }
}
