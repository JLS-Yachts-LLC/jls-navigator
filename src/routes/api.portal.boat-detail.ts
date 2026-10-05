/**
 * Client portal — one managed boat in detail, for its owner.
 *
 *   GET /api/portal/boats/detail?boat=<id>
 *       → { compliance[], documents[], jobs[], safetyKit[] }
 *   GET /api/portal/boats/open?boat=<id>&type=document&id=<doc id>
 *   GET /api/portal/boats/open?boat=<id>&type=inspection&regime=dma|fma|rya
 *       → 302 to a 5-minute signed URL, after an ownership check, every attempt
 *         recorded in portal_document_access (as the yacht portal does)
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
  const [boatR, docsR, jobsR, kitR] = await Promise.all([
    sb.from('orbit2_boats')
      .select('id, inspections_required, rya_checklist, dma_last_inspection, dma_report_ref, fma_last_inspection, fma_report_ref, rya_last_inspection, rya_report_ref')
      .eq('id', boatId).eq('active', true).maybeSingle(),
    sb.from('orbit2_boat_documents').select('id, category, file_name, created_at').eq('boat_id', boatId).order('created_at', { ascending: false }),
    sb.from('orbit2_boat_tasks').select('id, kind, title, status, due_date, schedule_date, schedule_time, job_no, created_at, updated_at')
      .eq('boat_id', boatId).order('created_at', { ascending: false }).limit(100),
    sb.from('orbit2_boat_inventory').select('id, item, qty, unit, condition, expiry_date, on_board')
      .eq('boat_id', boatId).not('expiry_date', 'is', null).order('expiry_date'),
  ])
  if (!boatR.data) return json({ error: 'Boat not found' }, 404)
  for (const r of [docsR, jobsR, kitR]) if (r.error) return json({ error: 'Could not load your boat' }, 500)

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
  {
    const { data: modRows } = await sb.from('yacht_portal_modules').select('module, enabled, features').eq('boat_id', boatId)
    const off = boatHiddenSections((modRows ?? []) as PortalModuleRow[])
    if ((type === 'document' && off.has('documents')) || (type === 'inspection' && off.has('compliance') && off.has('documents'))) {
      return json({ error: 'Document not found' }, 404)
    }
  }

  let stored = ''
  let sourceTable = ''
  let sourceId: string | null = null

  if (type === 'document') {
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
  return new Response(null, { status: 302, headers: { Location: signed.data.signedUrl, 'Cache-Control': 'no-store' } })
}
