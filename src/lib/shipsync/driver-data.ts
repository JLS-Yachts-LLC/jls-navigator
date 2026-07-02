/**
 * Driver-side data: resolve the logged-in driver, load their runs, and apply
 * actions that work online OR queue offline (flushed on reconnect).
 */
import { supabase } from '@/integrations/supabase/client'
import { isOnline, queueAdd, blobPut, kvSet, kvGet } from './offline'
import type { ShipSyncDriver, ShipSyncDeliveryNote, ShipSyncPackage, ShipSyncDestination, PackageStatus } from './model'

const db = () => supabase as any

export interface DriverRuns {
  notes: ShipSyncDeliveryNote[]
  packages: ShipSyncPackage[]
  destinations: ShipSyncDestination[]
}

/** Match the signed-in user to a driver record (by user_id, then email). */
export async function resolveDriver(userId: string | null, email: string | null): Promise<ShipSyncDriver | null> {
  if (userId) {
    const { data } = await db().from('shipsync_drivers').select('*').eq('user_id', userId).maybeSingle()
    if (data) return data as ShipSyncDriver
  }
  if (email) {
    const { data } = await db().from('shipsync_drivers').select('*').ilike('email', email).maybeSingle()
    if (data) return data as ShipSyncDriver
  }
  return null
}

/** All active drivers (for the manual picker when we can't match). */
export async function listActiveDrivers(): Promise<ShipSyncDriver[]> {
  const { data } = await db().from('shipsync_drivers').select('*').eq('active', true).order('name')
  return (data ?? []) as ShipSyncDriver[]
}

/** Load a driver's open runs (delivery notes + their packages + berths), caching for offline. */
export async function loadDriverRuns(driverId: string): Promise<DriverRuns> {
  if (isOnline()) {
    const [{ data: notes }, { data: packages }] = await Promise.all([
      db().from('shipsync_delivery_notes').select('*').eq('driver_id', driverId).in('status', ['open', 'dispatched']).order('created_at'),
      db().from('shipsync_packages').select('*').eq('driver_id', driverId).in('status', ['assigned', 'out_for_delivery']).order('boat_name'),
    ])
    // Berths for the boats on this run (a multi-boat note has no single destination_address).
    const boatNames = Array.from(new Set(((packages ?? []) as ShipSyncPackage[]).map((p) => p.boat_name).filter(Boolean) as string[]))
    let destinations: ShipSyncDestination[] = []
    if (boatNames.length) {
      const { data: dests } = await db().from('shipsync_destinations').select('*').in('boat_name', boatNames)
      destinations = (dests ?? []) as ShipSyncDestination[]
    }
    const runs: DriverRuns = {
      notes: (notes ?? []) as ShipSyncDeliveryNote[],
      packages: (packages ?? []) as ShipSyncPackage[],
      destinations,
    }
    await kvSet(`runs:${driverId}`, runs).catch(() => {})
    return runs
  }
  return (await kvGet<DriverRuns>(`runs:${driverId}`)) ?? { notes: [], packages: [], destinations: [] }
}

// ── Actions (online → live, offline → queued) ────────────────────────────────
type PatchTable = 'shipsync_packages' | 'shipsync_delivery_notes'
async function patch(table: PatchTable, id: string, p: Record<string, unknown>) {
  if (isOnline()) {
    const { error } = await db().from(table).update(p).eq('id', id)
    if (error) throw error
  } else {
    await queueAdd({ kind: 'patch', table, id, patch: p })
  }
}

/** Scan a package onto the van. */
export async function scanOntoVan(pkg: ShipSyncPackage): Promise<void> {
  await patch('shipsync_packages', pkg.id, {
    driver_scanned: true, driver_scan_out_time: new Date().toISOString(), status: 'out_for_delivery' as PackageStatus,
  })
}

/** Upload an image field online, or stage it + queue when offline. */
async function uploadField(pkgId: string, field: string, blob: Blob, label: string): Promise<void> {
  const path = `packages/${pkgId}/${label}_${Date.now()}.png`
  if (isOnline()) {
    const up = await supabase.storage.from('shipsync').upload(path, blob, { upsert: true })
    if (up.error) throw up.error
    const url = supabase.storage.from('shipsync').getPublicUrl(path).data.publicUrl
    await patch('shipsync_packages', pkgId, { [field]: url })
  } else {
    const blobKey = `${pkgId}:${field}:${Date.now()}`
    await blobPut(blobKey, blob)
    await queueAdd({ kind: 'uploadAndPatch', blobKey, path, table: 'shipsync_packages', id: pkgId, field })
  }
}

export interface DeliveryProof {
  status: Extract<PackageStatus, 'delivered' | 'collected' | 'refused'>
  receiverName?: string
  receiverDesignation?: string
  receiverEmail?: string
  photo?: Blob | null
  signature?: Blob | null
}

/** Mark one package delivered/collected/refused with proof. */
export async function deliverPackage(pkg: ShipSyncPackage, proof: DeliveryProof): Promise<void> {
  await patch('shipsync_packages', pkg.id, {
    status: proof.status,
    delivered_at: new Date().toISOString(),
    receiver_full_name: proof.receiverName ?? null,
    receiver_designation: proof.receiverDesignation ?? null,
    receiver_email: proof.receiverEmail ?? null,
  })
  if (proof.photo) await uploadField(pkg.id, 'delivery_photo_url', proof.photo, 'delivery')
  if (proof.signature) await uploadField(pkg.id, 'signature_url', proof.signature, 'signature')
}

/** Upload a blob once and return its public URL (online only). */
async function uploadShared(path: string, blob: Blob): Promise<string> {
  const up = await supabase.storage.from('shipsync').upload(path, blob, { upsert: true })
  if (up.error) throw up.error
  return supabase.storage.from('shipsync').getPublicUrl(path).data.publicUrl
}

/** Deliver a whole boat's parcels with ONE customer signature (the delivery note is
 *  signed once). Online: uploads photo/signature once and stamps every parcel with the
 *  shared proof. Offline: falls back to per-parcel queueing so nothing is lost. */
export async function deliverBoat(packages: ShipSyncPackage[], proof: DeliveryProof): Promise<void> {
  if (packages.length === 0) return
  if (!isOnline()) {
    for (const p of packages) await deliverPackage(p, proof)
    return
  }
  const stamp = Date.now()
  const base = `deliveries/${packages[0].id}`
  const photoUrl = proof.photo ? await uploadShared(`${base}/photo_${stamp}.png`, proof.photo) : null
  const sigUrl = proof.signature ? await uploadShared(`${base}/signature_${stamp}.png`, proof.signature) : null
  const deliveredAt = new Date().toISOString()
  for (const p of packages) {
    await patch('shipsync_packages', p.id, {
      status: proof.status,
      delivered_at: deliveredAt,
      receiver_full_name: proof.receiverName ?? null,
      receiver_designation: proof.receiverDesignation ?? null,
      receiver_email: proof.receiverEmail ?? null,
      ...(photoUrl ? { delivery_photo_url: photoUrl } : {}),
      ...(sigUrl ? { signature_url: sigUrl } : {}),
    })
  }
}
