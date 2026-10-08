/**
 * A vessel's account in Waypoint Trading LLC's QuickBooks (chandlery,
 * provisioning…), alongside its JLS customer (yachts.qbo_customer_id).
 *
 *   GET  /api/qb/vessel-accounts            → { ok, company, customers: [{ id, displayName, balance }] }
 *   POST /api/qb/vessel-accounts { yachtId, customerId | null, customerName? }
 *        → link (or, with null, unlink) the vessel's Waypoint customer
 *
 * Staff only. The link lives in yacht_qbo_accounts, which only the server
 * writes. Linking also files that customer's already-synced Waypoint documents
 * on the vessel, so its Finance tab and the Client Portal show them at once.
 */
import { createClient } from '@supabase/supabase-js'
import { requireAccess } from '@/lib/auth/requireAccess.server'
import { qboConfigured, qboQuery } from '@/lib/qb/qbo.server'
import { WAYPOINT_QBO_REALM, WAYPOINT_COMPANY } from '@/lib/qb/realms'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function qbVesselAccountsHandler(request: Request): Promise<Response> {
  // Signed-in staff — never a portal login (they'd see every Waypoint customer).
  const access = await requireAccess(request)
  if (!access.ok) return access.response
  const db = admin() as any
  const uid = access.claims.userId
  const [{ data: profile }, { data: captain }] = await Promise.all([
    db.from('user_profiles').select('user_id').eq('user_id', uid).maybeSingle(),
    db.from('captain_accounts').select('user_id').eq('user_id', uid).eq('active', true).limit(1).maybeSingle(),
  ])
  if (!profile || captain) return json({ ok: false, error: 'Forbidden' }, 403)
  if (!qboConfigured()) return json({ ok: false, error: 'QuickBooks is not connected.' }, 503)

  if (request.method === 'GET') {
    try {
      const customers: Array<{ id: string; displayName: string; balance: number }> = []
      const PAGE = 1000
      for (let start = 1; start <= 10000; start += PAGE) {
        const res = await qboQuery(
          `select Id, DisplayName, Balance from Customer where Active = true startposition ${start} maxresults ${PAGE}`,
          WAYPOINT_QBO_REALM,
        )
        const rows = res?.QueryResponse?.Customer ?? []
        for (const c of rows) customers.push({ id: String(c.Id), displayName: String(c.DisplayName ?? ''), balance: Number(c.Balance ?? 0) })
        if (rows.length < PAGE) break
      }
      customers.sort((a, b) => a.displayName.localeCompare(b.displayName))
      return json({ ok: true, company: WAYPOINT_COMPANY, customers })
    } catch (e: any) {
      return json({ ok: false, error: String(e?.message ?? e) }, 502)
    }
  }

  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)
  let body: any
  try { body = await request.json() } catch { return json({ ok: false, error: 'Bad JSON' }, 400) }
  const yachtId = String(body?.yachtId ?? '')
  const customerId = body?.customerId == null ? null : String(body.customerId).trim()
  if (!/^[0-9a-f-]{36}$/i.test(yachtId)) return json({ ok: false, error: 'yachtId required' }, 400)
  if (customerId !== null && !/^\d{1,12}$/.test(customerId)) return json({ ok: false, error: 'Bad customer id' }, 400)

  const { data: prev } = await db.from('yacht_qbo_accounts').select('customer_id')
    .eq('yacht_id', yachtId).eq('realm_id', WAYPOINT_QBO_REALM).maybeSingle()

  if (customerId === null) {
    await db.from('yacht_qbo_accounts').delete().eq('yacht_id', yachtId).eq('realm_id', WAYPOINT_QBO_REALM)
  } else {
    // One vessel per Waypoint customer: re-pointing a customer moves it.
    const { data: taken } = await db.from('yacht_qbo_accounts').select('yacht_id, yachts(vessel_name)')
      .eq('realm_id', WAYPOINT_QBO_REALM).eq('customer_id', customerId).neq('yacht_id', yachtId).maybeSingle()
    if (taken) return json({ ok: false, error: `That Waypoint customer is already linked to ${taken.yachts?.vessel_name ?? 'another vessel'}.` }, 409)
    // The name from QuickBooks itself, not the request.
    const res = await qboQuery(`select Id, DisplayName from Customer where Id = '${customerId}'`, WAYPOINT_QBO_REALM).catch(() => null)
    const cust = res?.QueryResponse?.Customer?.[0]
    if (!cust) return json({ ok: false, error: 'No such customer in Waypoint\'s QuickBooks.' }, 404)
    const { error } = await db.from('yacht_qbo_accounts').upsert({
      yacht_id: yachtId, realm_id: WAYPOINT_QBO_REALM, customer_id: customerId,
      company_label: WAYPOINT_COMPANY, customer_name: cust.DisplayName ?? null, created_by: uid,
    }, { onConflict: 'yacht_id,realm_id' })
    if (error) return json({ ok: false, error: error.message }, 500)
  }

  // Re-file the synced Waypoint documents: off the old customer, onto the new.
  for (const table of ['qbo_invoices', 'qbo_payments']) {
    if (prev?.customer_id && prev.customer_id !== customerId) {
      await db.from(table).update({ yacht_id: null })
        .eq('realm_id', WAYPOINT_QBO_REALM).eq('customer_ref', prev.customer_id).eq('yacht_id', yachtId)
    }
    if (customerId) {
      await db.from(table).update({ yacht_id: yachtId }).eq('realm_id', WAYPOINT_QBO_REALM).eq('customer_ref', customerId)
    }
  }
  return json({ ok: true })
}
