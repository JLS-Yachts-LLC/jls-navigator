/**
 * ShipSync data access — CRUD + helpers over the shipsync_* tables, shared by
 * the office module and (read paths) the driver PWA.
 */
import { supabase } from '@/integrations/supabase/client'
import {
  nextDeliveryNumber,
  type ShipSyncPackage, type ShipSyncDriver, type ShipSyncDeliveryNote, type ShipSyncDestination,
  type ShipSyncDeliverySchedule, type PackageStatus,
} from './model'

const db = () => supabase as any

// ── Reads ────────────────────────────────────────────────────────────────────
export async function loadPackages(): Promise<ShipSyncPackage[]> {
  const { data, error } = await db().from('shipsync_packages').select('*').order('received_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ShipSyncPackage[]
}
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

// ── Delivery notes & dispatch ────────────────────────────────────────────────
/** Create a delivery note for a boat (auto-numbered), defaulting its destination
 *  from the boat's saved berth. */
export async function createDeliveryNote(boat_name: string, driver_id?: string | null): Promise<ShipSyncDeliveryNote> {
  const number = await nextDeliveryNumber()
  const { data: auth } = await supabase.auth.getUser()
  let dest: Partial<ShipSyncDeliveryNote> = {}
  if (boat_name) {
    const { data: d } = await db().from('shipsync_destinations').select('address, lat, lng').ilike('boat_name', boat_name).maybeSingle()
    if (d) dest = { destination_address: d.address, destination_lat: d.lat, destination_lng: d.lng }
  }
  const { data, error } = await db().from('shipsync_delivery_notes')
    .insert([{ number, boat_name: boat_name || null, driver_id: driver_id ?? null, status: 'open',
               created_by: auth?.user?.id ?? null, ...dest }])
    .select('*').single()
  if (error) throw error
  return data as ShipSyncDeliveryNote
}

/** Assign packages onto a note + driver, flipping them to "assigned". */
export async function assignPackagesToNote(packageIds: string[], note: ShipSyncDeliveryNote, driverId: string | null): Promise<void> {
  if (packageIds.length === 0) return
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
  packageIds: string[], driverId: string, boatLabel: string | null, plannedDate?: string | null,
): Promise<ShipSyncDeliveryNote> {
  const note = await createDeliveryNote(boatLabel ?? '', driverId)
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

/** Remove a package from its note (back to in_office, unassigned). */
export async function unassignPackage(id: string): Promise<void> {
  await patchPackage(id, { delivery_note_id: null, driver_id: null, status: 'in_office', scan_out_time: null })
}

/** Delete a dispatched run: send all its parcels back to the routing pool, then
 *  remove the delivery note. */
export async function deleteRun(noteId: string): Promise<void> {
  await db().from('shipsync_packages').update({
    delivery_note_id: null, driver_id: null, status: 'in_office' as PackageStatus,
    scan_out_time: null, driver_scanned: false, driver_scan_out_time: null,
  }).eq('delivery_note_id', noteId)
  const { error } = await db().from('shipsync_delivery_notes').delete().eq('id', noteId)
  if (error) throw error
}

// ── Images ───────────────────────────────────────────────────────────────────
export async function uploadShipSyncImage(file: File | Blob, path: string): Promise<string> {
  const { error } = await supabase.storage.from('shipsync').upload(path, file, { upsert: true })
  if (error) throw error
  return supabase.storage.from('shipsync').getPublicUrl(path).data.publicUrl
}
