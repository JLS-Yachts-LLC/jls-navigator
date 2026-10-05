/**
 * Client-portal uploads.
 *
 *   POST /api/portal/upload  (multipart/form-data: target, id?, item?, title?, doc_type?, file)
 *
 *   target = checklist_photo  id = checklist run, item = checklist item id     (Checklists)
 *          | drill_file       id = ism_drills id                               (ISM & safety)
 *          | job_photo        id = pms_tasks id                                (Jobs & maintenance)
 *          | ism_cert         id = ism_certificates id — sets the certificate's file
 *          | client_document  title, doc_type — a document the client sends JLS
 *
 * Every upload is checked here, not just in the browser: at most 15 MB; only
 * PDF, common image types and Office documents; and the file's first bytes must
 * match what it claims to be (so a renamed executable or script is refused).
 * Files are stored privately in permit-documents under portal/<yacht_id>/…, and
 * only against records that belong to the caller's vessel, in a section their
 * vessel has switched on and their position can see. Opening is through
 * /api/portal/documents/open, which signs a short-lived link and logs the open.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht, portalModulesFor, type PortalYacht } from '@/lib/portal/portal-auth.server'
import { hiddenSections } from '@/lib/portal/portal-positions'
import { sectionEnabled } from '@/lib/portal/portal-modules'
import { logAuditEvent } from '@/lib/admin/audit'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}
type Sb = ReturnType<typeof admin>

const BUCKET = 'permit-documents'
const MAX_BYTES = 15 * 1024 * 1024
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What a client may upload, by extension, with the bytes each must start with. */
const TYPES: Record<string, { mime: string; magic: (b: Uint8Array) => boolean; image: boolean }> = {
  pdf: { mime: 'application/pdf', image: false, magic: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  jpg: { mime: 'image/jpeg', image: true, magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mime: 'image/jpeg', image: true, magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { mime: 'image/png', image: true, magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  webp: { mime: 'image/webp', image: true, magic: (b) => b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45 },
  heic: { mime: 'image/heic', image: true, magic: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 },
  heif: { mime: 'image/heif', image: true, magic: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', image: false, magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', image: false, magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
  doc: { mime: 'application/msword', image: false, magic: (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 },
}

const TARGETS = {
  checklist_photo: { section: 'checklists', table: 'onboard_checklist_runs', imagesOnly: true },
  drill_file: { section: 'ism', table: 'ism_drills', imagesOnly: false },
  job_photo: { section: 'pms', table: 'pms_tasks', imagesOnly: true },
  ism_cert: { section: 'ism', table: 'ism_certificates', imagesOnly: false },
  client_document: { section: 'documents', table: 'yacht_documents', imagesOnly: false },
} as const
type Target = keyof typeof TARGETS

const CLIENT_DOC_TYPES = new Set(['crew_document', 'vessel_certificate', 'insurance', 'registration', 'contract', 'other'])

async function callerName(sb: Sb, yacht: PortalYacht): Promise<string> {
  const { data } = await sb.from('captain_accounts').select('display_name')
    .eq('user_id', yacht.userId).eq('yacht_id', yacht.yachtId).eq('active', true).maybeSingle()
  return ((data as any)?.display_name as string | undefined) || yacht.email || 'Client'
}

const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim().slice(-120) || 'file'

export async function portalUploadHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)
  if (yacht.preview) return json({ error: 'Read-only preview — sign in as the client to upload.' }, 403)

  const form = await request.formData().catch(() => null)
  if (!form) return json({ error: 'Expected a file upload' }, 400)
  const target = String(form.get('target') ?? '') as Target
  const spec = TARGETS[target]
  if (!spec) return json({ error: 'Unknown upload' }, 400)

  const modules = await portalModulesFor(yacht.yachtId)
  if (!sectionEnabled(spec.section, modules)) return json({ error: "This isn't switched on for your vessel." }, 403)
  if (hiddenSections(yacht.position).has(spec.section)) return json({ error: "Your position doesn't include this section." }, 403)

  const file = form.get('file')
  if (!(file instanceof File)) return json({ error: 'Choose a file to upload' }, 400)
  if (file.size === 0) return json({ error: 'That file is empty' }, 400)
  if (file.size > MAX_BYTES) return json({ error: 'Files can be up to 15 MB' }, 400)
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const type = TYPES[ext]
  if (!type) return json({ error: 'Upload a PDF, a photo (JPG, PNG, HEIC, WEBP) or a Word / Excel document' }, 400)
  if (spec.imagesOnly && !type.image) return json({ error: 'Upload a photo (JPG, PNG, HEIC or WEBP)' }, 400)
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!type.magic(bytes)) return json({ error: "That file isn't what its name says — please upload the original file" }, 400)

  const sb = admin()
  const id = String(form.get('id') ?? '')
  const item = form.get('item') ? String(form.get('item')).slice(0, 40) : null

  try {
    // The record must be this vessel's.
    if (target !== 'client_document') {
      if (!UUID_RE.test(id)) return json({ error: 'Not found' }, 404)
      const { data: rec } = await sb.from(spec.table).select('id, yacht_id').eq('id', id).maybeSingle()
      if (!rec || (rec as any).yacht_id !== yacht.yachtId) return json({ error: 'Not found' }, 404)
    }

    const path = `portal/${yacht.yachtId}/${target}/${crypto.randomUUID()}-${safeName(file.name)}`
    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: type.mime, upsert: false })
    if (upErr) throw upErr
    const ref = `${BUCKET}/${path}`
    const name = await callerName(sb, yacht)

    if (target === 'ism_cert') {
      const { error } = await sb.from('ism_certificates').update({ file_path: ref }).eq('id', id).eq('yacht_id', yacht.yachtId)
      if (error) throw error
      return json({ ok: true }, 201)
    }

    if (target === 'client_document') {
      const title = String(form.get('title') ?? '').trim().slice(0, 160) || file.name
      const docType = CLIENT_DOC_TYPES.has(String(form.get('doc_type'))) ? String(form.get('doc_type')) : 'other'
      const { data: doc, error } = await sb.from('yacht_documents').insert({
        yacht_id: yacht.yachtId, doc_type: `client_${docType}`, title, file_url: ref, file_name: file.name,
        notes: `Sent by ${name} through the Client Portal`, portal_visible: true, portal_released_at: new Date().toISOString(),
      }).select('id').single()
      if (error || !doc) throw error ?? new Error('Could not save the document')
      // Let the team know it has arrived (raises the usual client alert).
      await sb.from('captain_requests').insert({
        yacht_id: yacht.yachtId, created_by: yacht.userId, category: 'general', priority: 'normal', status: 'new',
        title: `Document received: ${title}`.slice(0, 200),
        details: `${name} sent "${title}" (${file.name}) through the Client Portal. It's in the vessel's Documents.`,
      })
      await logAuditEvent({
        event_type: 'DATA', module: 'portal', actor_id: null, actor_email: yacht.email || '(client portal)',
        actor_role: yacht.position ?? 'captain', target_type: 'yacht_documents', target_id: (doc as any).id,
        target_label: `${yacht.vesselName} · ${title}`, detail: `Client portal (${yacht.vesselName}) — uploaded ${file.name}`,
        ip_address: request.headers.get('cf-connecting-ip'), user_agent: request.headers.get('user-agent'), result: 'success',
      })
      return json({ ok: true, id: (doc as any).id }, 201)
    }

    const { data: row, error } = await sb.from('portal_files').insert({
      yacht_id: yacht.yachtId, ref_table: spec.table, ref_id: id, item_key: item,
      storage_ref: ref, file_name: file.name, mime_type: type.mime, size_bytes: file.size,
      uploaded_by: yacht.userId, uploaded_by_name: name,
    }).select('id').single()
    if (error || !row) throw error ?? new Error('Could not save the file')
    return json({ ok: true, id: (row as any).id }, 201)
  } catch (e: any) {
    console.error('[portal-upload]', e)
    return json({ error: 'Could not upload that file — please try again' }, 500)
  }
}
