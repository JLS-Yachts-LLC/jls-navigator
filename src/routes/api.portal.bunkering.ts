/**
 * Client-portal Bunkering — the vessel's own bunkering enquiries, read-only.
 *
 *   GET /api/portal/bunkering → { enquiries: VesselEnquiry[] }
 *
 * Served with the service role (portal users have no grant on the bunker_* tables) but hard-filtered to the vessel resolved
 * from the caller's JWT, and ONLY enquiries linked to that yacht. What the vessel may see is decided by shapeForVessel
 * (src/lib/portal/bunkering.ts): shared quotations only, no internal notes or comments, prices only for positions that see finance.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht, portalModulesFor } from '@/lib/portal/portal-auth.server'
import { sectionEnabled } from '@/lib/portal/portal-modules'
import { hiddenSections, canSeeFinance } from '@/lib/portal/portal-positions'
import { resolveSignedUrlAdmin } from '@/lib/signed-url.server'
import { shapeForVessel, type RawEnquiry, type RawQuote, type RawEvent, type RawFile } from '@/lib/portal/bunkering'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

const ENQUIRY_COLUMNS = 'id, number, status, yacht_name, port, berth, preferred_date, preferred_time, fuel_type, fuel_other, quantity, quantity_unit, spec_notes, delivery_method, special_requirements, declared_by_role, declared_by_name, declared_at, declaration_method, approved_quote_id, approved_by_role, approved_by_name, approved_at, approval_method, delivered_date, delivered_quantity, delivered_unit, bdn_number, created_at'

export async function portalBunkeringHandler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)

  const modules = await portalModulesFor(yacht.yachtId)
  if (!sectionEnabled('bunkering', modules)) return json({ error: "Bunkering isn't switched on for your vessel." }, 403)
  if (hiddenSections(yacht.position).has('bunkering')) return json({ error: "Your position doesn't include bunkering." }, 403)

  try {
    const sb = admin()
    const { data: rows, error } = await sb.from('bunker_enquiries').select(ENQUIRY_COLUMNS)
      .eq('yacht_id', yacht.yachtId).order('created_at', { ascending: false }).limit(100)
    if (error) throw error
    const enquiries = (rows ?? []) as RawEnquiry[]
    if (enquiries.length === 0) return json({ enquiries: [], readOnly: true })

    const ids = enquiries.map((e) => e.id)
    const [{ data: quotes }, { data: events }, { data: files }] = await Promise.all([
      sb.from('bunker_quotes').select('id, enquiry_id, supplier, quote_ref, fuel_type, quantity, quantity_unit, unit_price, price_unit, currency, total, valid_until, delivery_terms, status, shared_with_vessel')
        .in('enquiry_id', ids).eq('shared_with_vessel', true),
      sb.from('bunker_enquiry_events').select('enquiry_id, kind, actor_name, to_status, created_at').in('enquiry_id', ids).in('kind', ['created', 'status', 'approved', 'delivered']).order('created_at'),
      sb.from('bunker_enquiry_files').select('enquiry_id, name, doc_type, url').in('enquiry_id', ids).eq('doc_type', 'Bunker delivery note'),
    ])

    const finance = canSeeFinance(yacht.position)
    const out = []
    for (const e of enquiries) {
      const docs: Array<RawFile & { url: string }> = []
      for (const f of ((files ?? []) as Array<RawFile & { enquiry_id: string }>).filter((x) => x.enquiry_id === e.id)) {
        docs.push({ name: f.name, doc_type: f.doc_type, url: await resolveSignedUrlAdmin(f.url) })
      }
      out.push(shapeForVessel(
        e,
        ((quotes ?? []) as Array<RawQuote & { enquiry_id: string }>).filter((q) => q.enquiry_id === e.id),
        ((events ?? []) as Array<RawEvent & { enquiry_id: string }>).filter((x) => x.enquiry_id === e.id),
        docs, { canSeeFinance: finance },
      ))
    }
    return json({ enquiries: out, readOnly: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not load bunkering' }, 500)
  }
}
