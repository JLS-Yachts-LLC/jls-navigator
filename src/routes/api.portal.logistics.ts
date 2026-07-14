/**
 * Client-portal Logistics — ShipSync packages & deliveries scoped to the caller's vessel,
 * plus the live location of any driver currently out on one of their deliveries.
 *
 *   GET /api/portal/logistics → { vessel, packages: {active[], done[]}, deliveries[] }
 *
 * Served with the service role (portal users have no direct RLS grant on the shipsync_*
 * tables) but hard-filtered to the vessel resolved from the caller's JWT.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht } from '@/lib/portal/portal-auth.server'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

const DONE = ['delivered', 'collected', 'refused']

export async function portalLogisticsHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth

  try {
    const sb = admin()
    const nameUpper = yacht.vesselName.toUpperCase()

    // Packages for this vessel — matched by yacht_id (preferred) or boat_name.
    const { data: pkgRows } = await sb
      .from('shipsync_packages')
      .select('id, barcode, boat_name, package_owner, courier, num_packages, status, description, received_at, planned_delivery_date, delivered_at, warehouse_zone')
      .or(`yacht_id.eq.${yacht.yachtId},boat_name.eq.${nameUpper}`)
      .order('received_at', { ascending: false })
      .limit(500)

    const packages = (pkgRows ?? []).map((p: any) => ({
      id: p.id,
      barcode: p.barcode,
      courier: p.courier,
      count: p.num_packages ?? 1,
      description: p.description,
      status: p.status,
      zone: p.warehouse_zone,
      receivedAt: p.received_at,
      plannedDate: p.planned_delivery_date,
      deliveredAt: p.delivered_at,
    }))
    const active = packages.filter((p) => !DONE.includes(p.status))
    const done = packages.filter((p) => DONE.includes(p.status))

    // Delivery notes for this vessel, with driver + vehicle live position for open/dispatched ones.
    const { data: noteRows } = await sb
      .from('shipsync_delivery_notes')
      .select('id, number, boat_name, status, driver_id, vehicle_id, destination_address, delivered_at, created_at, delivery_pdf_url')
      .or(`yacht_id.eq.${yacht.yachtId},boat_name.eq.${nameUpper}`)
      .order('created_at', { ascending: false })
      .limit(100)

    const notes = noteRows ?? []
    const driverIds = [...new Set(notes.map((n: any) => n.driver_id).filter(Boolean))]
    const vehicleIds = [...new Set(notes.map((n: any) => n.vehicle_id).filter(Boolean))]

    const [{ data: drivers }, { data: vehicles }] = await Promise.all([
      driverIds.length
        ? sb.from('shipsync_drivers').select('id, name, phone').in('id', driverIds)
        : Promise.resolve({ data: [] as any[] }),
      vehicleIds.length
        ? sb.from('crew_vehicles').select('id, make, model, registration, last_lat, last_lon, last_location_at').in('id', vehicleIds)
        : Promise.resolve({ data: [] as any[] }),
    ])
    const driverById = new Map((drivers ?? []).map((d: any) => [d.id, d]))
    const vehicleById = new Map((vehicles ?? []).map((v: any) => [v.id, v]))

    const deliveries = notes.map((n: any) => {
      const d = n.driver_id ? driverById.get(n.driver_id) : null
      const v = n.vehicle_id ? vehicleById.get(n.vehicle_id) : null
      const live = n.status !== 'delivered' && n.status !== 'cancelled' && v?.last_lat != null && v?.last_lon != null
      return {
        id: n.id,
        number: n.number,
        status: n.status,
        destination: n.destination_address,
        createdAt: n.created_at,
        deliveredAt: n.delivered_at,
        podUrl: n.delivery_pdf_url,
        driver: d ? { name: d.name, phone: d.phone } : null,
        vehicle: v ? { label: (v.registration || [v.make, v.model].filter(Boolean).join(' ') || 'Van').trim() } : null,
        location: live
          ? { lat: Number(v.last_lat), lng: Number(v.last_lon), updatedAt: v.last_location_at }
          : null,
      }
    })

    return json({
      vessel: yacht.vesselName,
      packages: { active, done },
      deliveries,
    })
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500)
  }
}
