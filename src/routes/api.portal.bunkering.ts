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
import { bunkeringActorRoles, canSeeBunkeringPrices, declarationUploadProblem, declarationContentType } from '@/lib/portal/bunkering-actions'
import { sendBunkeringNotification } from '@/lib/bunkering/email.server'
import { resolveSignedUrlAdmin } from '@/lib/signed-url.server'
import { shapeForVessel, type RawEnquiry, type RawQuote, type RawEvent, type RawFile } from '@/lib/portal/bunkering'
import { buildMasterDeclaration } from '@/lib/bunkering/master-declaration.server'
import { declarationPrefill, declarationReceived } from '@/lib/bunkering/master-declaration'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

const ENQUIRY_COLUMNS = 'id, number, status, yacht_name, port, berth, preferred_date, preferred_time, sails_out_of_uae, departure_date, fuel_type, fuel_other, quantity, quantity_unit, spec_notes, delivery_method, special_requirements, declared_by_role, declared_by_name, declared_at, declaration_method, approved_quote_id, approved_by_role, approved_by_name, approved_at, approval_method, delivered_date, delivered_quantity, delivered_unit, bdn_number, created_at'

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
    const roles = bunkeringActorRoles(yacht.position)
    // What this login may DO is told to the screen; the server checks it again on every action. An admin preview can only look.
    const canAct = !yacht.preview && roles.length > 0
    if (enquiries.length === 0) return json({ enquiries: [], readOnly: !canAct, canAct, roles })

    const ids = enquiries.map((e) => e.id)
    const [{ data: quotes }, { data: events }, { data: files }] = await Promise.all([
      sb.from('bunker_quotes').select('id, enquiry_id, supplier, quote_ref, fuel_type, quantity, quantity_unit, unit_price, price_unit, currency, total, valid_until, delivery_terms, status, shared_with_vessel')
        .in('enquiry_id', ids).eq('shared_with_vessel', true),
      sb.from('bunker_enquiry_events').select('enquiry_id, kind, actor_name, to_status, created_at').in('enquiry_id', ids).in('kind', ['created', 'status', 'approved', 'delivered']).order('created_at'),
      sb.from('bunker_enquiry_files').select('enquiry_id, name, doc_type, url').in('enquiry_id', ids).in('doc_type', ['Bunker delivery note', 'Master declaration']),
    ])

    const finance = canSeeBunkeringPrices(yacht.position, canSeeFinance(yacht.position))
    const out = []
    for (const e of enquiries) {
      const docs: Array<RawFile & { url: string }> = []
      const mine = ((files ?? []) as Array<RawFile & { enquiry_id: string }>).filter((x) => x.enquiry_id === e.id)
      // Only the bunker delivery note is handed over; the signed declaration is only noted as received (its file stays internal).
      for (const f of mine.filter((x) => x.doc_type === 'Bunker delivery note')) {
        docs.push({ name: f.name, doc_type: f.doc_type, url: await resolveSignedUrlAdmin(f.url) })
      }
      out.push(shapeForVessel(
        e,
        ((quotes ?? []) as Array<RawQuote & { enquiry_id: string }>).filter((q) => q.enquiry_id === e.id),
        ((events ?? []) as Array<RawEvent & { enquiry_id: string }>).filter((x) => x.enquiry_id === e.id),
        docs, { canSeeFinance: finance, declarationReceived: declarationReceived(mine) },
      ))
    }
    return json({ enquiries: out, readOnly: !canAct, canAct, roles })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not load bunkering' }, 500)
  }
}

/**
 * GET /api/portal/bunkering/master-declaration[?id=…] — the Master's VAT declaration as a PDF for the vessel to complete, sign and
 * stamp: pre-filled from ITS OWN enquiry (an id that belongs to another vessel is refused), or blank without an id.
 */
export async function portalBunkeringDeclarationHandler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)
  const modules = await portalModulesFor(yacht.yachtId)
  if (!sectionEnabled('bunkering', modules)) return json({ error: "Bunkering isn't switched on for your vessel." }, 403)
  if (hiddenSections(yacht.position).has('bunkering')) return json({ error: "Your position doesn't include bunkering." }, 403)

  const id = new URL(request.url).searchParams.get('id')
  let enquiry = null
  if (id) {
    const { data } = await admin().from('bunker_enquiries').select('yacht_name, imo_no, preferred_date, delivered_date, port, berth, captain_name, departure_date')
      .eq('id', id).eq('yacht_id', yacht.yachtId).maybeSingle()
    if (!data) return json({ error: 'Enquiry not found' }, 404)
    enquiry = data
  }
  const bytes = await buildMasterDeclaration(declarationPrefill(enquiry))
  return new Response(bytes as unknown as BodyInit, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Master-Declaration-VAT.pdf"', 'Cache-Control': 'no-store' } })
}

// ── acting for the vessel ────────────────────────────────────────────────────────────────────────────────────────────────

/** Everything an action needs to be allowed — or the Response that says why not. */
async function actingVessel(request: Request) {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return { ok: false as const, response: auth.response }
  const { yacht } = auth
  if (!yacht.mfaVerified) return { ok: false as const, response: json({ error: 'Two-factor verification required' }, 403) }
  if (yacht.preview) return { ok: false as const, response: json({ error: 'Read-only preview — sign in as the client to make changes.' }, 403) }
  const modules = await portalModulesFor(yacht.yachtId)
  if (!sectionEnabled('bunkering', modules)) return { ok: false as const, response: json({ error: "Bunkering isn't switched on for your vessel." }, 403) }
  if (hiddenSections(yacht.position).has('bunkering')) return { ok: false as const, response: json({ error: "Your position doesn't include bunkering." }, 403) }
  const roles = bunkeringActorRoles(yacht.position)
  if (roles.length === 0) return { ok: false as const, response: json({ error: 'Only the Captain or the Chief Engineer can confirm or approve bunkering.' }, 403) }
  // The name recorded is the login's own, never one typed into the request.
  const { data } = await admin().from('captain_accounts').select('display_name').eq('user_id', yacht.userId).eq('yacht_id', yacht.yachtId).eq('active', true).maybeSingle()
  const name = ((data as any)?.display_name as string | undefined)?.trim() || yacht.email
  if (!name) return { ok: false as const, response: json({ error: 'Your account has no name to record this under.' }, 400) }
  return { ok: true as const, yacht, roles, name }
}

const sendToTeam = (enquiryId: string, event: 'approved' | 'comment', note: string | undefined, who: { email: string; name: string }) =>
  sendBunkeringNotification(enquiryId, event, note, { email: who.email, name: `${who.name} (client)` }).catch(() => null)

/** POST /api/portal/bunkering/action { action: 'confirm' | 'approve', enquiryId, quoteId?, role } */
export async function portalBunkeringActionHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const a = await actingVessel(request)
  if (!a.ok) return a.response
  const body = await request.json().catch(() => null) as { action?: string; enquiryId?: string; quoteId?: string; role?: string } | null
  const enquiryId = body?.enquiryId ?? ''
  const role = body?.role ?? ''
  if (!enquiryId || !body?.action) return json({ error: 'enquiryId and action are required' }, 400)
  if (!(a.roles as string[]).includes(role)) return json({ error: `You can act as ${a.roles.join(' or ')}.` }, 403)

  const sb = admin()
  try {
    if (body.action === 'confirm') {
      const { error } = await sb.rpc('portal_bunker_confirm', { p_yacht: a.yacht.yachtId, p_enquiry: enquiryId, p_user: a.yacht.userId, p_role: role, p_name: a.name })
      if (error) return json({ error: error.message }, 400)
      await sendToTeam(enquiryId, 'comment', `Requirements confirmed by ${a.name} (${role}) in the Client Portal.`, { email: a.yacht.email, name: a.name })
      return json({ ok: true })
    }
    if (body.action === 'approve') {
      if (!body.quoteId) return json({ error: 'quoteId is required' }, 400)
      const { error } = await sb.rpc('portal_bunker_approve', { p_yacht: a.yacht.yachtId, p_enquiry: enquiryId, p_quote: body.quoteId, p_user: a.yacht.userId, p_role: role, p_name: a.name })
      if (error) return json({ error: error.message }, 400)
      await sendToTeam(enquiryId, 'approved', undefined, { email: a.yacht.email, name: a.name })
      return json({ ok: true })
    }
    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not record that' }, 500)
  }
}

/** POST /api/portal/bunkering/declaration-upload (multipart: enquiryId, file) — the signed Master's declaration, filed on the enquiry. */
export async function portalBunkeringDeclarationUploadHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const a = await actingVessel(request)
  if (!a.ok) return a.response
  const form = await request.formData().catch(() => null)
  const enquiryId = String(form?.get('enquiryId') ?? '')
  const file = form?.get('file')
  if (!enquiryId || !file || typeof file === 'string') return json({ error: 'Choose the signed declaration to upload.' }, 400)
  const f = file as File
  const problem = declarationUploadProblem({ name: f.name, type: f.type, size: f.size })
  if (problem) return json({ error: problem }, 400)

  const sb = admin()
  const { data: enq } = await sb.from('bunker_enquiries').select('id, status').eq('id', enquiryId).eq('yacht_id', a.yacht.yachtId).maybeSingle()
  if (!enq) return json({ error: 'Enquiry not found' }, 404)
  if ((enq as any).status === 'cancelled') return json({ error: 'This enquiry was cancelled.' }, 400)

  const contentType = declarationContentType(f.name, f.type)!
  const safe = f.name.replace(/[^\w.-]+/g, '_')
  const path = `warehouse/bunkering/${enquiryId}/master-declaration-${Date.now()}-${safe}`
  const up = await sb.storage.from('shipsync').upload(path, await f.arrayBuffer(), { contentType, upsert: false })
  if (up.error) return json({ error: 'Could not save the file — please try again.' }, 500)
  const row = { enquiry_id: enquiryId, kind: contentType === 'application/pdf' ? 'document' : 'photo', doc_type: 'Master declaration', name: f.name, url: `shipsync/${path}`, uploaded_by: a.yacht.userId }
  const { error: fileErr } = await sb.from('bunker_enquiry_files').insert(row)
  if (fileErr) { await sb.storage.from('shipsync').remove([path]); return json({ error: 'Could not record the file — please try again.' }, 500) }
  await sb.from('bunker_enquiry_events').insert({ enquiry_id: enquiryId, kind: 'file', actor_id: a.yacht.userId, actor_name: `${a.name} (client portal)`, body: `Signed Master's declaration uploaded: ${f.name}` })
  await sendToTeam(enquiryId, 'comment', `The signed Master's declaration was uploaded by ${a.name} in the Client Portal (${f.name}).`, { email: a.yacht.email, name: a.name })
  return json({ ok: true })
}
