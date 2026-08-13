/**
 * POST /api/forms/seed — upsert the built-in form definitions (admin only).
 *
 * The definitions live in code (src/lib/forms/*) so they are version-controlled and
 * reviewable; this copies them into the `forms` table, which is what the UI reads.
 * Idempotent: re-running updates the definition in place and bumps the version,
 * leaving submissions and any attached PDF untouched.
 */
import { requireAdminAccess } from '@/lib/admin/access'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { PRE_ARRIVAL_DEFINITION } from '@/lib/forms/pre-arrival-definition'

const BUILT_IN = [
  {
    slug: 'pre-arrival-ship-particulars',
    title: 'Pre-Arrival / Cruising Permit Information',
    description:
      'Ship particulars, department heads, dimensions, radio, owner and billing details — sent to a yacht before it enters UAE waters, and the basis of the cruising permit application.',
    category: 'pre_arrival',
    definition: PRE_ARRIVAL_DEFINITION,
  },
]

export async function formsSeedHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request)
  if (!session.ok) return session.response

  const db = supabaseAdmin as any
  const results: Array<Record<string, unknown>> = []

  for (const f of BUILT_IN) {
    const { data: existing } = await db.from('forms').select('id, version').eq('slug', f.slug).maybeSingle()
    if (existing) {
      const { error } = await db.from('forms').update({
        title: f.title, description: f.description, category: f.category,
        definition: f.definition, version: (existing.version ?? 1) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
      results.push({ slug: f.slug, action: error ? 'error' : 'updated', error: error?.message })
    } else {
      const { error } = await db.from('forms').insert([{
        slug: f.slug, title: f.title, description: f.description,
        category: f.category, definition: f.definition,
      }])
      results.push({ slug: f.slug, action: error ? 'error' : 'created', error: error?.message })
    }
  }

  const fieldCount = BUILT_IN[0].definition.reduce((n, s) => n + s.fields.length, 0)
  return new Response(JSON.stringify({ ok: true, results, sections: BUILT_IN[0].definition.length, fields: fieldCount }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
}
