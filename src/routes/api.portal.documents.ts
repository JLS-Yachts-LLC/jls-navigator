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
 * anything is signed. Every open is recorded in portal_document_access.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht } from '@/lib/portal/portal-auth.server'
import { parseStorageRefOrPath } from '@/lib/signed-url'

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

export async function portalDocumentOpenHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth

  const url = new URL(request.url)
  const kind = String(url.searchParams.get('type') ?? '') as Kind
  const id = String(url.searchParams.get('id') ?? '')
  const spec = KINDS[kind]
  if (!spec) return json({ error: 'Unknown document type' }, 400)
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Invalid document id' }, 400)

  const sb = admin()

  // The ownership check: the row must both exist AND belong to this vessel.
  const { data: row } = await sb
    .from(spec.table)
    .select(`id, yacht_id, ${spec.fileColumn}`)
    .eq('id', id)
    .eq('yacht_id', yacht.yachtId)
    .maybeSingle() as { data: any }
  if (!row) return json({ error: 'Document not found' }, 404)

  const stored = String(row[spec.fileColumn] ?? '')
  if (!stored) return json({ error: 'No file has been uploaded for this document yet' }, 404)

  // Some of these columns hold a "<bucket>/<path>" reference and some a bare path
  // inside the kind's own bucket, so the first segment can only be read as a
  // bucket when it actually names one.
  const ref = parseStorageRefOrPath(stored, spec.bucket)
  if (!ref) return json({ error: 'That document could not be opened' }, 502)
  const { bucket, path } = ref

  const { data: signed, error } = await sb.storage.from(bucket).createSignedUrl(path, OPEN_TTL)
  if (error || !signed?.signedUrl) return json({ error: 'That document could not be opened' }, 502)

  // Audit before redirecting — best-effort, never blocks the client.
  try {
    await sb.from('portal_document_access').insert([{
      user_id: yacht.userId,
      yacht_id: yacht.yachtId,
      source_table: spec.table,
      source_id: id,
      storage_ref: `${bucket}/${path}`,
      ip_address: request.headers.get('cf-connecting-ip')
        ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? null,
      user_agent: request.headers.get('user-agent'),
    }])
  } catch (e) {
    console.error('[portal-documents] could not record access:', e)
  }

  return new Response(null, {
    status: 302,
    headers: { Location: signed.signedUrl, 'Cache-Control': 'no-store' },
  })
}
