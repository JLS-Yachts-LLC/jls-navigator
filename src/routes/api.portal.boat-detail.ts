/**
 * Client portal — one managed boat in detail, for its owner.
 *
 *   GET /api/portal/boats/detail?boat=<id>
 *       → { compliance[], documents[], jobs[], safetyKit[] }
 *   GET /api/portal/boats/open?boat=<id>&type=document&id=<doc id>
 *   GET /api/portal/boats/open?boat=<id>&type=inspection&regime=dma|fma|rya
 *   GET /api/portal/boats/open?boat=<id>&type=expense_file|service_file|job_image&id=<file id>
 *       → 302 to a 5-minute signed URL, after an ownership check, every attempt
 *         recorded in portal_document_access (as the yacht portal does); add
 *         &as=json for { url } instead, so a job's photos can show inline
 *   POST /api/portal/boats/request-job  (multipart: boat, category, description,
 *       remarks, requestedBy, position, image?) → a Pending job on the boat's
 *       Jobs board, and a bell alert to the Orbit 2 admins
 *
 * Orbit 2 tables are closed to portal logins; this route reads them with the
 * service role, only for boats on the caller's login (resolvePortalBoats), and
 * only the owner-safe columns: never team comments, remarks, technician names,
 * assigned team or the office's own notes.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalBoats, type PortalBoatOwner } from '@/lib/portal/portal-boats-auth.server'
import { parseStorageRefOrPath } from '@/lib/signed-url'
import { boatHiddenSections, type PortalModuleRow } from '@/lib/portal/portal-modules'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}
type Sb = ReturnType<typeof admin>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const OPEN_TTL = 5 * 60
const DOC_BUCKET = 'orbit-documents'

export const REGIMES = {
  dma: { label: 'DMA inspection', authority: 'Dubai Maritime Authority' },
  fma: { label: 'FMA inspection', authority: 'Federal Maritime Authority' },
  rya: { label: 'RYA safety checklist', authority: 'RYA' },
} as const
type Regime = keyof typeof REGIMES

const RYA_LABEL: Record<string, string> = { pwc: 'Personal watercraft', cruising: 'Cruising', powerboat: 'Powerboat' }

const DOC_LABEL: Record<string, string> = {
  vessel_invoice: 'Vessel invoice / bill of sale',
  builders_certificate: "Builder's certificate",
  customs_clearance: 'Customs clearance certificate',
  marine_vessel_license: 'Marine vessel licence',
  marine_insurance: 'Insurance',
  berth_agreement: 'Berth agreement',
  vhf_radio_licensing: 'VHF radio licence',
  liferaft_certificate: 'Liferaft & lifejacket service',
  fire_extinguisher_certificate: 'Fire extinguisher service',
  rya_checklist: 'RYA checklist',
  dma_checklist: 'DMA checklist',
  fma_checklist: 'FMA checklist',
  other: 'Other',
}

const JOB_LABEL: Record<string, string> = {
  booked: 'Service',
  maintenance: 'Maintenance',
  defect: 'Defect repair',
  checklist: 'Checklist',
  inventory: 'Inventory check',
  rya_checklist: 'RYA checklist',
  dma_checklist: 'DMA checklist',
  fma_checklist: 'FMA checklist',
}

/** The boat, if it's on the caller's login and still active. */
function ownsBoat(owner: PortalBoatOwner, boatId: string | null): boatId is string {
  return !!boatId && UUID_RE.test(boatId) && owner.boatIds.includes(boatId)
}

const addYear = (d: string) => {
  const x = new Date(`${d}T00:00:00Z`)
  x.setUTCFullYear(x.getUTCFullYear() + 1)
  return x.toISOString().slice(0, 10)
}

export async function portalBoatDetailHandler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  const auth = await resolvePortalBoats(request)
  if (!auth.ok) return auth.response
  const { owner } = auth
  const boatId = new URL(request.url).searchParams.get('boat')
  if (!ownsBoat(owner, boatId)) return json({ error: 'Boat not found' }, 404)

  const sb = admin()
  const [boatR, docsR, jobsR, invR, expR, svcR] = await Promise.all([
    sb.from('orbit2_boats')
      .select('id, inspections_required, rya_checklist, dma_last_inspection, dma_report_ref, fma_last_inspection, fma_report_ref, rya_last_inspection, rya_report_ref')
      .eq('id', boatId).eq('active', true).maybeSingle(),
    sb.from('orbit2_boat_documents').select('id, category, file_name, created_at').eq('boat_id', boatId).order('created_at', { ascending: false }),
    // The owner view (12 Oct 2026 design) shows the assigned crew and technician
    // on each job; remarks and team comments stay office-only.
    sb.from('orbit2_boat_tasks').select('id, kind, title, status, due_date, schedule_date, schedule_time, job_no, assigned_team, technician, requested_by_name, created_at, updated_at')
      .eq('boat_id', boatId).order('created_at', { ascending: false }).limit(300),
    sb.from('orbit2_boat_inventory').select('id, item, qty, unit, condition, expiry_date, on_board')
      .eq('boat_id', boatId).order('item'),
    sb.from('orbit2_boat_expenses').select('id, category, part_type, expense_date, cost, currency, details, boat_task_id')
      .eq('boat_id', boatId).order('expense_date', { ascending: false }),
    sb.from('orbit2_boat_services').select('id, service, last_service_date, next_service_date, current_run_hours, next_service_run_hours')
      .eq('boat_id', boatId),
  ])
  if (!boatR.data) return json({ error: 'Boat not found' }, 404)
  for (const r of [docsR, jobsR, invR, expR, svcR]) if (r.error) return json({ error: 'Could not load your boat' }, 500)

  // Receipts on the expenses and reports on the services — names only; each
  // opens through /api/portal/boats/open.
  const expIds = (expR.data ?? []).map((e: any) => e.id as string)
  const svcIds = (svcR.data ?? []).map((s: any) => s.id as string)
  const [expFilesR, svcFilesR] = await Promise.all([
    expIds.length ? sb.from('orbit2_boat_expense_files').select('id, expense_id, file_name').in('expense_id', expIds).order('created_at') : Promise.resolve({ data: [] as any[] }),
    svcIds.length ? sb.from('orbit2_boat_service_files').select('id, service_id, file_name').in('service_id', svcIds).order('created_at') : Promise.resolve({ data: [] as any[] }),
  ])
  // Photos on each job (the crew's field photos and the owner's own request
  // photo) — names only; each opens through /api/portal/boats/open.
  const jobIds = (jobsR.data ?? []).map((j: any) => j.id as string)
  const jobImgR = jobIds.length
    ? await sb.from('orbit2_files').select('id, boat_task_id, file_name').in('boat_task_id', jobIds).eq('slot', 'image').order('created_at')
    : { data: [] as any[] }
  const jobNo = new Map((jobsR.data ?? []).map((j: any) => [j.id as string, (j.job_no as string | null) ?? null]))
  const kitR = { data: (invR.data ?? []).filter((i: any) => i.expiry_date).sort((a: any, b: any) => String(a.expiry_date).localeCompare(String(b.expiry_date))) }

  // Sections staff have switched off for this boat aren't served at all.
  const { data: modRows } = await sb.from('yacht_portal_modules').select('module, enabled, features').eq('boat_id', boatId)
  const off = boatHiddenSections((modRows ?? []) as PortalModuleRow[])

  const b: any = boatR.data
  const required: string[] = Array.isArray(b.inspections_required) ? b.inspections_required : []
  const compliance = (Object.keys(REGIMES) as Regime[]).filter((r) => required.includes(r)).map((r) => {
    const last: string | null = b[`${r}_last_inspection`] ?? null
    return {
      regime: r,
      label: REGIMES[r].label,
      authority: REGIMES[r].authority,
      variant: r === 'rya' && b.rya_checklist ? RYA_LABEL[b.rya_checklist] ?? b.rya_checklist : null,
      lastInspection: last,
      nextDue: last ? addYear(last) : null,
      hasReport: !!b[`${r}_report_ref`],
    }
  })

  return json({
    hidden: [...off],
    compliance: off.has('compliance') ? [] : compliance,
    documents: off.has('documents') ? [] : (docsR.data ?? []).map((d: any) => ({
      id: d.id, category: d.category, categoryLabel: DOC_LABEL[d.category] ?? 'Other', fileName: d.file_name, addedAt: d.created_at,
    })),
    jobs: off.has('jobs') ? [] : (jobsR.data ?? []).map((j: any) => ({
      id: j.id, jobNo: j.job_no ?? null, kind: j.kind, kindLabel: JOB_LABEL[j.kind] ?? 'Job', title: j.title,
      status: j.status, dueDate: j.due_date ?? null, scheduledDate: j.schedule_date ?? null,
      scheduledTime: j.schedule_time ? String(j.schedule_time).slice(0, 5) : null, updatedAt: j.updated_at,
      assignedCrew: Array.isArray(j.assigned_team) ? j.assigned_team : [], technician: j.technician ?? null,
      requestedByOwner: !!j.requested_by_name,
      images: (jobImgR.data ?? []).filter((f: any) => f.boat_task_id === j.id).map((f: any) => ({ id: f.id, fileName: f.file_name })),
    })),
    inventory: off.has('inventory') ? [] : (invR.data ?? []).map((i: any) => ({
      id: i.id, item: i.item, qty: i.qty, unit: i.unit ?? null, condition: i.condition ?? null,
      expiryDate: i.expiry_date ?? null, onBoard: i.on_board !== false,
    })),
    expenses: off.has('expenses') ? [] : (expR.data ?? []).map((e: any) => ({
      id: e.id, category: e.category, partType: e.part_type ?? null, date: e.expense_date, cost: Number(e.cost),
      currency: e.currency, details: e.details ?? null, jobRef: e.boat_task_id ? jobNo.get(e.boat_task_id) ?? null : null,
      files: (expFilesR.data ?? []).filter((f: any) => f.expense_id === e.id).map((f: any) => ({ id: f.id, fileName: f.file_name })),
    })),
    services: off.has('maintenance') ? [] : (svcR.data ?? []).map((s: any) => ({
      id: s.id, service: s.service, lastServiceDate: s.last_service_date ?? null, nextServiceDate: s.next_service_date ?? null,
      currentRunHours: s.current_run_hours != null ? Number(s.current_run_hours) : null,
      nextServiceRunHours: s.next_service_run_hours != null ? Number(s.next_service_run_hours) : null,
      files: (svcFilesR.data ?? []).filter((f: any) => f.service_id === s.id).map((f: any) => ({ id: f.id, fileName: f.file_name })),
    })),
    safetyKit: off.has('safety') ? [] : (kitR.data ?? []).map((i: any) => ({
      id: i.id, item: i.item, qty: i.qty, unit: i.unit ?? null, condition: i.condition ?? null,
      expiryDate: i.expiry_date, onBoard: i.on_board !== false,
    })),
  })
}

async function record(sb: Sb, request: Request, owner: PortalBoatOwner, boatId: string, outcome: string,
                      what: { sourceTable: string; sourceId?: string | null; storageRef?: string | null }) {
  // A preview of a row with no login has no user to attribute the open to.
  if (!owner.userId) return
  const { error } = await sb.from('portal_document_access').insert({
    user_id: owner.userId, boat_id: boatId, source_table: what.sourceTable,
    source_id: what.sourceId ?? null, storage_ref: what.storageRef ?? null, outcome,
    ip_address: request.headers.get('cf-connecting-ip'), user_agent: request.headers.get('user-agent'),
  })
  if (error) console.error('[portal-boat-open] access not recorded:', error.message)
}

export async function portalBoatOpenHandler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  const auth = await resolvePortalBoats(request)
  if (!auth.ok) return auth.response
  const { owner } = auth
  const url = new URL(request.url)
  const boatId = url.searchParams.get('boat')
  const type = url.searchParams.get('type')
  const sb = admin()
  if (!ownsBoat(owner, boatId)) return json({ error: 'Document not found' }, 404)
  const { data: modRows } = await sb.from('yacht_portal_modules').select('module, enabled, features').eq('boat_id', boatId)
  const off = boatHiddenSections((modRows ?? []) as PortalModuleRow[])
  if ((type === 'document' && off.has('documents')) || (type === 'inspection' && off.has('compliance') && off.has('documents'))) {
    return json({ error: 'Document not found' }, 404)
  }

  let stored = ''
  let sourceTable = ''
  let sourceId: string | null = null

  if (type === 'job_image') {
    // A photo on a job — checked back to this boat through the job.
    const id = url.searchParams.get('id') ?? ''
    sourceTable = 'orbit2_files'
    if (off.has('jobs')) return json({ error: 'Document not found' }, 404)
    if (!UUID_RE.test(id)) { await record(sb, request, owner, boatId, 'not_found', { sourceTable }); return json({ error: 'Document not found' }, 404) }
    sourceId = id
    const { data } = await sb.from('orbit2_files')
      .select('id, slot, storage_ref, task:orbit2_boat_tasks(boat_id)').eq('id', id).maybeSingle()
    if (!data || (data as any).slot !== 'image' || (data as any).task?.boat_id !== boatId) {
      await record(sb, request, owner, boatId, data ? 'denied' : 'not_found', { sourceTable, sourceId })
      return json({ error: 'Document not found' }, 404)
    }
    stored = String((data as any).storage_ref ?? '')
  } else if (type === 'expense_file' || type === 'service_file') {
    // A receipt on an expense, or a report on a Service Calendar line — checked
    // back to this boat through its parent row.
    const id = url.searchParams.get('id') ?? ''
    const expense = type === 'expense_file'
    sourceTable = expense ? 'orbit2_boat_expense_files' : 'orbit2_boat_service_files'
    if ((expense && off.has('expenses')) || (!expense && off.has('maintenance'))) return json({ error: 'Document not found' }, 404)
    if (!UUID_RE.test(id)) { await record(sb, request, owner, boatId, 'not_found', { sourceTable }); return json({ error: 'Document not found' }, 404) }
    sourceId = id
    const parent = expense ? 'orbit2_boat_expenses' : 'orbit2_boat_services'
    const { data } = await sb.from(sourceTable)
      .select(`id, storage_ref, parent:${parent}(boat_id)`).eq('id', id).maybeSingle()
    if (!data || (data as any).parent?.boat_id !== boatId) {
      await record(sb, request, owner, boatId, data ? 'denied' : 'not_found', { sourceTable, sourceId })
      return json({ error: 'Document not found' }, 404)
    }
    stored = String((data as any).storage_ref ?? '')
  } else if (type === 'document') {
    const id = url.searchParams.get('id') ?? ''
    sourceTable = 'orbit2_boat_documents'
    if (!UUID_RE.test(id)) { await record(sb, request, owner, boatId, 'not_found', { sourceTable }); return json({ error: 'Document not found' }, 404) }
    sourceId = id
    const { data } = await sb.from('orbit2_boat_documents').select('id, boat_id, storage_ref').eq('id', id).maybeSingle()
    if (!data || (data as any).boat_id !== boatId) {
      await record(sb, request, owner, boatId, data ? 'denied' : 'not_found', { sourceTable, sourceId })
      return json({ error: 'Document not found' }, 404)
    }
    stored = String((data as any).storage_ref ?? '')
  } else if (type === 'inspection') {
    const regime = url.searchParams.get('regime') as Regime | null
    sourceTable = `orbit2_boats:${regime ?? ''}_report`
    if (!regime || !(regime in REGIMES)) return json({ error: 'Document not found' }, 404)
    const { data } = await sb.from('orbit2_boats').select(`id, ${regime}_report_ref`).eq('id', boatId).maybeSingle()
    stored = String((data as any)?.[`${regime}_report_ref`] ?? '')
    sourceId = boatId
  } else {
    return json({ error: 'Unknown document type' }, 400)
  }

  if (!stored) {
    await record(sb, request, owner, boatId, 'not_found', { sourceTable, sourceId })
    return json({ error: 'No file has been uploaded for this yet' }, 404)
  }
  const ref = parseStorageRefOrPath(stored, DOC_BUCKET)
  const signed = ref ? await sb.storage.from(ref.bucket).createSignedUrl(ref.path, OPEN_TTL) : null
  if (!ref || !signed?.data?.signedUrl) {
    await record(sb, request, owner, boatId, 'error', { sourceTable, sourceId, storageRef: stored })
    return json({ error: 'That document could not be opened' }, 502)
  }
  await record(sb, request, owner, boatId, 'allowed', { sourceTable, sourceId, storageRef: `${ref.bucket}/${ref.path}` })
  if (url.searchParams.get('as') === 'json') return json({ url: signed.data.signedUrl })
  return new Response(null, { status: 302, headers: { Location: signed.data.signedUrl, 'Cache-Control': 'no-store' } })
}

// ── Request Job ─────────────────────────────────────────────────────────────

/** The job categories an owner can pick — the office's own, minus its internal checklist runs. */
export const OWNER_JOB_CATEGORIES: Record<string, string> = {
  Maintenance: 'maintenance', Repair: 'defect', Inventory: 'inventory', Booked: 'booked',
}
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const clip = (v: FormDataEntryValue | null, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')

/**
 * The owner's "Request Job" button. The request lands as a Pending job on the
 * boat's Jobs board — no crew yet, so it reaches no phone until the office
 * schedules it — with who asked, any photo attached, and a bell alert to the
 * Orbit 2 admins linking straight to the boat.
 */
export async function portalBoatRequestJobHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await resolvePortalBoats(request)
  if (!auth.ok) return auth.response
  const { owner } = auth
  if (owner.preview) return json({ error: 'Read-only preview — nothing can be sent' }, 403)

  let form: FormData
  try { form = await request.formData() } catch { return json({ error: 'Bad request' }, 400) }
  const boatId = clip(form.get('boat'), 64)
  if (!ownsBoat(owner, boatId)) return json({ error: 'Boat not found' }, 404)
  const category = clip(form.get('category'), 40)
  const kind = OWNER_JOB_CATEGORIES[category]
  if (!kind) return json({ error: 'Choose a category' }, 400)
  const description = clip(form.get('description'), 2000)
  if (!description) return json({ error: 'Describe what you need done' }, 400)
  const remarks = clip(form.get('remarks'), 4000)
  const requestedBy = clip(form.get('requestedBy'), 120)
  if (!requestedBy) return json({ error: 'Say who is asking' }, 400)
  const position = clip(form.get('position'), 120)
  const image = form.get('image')
  const file = image && typeof image !== 'string' && image.size > 0 ? image : null
  if (file && (!/^image\//.test(file.type) || file.size > MAX_IMAGE_BYTES)) {
    return json({ error: 'Attach a photo (JPG or PNG) under 10 MB' }, 400)
  }

  const sb = admin()
  const { data: boat } = await sb.from('orbit2_boats').select('id, name').eq('id', boatId).eq('active', true).maybeSingle()
  if (!boat) return json({ error: 'Boat not found' }, 404)

  const { data: job, error } = await sb.from('orbit2_boat_tasks').insert({
    boat_id: boatId, kind, title: description, remarks: remarks || null, status: 'Pending', assigned_team: [],
    requested_by_name: requestedBy, requested_by_position: position || null,
    requested_by_user: owner.userId || null, requested_at: new Date().toISOString(),
  }).select('id, job_no').single()
  if (error || !job) {
    console.error('[portal-request-job] insert failed:', error?.message)
    return json({ error: 'Your request could not be sent — please try again' }, 500)
  }

  if (file) {
    const path = `orbit2/portal-requests/${crypto.randomUUID()}-${(file.name || 'photo').replace(/[^\w.-]+/g, '_').slice(0, 80)}`
    const up = await sb.storage.from(DOC_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
    if (up.error) console.error('[portal-request-job] photo upload failed:', up.error.message)
    else {
      const { error: fErr } = await sb.from('orbit2_files').insert({
        boat_task_id: job.id, slot: 'image', file_name: file.name || 'photo', storage_ref: `${DOC_BUCKET}/${path}`,
        uploaded_by: owner.userId || null,
      })
      if (fErr) console.error('[portal-request-job] photo record failed:', fErr.message)
    }
  }

  // Tell the team. A failure here doesn't lose the request — it's on the board.
  const { data: team } = await sb.rpc('orbit2_admin_recipients')
  const notes = ((team ?? []) as { user_id: string }[]).map((p) => ({
    user_id: p.user_id,
    type: 'orbit2_owner_job_request',
    urgency: 'warning',
    title: `Job request — ${(boat as any).name}`,
    body: `${requestedBy}${position ? ` (${position})` : ''} asked for ${category.toLowerCase()}: ${description.slice(0, 160)}. It's on the Jobs board as ${job.job_no ?? 'a new job'} — assign a crew to schedule it.`,
    action_url: `/polaris-redesign?screen=orbit2&boat=${boatId}`,
    metadata: { boat_id: boatId, boat_task_id: job.id },
  }))
  if (notes.length) {
    const { error: nErr } = await sb.from('notifications').insert(notes)
    if (nErr) console.error('[portal-request-job] notifications:', nErr.message)
  }

  return json({ ok: true, jobNo: job.job_no ?? null })
}
