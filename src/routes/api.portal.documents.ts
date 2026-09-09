/**
 * Client-portal Documents — the vessel's own paperwork, and the file behind it.
 *
 *   GET /api/portal/documents           → the documents this vessel can see
 *   GET /api/portal/documents/open?type=&id=  → 302 to a short-lived signed URL
 *
 * Served with the service role and hard-filtered to the vessel resolved from the
 * caller's JWT. Storage paths are grouped by document type rather than by vessel,
 * so "this captain's documents" cannot be expressed as a storage policy — the
 * ownership check has to happen here, against the row that owns the file, before
 * anything is signed. Every attempt is recorded in portal_document_access — the
 * refused ones too, since a captain walking other vessels' ids is exactly what
 * this endpoint exists to stop, and the 404 it answers with says nothing.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht } from '@/lib/portal/portal-auth.server'
import { parseStorageRefOrPath } from '@/lib/signed-url'
import { logAuditEvent } from '@/lib/admin/audit'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Seconds the signed URL lives — long enough to download, short enough to be useless if copied. */
const OPEN_TTL = 5 * 60

/**
 * The document kinds the portal exposes, and how to find one for a vessel.
 * `bucket` is the fallback when the stored value is a bare path rather than a
 * "<bucket>/<path>" reference.
 */
const KINDS = {
  permit: {
    table: 'permits',
    fileColumn: 'document_url',
    bucket: 'permit-documents',
  },
  vessel_doc: {
    table: 'yacht_documents',
    fileColumn: 'file_url',
    bucket: 'permit-documents',
  },
  visa: {
    table: 'visa_applications',
    fileColumn: 'visa_document_url',
    bucket: 'permit-documents',
  },
  ism_cert: {
    table: 'ism_certificates',
    fileColumn: 'file_path',
    bucket: 'esign-documents',
  },
} as const

type Kind = keyof typeof KINDS

export async function portalDocumentsHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  const sb = admin()

  try {
    const [permits, vesselDocs, visas, ismCerts] = await Promise.all([
      sb.from('permits')
        .select('id, permit_type, permit_number, license_no, status, issue_date, expiry_date, issuing_authority, holder_name, document_url')
        .eq('yacht_id', yacht.yachtId)
        .order('created_at', { ascending: false }),
      sb.from('yacht_documents')
        .select('id, title, file_name, doc_type, created_at, file_url')
        .eq('yacht_id', yacht.yachtId)
        .order('created_at', { ascending: false }),
      sb.from('visa_applications')
        .select('id, given_name, surname, visa_type, status, destination_country, visa_expiry, visa_number, visa_document_url')
        .eq('yacht_id', yacht.yachtId)
        .order('created_at', { ascending: false })
        .limit(200),
      sb.from('ism_certificates')
        .select('id, title, certificate_type, reference, issuing_authority, issued_date, expiry_date, status, file_path')
        .eq('yacht_id', yacht.yachtId)
        .order('expiry_date', { ascending: true, nullsFirst: false }),
    ])

    // The stored reference itself never leaves the server — the client only needs
    // to know whether there is a file to ask for.
    const strip = <T extends Record<string, any>>(rows: T[] | null, fileKey: string) =>
      (rows ?? []).map(({ [fileKey]: file, ...rest }) => ({ ...rest, hasFile: !!file }))

    return json({
      vessel: yacht.vesselName,
      permits: strip(permits.data as any[], 'document_url'),
      vesselDocuments: strip(vesselDocs.data as any[], 'file_url'),
      visas: strip(visas.data as any[], 'visa_document_url'),
      ismCertificates: strip(ismCerts.data as any[], 'file_path'),
    })
  } catch (e: any) {
    return json({ error: e?.message ?? 'Could not load documents' }, 500)
  }
}

/**
 * How one request for a document ended. The caller is told the same generic
 * thing whatever the answer is; this is the half only staff ever see.
 *
 *   allowed   — a signed URL was issued.
 *   denied    — the row exists and belongs to ANOTHER vessel.
 *   not_found — nothing to serve: no such row, no file on it, an unassigned row,
 *               or a request naming a type / id we don't recognise.
 *   error     — the caller's own document, but its file could not be signed.
 */
type Outcome = 'allowed' | 'denied' | 'not_found' | 'error'

const clientIp = (request: Request) =>
  request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? null

/** PostgREST reports a column it doesn't know as PGRST204, Postgres as 42703. */
const outcomeColumnMissing = (e: any) =>
  (e?.code === 'PGRST204' || e?.code === '42703') && /outcome/i.test(String(e?.message ?? ''))

/**
 * Record one attempt, whether or not it was allowed.
 *
 * Best-effort — a caller never waits on, or fails because of, the audit trail —
 * but a failure is logged rather than swallowed, because the whole point of this
 * table is being able to ask later what an account tried to open.
 */
async function recordAccess(
  sb: ReturnType<typeof admin>,
  request: Request,
  yacht: { userId: string; yachtId: string },
  outcome: Outcome,
  what: { sourceTable: string; sourceId?: string | null; storageRef?: string | null },
): Promise<void> {
  const row = {
    user_id: yacht.userId,
    yacht_id: yacht.yachtId,
    source_table: what.sourceTable,
    // On a refusal this is the id that was ASKED FOR, which is precisely what
    // makes the row worth having — it is not the caller's to see.
    source_id: what.sourceId ?? null,
    storage_ref: what.storageRef ?? null,
    ip_address: clientIp(request),
    user_agent: request.headers.get('user-agent'),
  }
  try {
    const { error } = await sb.from('portal_document_access').insert([{ ...row, outcome }])
    if (!error) return

    // `outcome` arrives with a migration applied separately from the deploy, so
    // this code can be live before the column is. Until it lands, keep recording
    // the successful opens in the old shape rather than lose those as well — a
    // refusal cannot be written there at all (source_id and storage_ref were
    // NOT NULL), so say so loudly instead of failing quietly.
    if (outcomeColumnMissing(error)) {
      if (outcome !== 'allowed') {
        console.error(
          `[portal-documents] a ${outcome} attempt went unrecorded — portal_document_access.outcome ` +
          'does not exist yet; apply 20260909160000_portal_document_access_outcome.sql',
          { source: `${row.source_table}/${row.source_id}`, user: row.user_id },
        )
        return
      }
      const retry = await sb.from('portal_document_access').insert([row])
      if (retry.error) console.error('[portal-documents] could not record access:', retry.error.message)
      return
    }
    console.error('[portal-documents] could not record access:', error.message)
  } catch (e) {
    console.error('[portal-documents] could not record access:', e)
  }
}

/**
 * Put a refusal somewhere staff actually look.
 *
 * portal_document_access is a table nobody opens unprompted; the Admin → Audit
 * screen is read, and filters on result = 'blocked'. Only a genuine cross-vessel
 * attempt is escalated here — a mistyped id or a stale link is noise, and this
 * signal is only worth anything while it stays rare. The count is what separates
 * one fat-fingered id from somebody working through a list.
 */
async function reportDenial(
  sb: ReturnType<typeof admin>,
  request: Request,
  yacht: { userId: string; email: string; vesselName: string },
  sourceTable: string,
  id: string,
): Promise<void> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await sb
      .from('portal_document_access')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', yacht.userId)
      .eq('outcome', 'denied')
      .gte('accessed_at', since)
    const recent = count ?? 1

    await logAuditEvent({
      event_type: 'SEC',
      module: 'portal',
      // A portal login has no staff profile for audit_log.user_id to reference.
      actor_id: null,
      actor_email: yacht.email || '(client portal)',
      actor_role: 'captain',
      target_type: sourceTable,
      target_id: id,
      target_label: `${sourceTable}/${id}`,
      detail: recent > 1
        ? `Client portal (${yacht.vesselName}) asked for a ${sourceTable} document belonging to another vessel — ${recent} such attempts in the last hour.`
        : `Client portal (${yacht.vesselName}) asked for a ${sourceTable} document belonging to another vessel.`,
      ip_address: clientIp(request),
      user_agent: request.headers.get('user-agent'),
      result: 'blocked',
    })
  } catch (e) {
    console.error('[portal-documents] could not report a denied access:', e)
  }
}

export async function portalDocumentOpenHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth

  const url = new URL(request.url)
  const requestedKind = String(url.searchParams.get('type') ?? '')
  const id = String(url.searchParams.get('id') ?? '')
  const spec = KINDS[requestedKind as Kind]

  const sb = admin()
  const record = (outcome: Outcome, what: Parameters<typeof recordAccess>[4]) =>
    recordAccess(sb, request, yacht, outcome, what)

  // Every exit below is recorded before it is returned. What the caller gets back
  // is unchanged — the outcome is written for staff, not answered to the client.
  if (!spec) {
    await record('not_found', { sourceTable: `unknown:${requestedKind.replace(/[^a-z0-9_-]/gi, '').slice(0, 32)}` })
    return json({ error: 'Unknown document type' }, 400)
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    await record('not_found', { sourceTable: spec.table })
    return json({ error: 'Invalid document id' }, 400)
  }

  // The ownership check. This used to scope the lookup itself to the caller's
  // vessel, which left the server as blind as the client: "not yours" and "no
  // such document" came back as the same empty result, so an account walking
  // other vessels' ids was indistinguishable from one following a dead link.
  // Fetch by id and compare owners here, where the difference can be recorded.
  const { data: row } = await sb
    .from(spec.table)
    .select(`id, yacht_id, ${spec.fileColumn}`)
    .eq('id', id)
    .maybeSingle() as { data: any }

  if (!row) {
    await record('not_found', { sourceTable: spec.table, sourceId: id })
    return json({ error: 'Document not found' }, 404)
  }

  const owner = row.yacht_id ? String(row.yacht_id) : null
  if (owner !== yacht.yachtId) {
    // A row belonging to no vessel is nobody's rather than someone else's, so it
    // is not evidence of anything — don't raise it as a cross-vessel attempt.
    if (owner) {
      await record('denied', { sourceTable: spec.table, sourceId: id })
      await reportDenial(sb, request, yacht, spec.table, id)
    } else {
      await record('not_found', { sourceTable: spec.table, sourceId: id })
    }
    // Byte-for-byte what a non-existent id returns, above.
    return json({ error: 'Document not found' }, 404)
  }

  const stored = String(row[spec.fileColumn] ?? '')
  if (!stored) {
    await record('not_found', { sourceTable: spec.table, sourceId: id })
    return json({ error: 'No file has been uploaded for this document yet' }, 404)
  }

  // Some of these columns hold a "<bucket>/<path>" reference and some a bare path
  // inside the kind's own bucket, so the first segment can only be read as a
  // bucket when it actually names one.
  const ref = parseStorageRefOrPath(stored, spec.bucket)
  if (!ref) {
    await record('error', { sourceTable: spec.table, sourceId: id, storageRef: stored })
    return json({ error: 'That document could not be opened' }, 502)
  }
  const { bucket, path } = ref

  const { data: signed, error } = await sb.storage.from(bucket).createSignedUrl(path, OPEN_TTL)
  if (error || !signed?.signedUrl) {
    await record('error', { sourceTable: spec.table, sourceId: id, storageRef: `${bucket}/${path}` })
    return json({ error: 'That document could not be opened' }, 502)
  }

  // Audit before redirecting — best-effort, never blocks the client.
  await record('allowed', { sourceTable: spec.table, sourceId: id, storageRef: `${bucket}/${path}` })

  return new Response(null, {
    status: 302,
    headers: { Location: signed.signedUrl, 'Cache-Control': 'no-store' },
  })
}
