/**
 * Import a PDF/Word document into a Knowledge Base guide (authenticated).
 *   POST /api/guides/import
 *     body: { fileBase64, fileName, mimeType, department, category?, published? }
 *   → extracts the content, creates the guide, attaches a branded PDF.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

export async function guidesImportHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)
  const auth = request.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, 401)
  const { data: { user } } = await (supabaseAdmin as any).auth.getUser(auth.slice(7))
  if (!user) return json({ ok: false, error: 'Unauthorized' }, 401)

  let body: any
  try { body = await request.json() } catch { return json({ ok: false, error: 'Invalid JSON body' }, 400) }
  if (!body?.fileBase64 || !body?.department) return json({ ok: false, error: 'fileBase64 and department are required' }, 400)

  try {
    const { importGuideDocument } = await import('@/lib/guides/import.server')
    const result = await importGuideDocument({
      fileBase64: body.fileBase64,
      fileName: String(body.fileName ?? 'document'),
      mimeType: String(body.mimeType ?? ''),
      departmentLabel: String(body.department),
      categoryHint: body.category ? String(body.category) : undefined,
      createdBy: user.id,
      published: body.published !== false,
    })
    return json(result, result.ok ? 200 : 500)
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500)
  }
}
