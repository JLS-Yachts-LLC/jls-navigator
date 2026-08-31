/**
 * ShipSync data access — CRUD + helpers over the shipsync_* tables, shared by
 * the office module and (read paths) the driver PWA.
 */
import { supabase } from '@/integrations/supabase/client'
import {
  nextDeliveryNumber,
  type ShipSyncPackage, type ShipSyncDriver, type ShipSyncDeliveryNote, type ShipSyncDestination,
  type ShipSyncDeliverySchedule, type ShipSyncVehicle, type PackageStatus,
} from './model'

const db = () => supabase as any

// ── Reads ────────────────────────────────────────────────────────────────────
// Local Packages is only rows explicitly tagged 'Local', plus untagged legacy
// rows (local_import was added after some packages already existed) — every
// other trade type has its own tab. This used to be the inverse (show
// anything that ISN'T Import/Export), which let any other value — a stray
// 'Transit' tag some rows carry from before the current check-in flow existed
// — silently fall through into Local Packages instead of Import.
export async function loadPackages(): Promise<ShipSyncPackage[]> {
  // Paginated explicitly — PostgREST caps a single query at 1000 rows by
  // default, and this table is at/beyond that size, so the page was silently
  // never showing more than the first 1000 Local packages no matter how many
  // actually existed.
  const all: ShipSyncPackage[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db().from('shipsync_packages').select('*')
      .or('local_import.is.null,local_import.eq.Local')
      .order('received_at', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as ShipSyncPackage[]))
    if (data.length < 1000) break
  }
  return all
}
/** Packages of a given trade type (local_import), newest first. Used by the
 *  Export tab (Import has its own loader — see loadImportPackages — since it
 *  also needs to catch 'Transit'-tagged rows). */
export async function loadPackagesByType(type: string): Promise<ShipSyncPackage[]> {
  const { data, error } = await db().from('shipsync_packages').select('*')
    .eq('local_import', type)
    .order('received_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ShipSyncPackage[]
}
/** Import-tab packages — both 'Import' and 'Transit' (a handful of legacy
 *  rows, from before the current check-in flow existed, are tagged 'Transit'
 *  directly rather than sitting in the Import board's own Monday-synced
 *  TRANSIT group; this is the only place that reads that value, so both
 *  belong on the Import tab either way). */
export async function loadImportPackages(): Promise<ShipSyncPackage[]> {
  const { data, error } = await db().from('shipsync_packages').select('*')
    .in('local_import', ['Import', 'Transit'])
    .order('received_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ShipSyncPackage[]
}
/** Export-tab packages. */
export const loadExportPackages = () => loadPackagesByType('Export')
/** EDAS-tab packages. */
export const loadEdasPackages = () => loadPackagesByType('EDAS')
export async function loadDrivers(): Promise<ShipSyncDriver[]> {
  const { data } = await db().from('shipsync_drivers').select('*').order('name')
  return (data ?? []) as ShipSyncDriver[]
}
export async function loadNotes(): Promise<ShipSyncDeliveryNote[]> {
  const { data } = await db().from('shipsync_delivery_notes').select('*').order('created_at', { ascending: false })
  return (data ?? []) as ShipSyncDeliveryNote[]
}
export async function loadDestinations(): Promise<ShipSyncDestination[]> {
  const { data } = await db().from('shipsync_destinations').select('*').order('boat_name')
  return (data ?? []) as ShipSyncDestination[]
}

/** All active vessel names — so every yacht is selectable at check-in, even ones
 *  that have never had a package or a saved destination (we also do pickups). */
export async function loadYachtNames(): Promise<string[]> {
  const { data } = await db().from('yachts').select('vessel_name').eq('archive', false).order('vessel_name')
  return (data ?? []).map((y: any) => y.vessel_name).filter(Boolean) as string[]
}

// ── Packages ─────────────────────────────────────────────────────────────────
export async function createPackage(p: Partial<ShipSyncPackage>): Promise<ShipSyncPackage> {
  const { data: auth } = await supabase.auth.getUser()
  const { data, error } = await db().from('shipsync_packages')
    .insert([{ ...p, created_by: auth?.user?.id ?? null }]).select('*').single()
  if (error) throw error
  return data as ShipSyncPackage
}
export async function patchPackage(id: string, patch: Partial<ShipSyncPackage>): Promise<void> {
  const { error } = await db().from('shipsync_packages').update(patch).eq('id', id)
  if (error) throw error
}
export async function deletePackage(id: string): Promise<void> {
  const { error } = await db().from('shipsync_packages').delete().eq('id', id)
  if (error) throw error
}

// ── Drivers ──────────────────────────────────────────────────────────────────
export async function saveDriver(d: Partial<ShipSyncDriver> & { id?: string }): Promise<void> {
  if (d.id) {
    const { error } = await db().from('shipsync_drivers').update(d).eq('id', d.id)
    if (error) throw error
  } else {
    const { error } = await db().from('shipsync_drivers').insert([d])
    if (error) throw error
  }
}
export async function deleteDriver(id: string): Promise<void> {
  const { error } = await db().from('shipsync_drivers').delete().eq('id', id)
  if (error) throw error
}

// ── Destinations ─────────────────────────────────────────────────────────────
export async function saveDestination(d: Partial<ShipSyncDestination> & { boat_name: string }): Promise<void> {
  const { error } = await db().from('shipsync_destinations').upsert([d], { onConflict: 'boat_name' })
  if (error) throw error
}
export async function deleteDestination(id: string): Promise<void> {
  const { error } = await db().from('shipsync_destinations').delete().eq('id', id)
  if (error) throw error
}

// ── Delivery schedule (weekly calendar) ──────────────────────────────────────
export async function loadDeliverySchedules(): Promise<ShipSyncDeliverySchedule[]> {
  const { data } = await db().from('shipsync_delivery_schedule').select('*').order('boat_name')
  return (data ?? []) as ShipSyncDeliverySchedule[]
}
export async function addScheduleEntry(boat_name: string, weekday: number): Promise<void> {
  const { error } = await db().from('shipsync_delivery_schedule')
    .upsert([{ boat_name, weekday }], { onConflict: 'boat_name,weekday' })
  if (error) throw error
}
export async function removeScheduleEntry(id: string): Promise<void> {
  const { error } = await db().from('shipsync_delivery_schedule').delete().eq('id', id)
  if (error) throw error
}

// ── Vehicles (vans) ──────────────────────────────────────────────────────────
export async function loadVehicles(): Promise<ShipSyncVehicle[]> {
  const { data } = await db().from('crew_vehicles').select('id, make, model, registration, status').order('registration')
  return (data ?? []) as ShipSyncVehicle[]
}

// ── Delivery notes & dispatch ────────────────────────────────────────────────
/** Create a delivery note for a boat (auto-numbered), defaulting its destination
 *  from the boat's saved berth. */
export async function createDeliveryNote(boat_name: string, driver_id?: string | null, vehicle_id?: string | null): Promise<ShipSyncDeliveryNote> {
  const number = await nextDeliveryNumber()
  const { data: auth } = await supabase.auth.getUser()
  let dest: Partial<ShipSyncDeliveryNote> = {}
  if (boat_name) {
    const { data: d } = await db().from('shipsync_destinations').select('address, lat, lng').ilike('boat_name', boat_name).maybeSingle()
    if (d) dest = { destination_address: d.address, destination_lat: d.lat, destination_lng: d.lng }
  }
  const { data, error } = await db().from('shipsync_delivery_notes')
    .insert([{ number, boat_name: boat_name || null, driver_id: driver_id ?? null, vehicle_id: vehicle_id ?? null, status: 'open',
               created_by: auth?.user?.id ?? null, ...dest }])
    .select('*').single()
  if (error) throw error
  return data as ShipSyncDeliveryNote
}

/** Assign packages onto a note + driver, flipping them to "assigned". Refuses
 *  to grab a package that's already on a DIFFERENT note instead of silently
 *  overwriting it — without this, two routes built around the same overlooked
 *  boat (or a retried dispatch after a partial failure) could both claim the
 *  same parcels, with whichever dispatch runs last winning with no warning. */
export async function assignPackagesToNote(packageIds: string[], note: ShipSyncDeliveryNote, driverId: string | null): Promise<void> {
  if (packageIds.length === 0) return
  const { data: existing } = await db().from('shipsync_packages').select('id, delivery_note_id').in('id', packageIds)
  const alreadyOnAnotherNote = (existing ?? []).filter((p: any) => p.delivery_note_id && p.delivery_note_id !== note.id)
  if (alreadyOnAnotherNote.length > 0) {
    throw new Error(`${alreadyOnAnotherNote.length} of these parcel(s) are already on another delivery note — refresh and try again.`)
  }
  const { error } = await db().from('shipsync_packages').update({
    delivery_note_id: note.id, driver_id: driverId,
    status: 'assigned' as PackageStatus, scan_out_time: new Date().toISOString(),
  }).in('id', packageIds)
  if (error) throw error
}

/** Route several boats' parcels into ONE delivery note, assign a driver, and mark
 *  the note dispatched. Parcels become 'assigned' (driver app then scans them onto
 *  the van). Pass the boat name for a single-boat route (keeps the saved berth),
 *  or null for a multi-boat route. */
export async function dispatchRoute(
  packageIds: string[], driverId: string, boatLabel: string | null, plannedDate?: string | null, vehicleId?: string | null,
): Promise<ShipSyncDeliveryNote> {
  const note = await createDeliveryNote(boatLabel ?? '', driverId, vehicleId)
  await assignPackagesToNote(packageIds, note, driverId)
  if (plannedDate) await db().from('shipsync_packages').update({ planned_delivery_date: plannedDate }).in('id', packageIds)
  await db().from('shipsync_delivery_notes').update({ status: 'dispatched' }).eq('id', note.id)
  return { ...note, status: 'dispatched' }
}

/** Set/replace the driver on a note and all its packages. */
export async function setNoteDriver(noteId: string, driverId: string | null): Promise<void> {
  await db().from('shipsync_delivery_notes').update({ driver_id: driverId }).eq('id', noteId)
  await db().from('shipsync_packages').update({ driver_id: driverId }).eq('delivery_note_id', noteId)
}

/** Remove a package from its note (back to the routing pool, unassigned).
 *  Reverts to 'in_storage' — not always 'in_office' — if it still has a rack
 *  assignment: forcing 'in_office' unconditionally lost that distinction for
 *  any parcel that had been shelved before it was routed. Also clears
 *  delivered_at: a package coming off a note can't still carry a real
 *  delivery timestamp, or it ends up reading "In office" while delivered_at
 *  says otherwise — a silently contradictory, undetectable-in-UI state. */
export async function unassignPackage(id: string): Promise<void> {
  const { data: pkg } = await db().from('shipsync_packages').select('warehouse_zone').eq('id', id).maybeSingle()
  const status: PackageStatus = pkg?.warehouse_zone ? 'in_storage' : 'in_office'
  await patchPackage(id, { delivery_note_id: null, driver_id: null, status, scan_out_time: null, delivered_at: null })
}

/** Delete a dispatched run: send all its parcels back to the routing pool, then
 *  remove the delivery note. Same status/delivered_at correctness as
 *  unassignPackage above, applied per-parcel since a route can span several
 *  boats with different warehouse states. */
export async function deleteRun(noteId: string): Promise<void> {
  const { data: pkgs } = await db().from('shipsync_packages').select('id, warehouse_zone').eq('delivery_note_id', noteId)
  const inStorageIds = (pkgs ?? []).filter((p: any) => p.warehouse_zone).map((p: any) => p.id)
  const inOfficeIds = (pkgs ?? []).filter((p: any) => !p.warehouse_zone).map((p: any) => p.id)
  const baseReset = { delivery_note_id: null, driver_id: null, scan_out_time: null, driver_scanned: false, driver_scan_out_time: null, delivered_at: null }
  if (inStorageIds.length) await db().from('shipsync_packages').update({ ...baseReset, status: 'in_storage' as PackageStatus }).in('id', inStorageIds)
  if (inOfficeIds.length) await db().from('shipsync_packages').update({ ...baseReset, status: 'in_office' as PackageStatus }).in('id', inOfficeIds)
  const { error } = await db().from('shipsync_delivery_notes').delete().eq('id', noteId)
  if (error) throw error
}

// ── Images ───────────────────────────────────────────────────────────────────
export async function uploadShipSyncImage(file: File | Blob, path: string): Promise<string> {
  const { error } = await supabase.storage.from('shipsync').upload(path, file, { upsert: true })
  if (error) throw error
  return supabase.storage.from('shipsync').getPublicUrl(path).data.publicUrl
}

// ── Documents ────────────────────────────────────────────────────────────────
/** Same bucket as uploadShipSyncImage — just a clearer name for non-image
 *  attachments (PDFs, multi-page scans, etc.) uploaded onto a package's
 *  `documents` list. */
export const uploadShipSyncFile = uploadShipSyncImage

/** Upload several files onto a package's `documents` list, one storage object
 *  per file under documents/{packageId}/, and return the merged array
 *  (existing docs + newly uploaded ones) ready to patch onto the package. */
export async function addPackageDocuments(
  p: { id: string; documents: { name: string; url: string }[] | null }, files: File[],
): Promise<{ name: string; url: string }[]> {
  const uploaded = await Promise.all(files.map(async (f) => {
    const path = `documents/${p.id}/${Date.now()}-${f.name}`
    const url = await uploadShipSyncFile(f, path)
    return { name: f.name, url }
  }))
  return [...(p.documents ?? []), ...uploaded]
}

/** Drop one document (e.g. the wrong file was attached) and return the
 *  remaining array ready to patch onto the package. Also best-effort deletes
 *  the underlying storage object — failure there (odd URL shape, already
 *  gone, etc.) never blocks detaching the reference itself. */
export async function removePackageDocument(
  p: { documents: { name: string; url: string }[] | null }, index: number,
): Promise<{ name: string; url: string }[]> {
  const target = (p.documents ?? [])[index]
  const documents = (p.documents ?? []).filter((_, i) => i !== index)
  if (target?.url) {
    const marker = '/object/public/shipsync/'
    const at = target.url.indexOf(marker)
    if (at !== -1) {
      try { await supabase.storage.from('shipsync').remove([target.url.slice(at + marker.length)]) }
      catch { /* best-effort — the record's still detached below either way */ }
    }
  }
  return documents
}
