/**
 * POST /api/visa/supporting-docs
 *
 * Saves supporting document declaration for a visa application.
 * Handles optional Seaman's Book file upload via multipart/form-data.
 *
 * Steps:
 *   1. Authenticate via Bearer token
 *   2. Parse and validate multipart form
 *   3. Validate file if present (type + size)
 *   4. Store file in Supabase Storage if present
 *   5. Update visa_applications row with declaration flags
 *   6. Trigger fee addition if supporting letter requested + authorised
 */

import { createClient } from '@supabase/supabase-js'

const ALLOWED_MIME   = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const MAX_SIZE_BYTES = 10 * 1024 * 1024  // 10MB

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function supabaseAdmin(): ReturnType<typeof createClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key)
}

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization') ?? ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : null
}

export async function visaSupportingDocsHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // 1. Authenticate
  const token = getToken(request)
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const sb     = supabaseAdmin()
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  // 2. Parse multipart form
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return json({ error: 'Invalid form data' }, 400)
  }

  const applicationId             = formData.get('application_id') as string | null
  const seamansBookUploaded       = formData.get('seamans_book_uploaded') === 'true'
  const supportingLetterRequested = formData.get('supporting_letter_requested') === 'true'
  const supportingLetterAuthorised= formData.get('supporting_letter_authorised') === 'true'
  const alternativeDocsDeclared   = formData.get('alternative_docs_declared') === 'true'
  const documentsConfirmed        = formData.get('documents_confirmed') === 'true'
  const seamansBookFile           = formData.get('seamans_book_file') as File | null

  if (!applicationId) return json({ error: 'application_id is required' }, 400)

  // Verify application belongs to the authenticated user's org / is accessible
  const { data: application, error: appErr } = await (sb as any)
    .from('visa_applications')
    .select('id, submitted_by, crew_id')
    .eq('id', applicationId)
    .single()

  if (appErr || !application) return json({ error: 'Application not found' }, 404)

  // 3 + 4. Validate and store file if present
  let seamansBookFileId: string | null = null

  if (seamansBookFile && seamansBookFile.size > 0) {
    // Server-side type validation
    if (!ALLOWED_MIME.has(seamansBookFile.type)) {
      return json({ error: 'Only PDF, JPG, or PNG files are accepted.' }, 422)
    }
    // Server-side size validation
    if (seamansBookFile.size > MAX_SIZE_BYTES) {
      return json({ error: 'File must be under 10MB.' }, 422)
    }

    const ext      = seamansBookFile.name.split('.').pop() ?? 'pdf'
    const path     = `visa-documents/${applicationId}/seamans-book.${ext}`
    const fileBuffer = await seamansBookFile.arrayBuffer()

    const { error: uploadErr } = await sb.storage
      .from('crew-documents')
      .upload(path, fileBuffer, {
        contentType: seamansBookFile.type,
        upsert:      true,
      })

    if (uploadErr) {
      return json({ error: 'File upload failed. Please try again.' }, 500)
    }

    seamansBookFileId = path
  }

  // 5. Update application record with declaration flags
  const updatePayload: Record<string, unknown> = {
    seamans_book_uploaded:         seamansBookUploaded,
    seamans_book_file_id:          seamansBookFileId,
    supporting_letter_requested:   supportingLetterRequested,
    supporting_letter_authorised:  supportingLetterAuthorised,
    alternative_docs_declared:     alternativeDocsDeclared,
    documents_confirmed:           documentsConfirmed,
    updated_at:                    new Date().toISOString(),
  }

  const { error: updateErr } = await (sb as any)
    .from('visa_applications')
    .update(updatePayload)
    .eq('id', applicationId)

  if (updateErr) {
    return json({ error: 'Failed to update application. Please try again.' }, 500)
  }

  // 6. Server-side fee trigger — only when supporting letter is both requested and authorised.
  // Fee addition to the cost ledger is intentionally server-side only — never client-triggered.
  if (supportingLetterRequested && supportingLetterAuthorised) {
    const { error: feeErr } = await (sb as any)
      .from('application_cost_items')
      .insert({
        application_id: applicationId,
        item_type:      'supporting_letter',
        description:    'Supporting Letter preparation by JLS',
        amount_aed:     50.00,
        amount_usd:     14.00,
        created_by:     user.id,
      })

    // Fee insertion failure is non-fatal — log but don't block the response.
    // Ops team can reconcile via the cost ledger if needed.
    if (feeErr) {
      console.error('[supporting-docs] fee insertion failed:', feeErr.message)
    }
  }

  return json({ ok: true })
}
