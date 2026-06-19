import type { SupportingDocPayload } from '@/components/visa/SupportingDocumentsPage/SupportingDocumentsPage.types'

export type { SupportingDocPayload }

/**
 * POST /api/visa/supporting-docs
 *
 * Uses FormData multipart — not JSON — because it may carry a file.
 * Fee addition to the application cost ledger is triggered server-side only.
 */
export async function saveSupportingDocDeclaration(
  payload: SupportingDocPayload,
): Promise<void> {
  const form = new FormData()
  form.append('application_id',               payload.applicationId)
  form.append('seamans_book_uploaded',         String(payload.seamansBookUploaded))
  form.append('supporting_letter_requested',   String(payload.supportingLetterRequested))
  form.append('supporting_letter_authorised',  String(payload.supportingLetterAuthorised))
  form.append('alternative_docs_declared',     String(payload.alternativeDocsDeclared))
  form.append('documents_confirmed',           String(payload.documentsConfirmed))
  if (payload.seamansBookFile) {
    form.append('seamans_book_file', payload.seamansBookFile)
  }

  const res = await fetch('/api/visa/supporting-docs', {
    method: 'POST',
    body:   form,
  })

  if (!res.ok) throw new Error('Failed to save supporting document declaration')
}
