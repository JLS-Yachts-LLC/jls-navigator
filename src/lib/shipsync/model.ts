/**
 * ShipSync shared model — types, status vocabulary, and small helpers used by
 * both the office/logistics module and the driver PWA.
 *
 * Backed by the shipsync_* Supabase tables. Status drives the whole lifecycle:
 *   in_office → in_storage → assigned → out_for_delivery → delivered
 *   (or to_collect → collected, or refused)
 */
import { supabase } from '@/integrations/supabase/client'

export type PackageStatus =
  | 'in_office' | 'in_storage' | 'assigned' | 'out_for_delivery'
  | 'delivered' | 'to_collect' | 'collected' | 'refused'

export const STATUS_META: Record<PackageStatus, { label: string; tone: string }> = {
  in_office:        { label: 'In office',        tone: 'sky' },
  in_storage:       { label: 'In storage',       tone: 'violet' },
  assigned:         { label: 'Assigned',         tone: 'amber' },
  out_for_delivery: { label: 'Out for delivery', tone: 'orange' },
  delivered:        { label: 'Delivered',        tone: 'emerald' },
  to_collect:       { label: 'To collect',       tone: 'amber' },
  collected:        { label: 'Collected',        tone: 'emerald' },
  refused:          { label: 'Refused',          tone: 'red' },
}

/** Statuses still "active" (not yet completed) — the office working set. */
export const ACTIVE_STATUSES: PackageStatus[] = [
  'in_office', 'in_storage', 'assigned', 'out_for_delivery', 'to_collect',
]
export const DONE_STATUSES: PackageStatus[] = ['delivered', 'collected', 'refused']

export type DeliveryNoteStatus = 'open' | 'dispatched' | 'delivered' | 'cancelled'

export interface ShipSyncDriver {
  id: string
  name: string
  email: string | null
  phone: string | null
  vehicle: string | null
  active: boolean
  user_id: string | null
  work_days: number[] | null   // Mon-first weekday indices the driver works (null ⇒ all)
}

/** Does this driver work on the given Mon-first weekday index? (null work_days ⇒ all days) */
export const driverWorks = (d: { work_days?: number[] | null }, weekday: number): boolean =>
  !d.work_days || d.work_days.includes(weekday)

/** Mon-first weekday index (0=Mon … 6=Sun) for a YYYY-MM-DD date string. */
export const weekdayOf = (dateStr: string): number =>
  (new Date(`${dateStr}T00:00:00`).getDay() + 6) % 7

export interface ShipSyncDeliverySchedule {
  id: string
  boat_name: string
  weekday: number   // 0 = Mon … 6 = Sun
  created_at: string
}

/** Weekly delivery calendar days, Monday-first. */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
/** Today's index in the Mon-first WEEKDAYS array (JS getDay() is Sun=0). */
export const todayWeekday = (): number => (new Date().getDay() + 6) % 7

export interface ShipSyncDestination {
  id: string
  boat_name: string
  yacht_id: string | null
  address: string | null
  lat: number | null
  lng: number | null
  notes: string | null
}

export interface ShipSyncVehicle {
  id: string
  make: string | null
  model: string | null
  registration: string | null
  status: string | null
}

/** Short label for a van — its plate if set, else make + model. */
export const vanLabel = (v: ShipSyncVehicle): string =>
  (v.registration?.trim() || [v.make, v.model].filter(Boolean).join(' ').trim() || 'Van')

export interface ShipSyncDeliveryNote {
  id: string
  number: string | null
  boat_name: string | null
  yacht_id: string | null
  driver_id: string | null
  vehicle_id: string | null
  destination_address: string | null
  destination_lat: number | null
  destination_lng: number | null
  status: DeliveryNoteStatus
  predelivery_pdf_url: string | null
  delivery_pdf_url: string | null
  delivered_at: string | null
  created_at: string
  updated_at: string
}

export interface ShipSyncPackage {
  id: string
  barcode: string | null
  boat_name: string | null
  yacht_id: string | null
  package_owner: string | null
  courier: string | null
  num_packages: number
  priority: number | null
  local_import: string | null
  declaration: string | null
  vat: number | null
  duty: number | null
  warehouse_zone: string | null
  status: PackageStatus
  delivery_note_id: string | null
  driver_id: string | null
  received_at: string | null
  received_by: string | null
  planned_delivery_date: string | null
  description: string | null
  phase_status: string | null
  scan_out_time: string | null
  driver_scanned: boolean
  driver_scan_out_time: string | null
  delivered_at: string | null
  receiver_full_name: string | null
  receiver_designation: string | null
  receiver_email: string | null
  signature_url: string | null
  delivery_photo_url: string | null
  item_photo_url: string | null
  office_photo_url: string | null
  delivery_note_no: string | null
  documents: { name: string; url: string }[] | null
  boe_no: string | null
  trade_type: string | null
  supplier: string | null
  origin: string | null
  commodity: string | null
  weight_kg: number | null
  edas_required: boolean | null
  extra: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

/** Warehouse rack zones (K = JLS storage, then A–J), 4 levels each. */
export const ZONE_RACKS = ['K', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
export const ZONE_LEVELS = [1, 2, 3, 4]
export const ALL_ZONES: string[] = ZONE_RACKS.flatMap((r) => ZONE_LEVELS.map((l) => `${r}${l}`))

/** Allocate the next delivery-note number atomically (server sequence). */
export async function nextDeliveryNumber(): Promise<string> {
  const { data, error } = await (supabase as any).rpc('next_shipsync_delivery_number')
  if (error) throw error
  return data as string
}

/**
 * Build a Google Maps directions deep-link. With one stop it routes straight
 * there; with several it chains them as waypoints in order (driver's run).
 * Prefers lat,lng when present, else the text address.
 */
export function googleMapsDirectionsUrl(
  stops: { address?: string | null; lat?: number | null; lng?: number | null }[],
): string | null {
  const pts = stops
    .map((s) => (s.lat != null && s.lng != null ? `${s.lat},${s.lng}` : (s.address || '').trim()))
    .filter(Boolean)
  if (pts.length === 0) return null
  const destination = encodeURIComponent(pts[pts.length - 1])
  const params = new URLSearchParams({ api: '1', destination, travelmode: 'driving' })
  if (pts.length > 1) params.set('waypoints', pts.slice(0, -1).map(encodeURIComponent).join('|'))
  // URLSearchParams re-encodes the already-encoded values; build manually to keep them clean.
  let url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${destination}`
  if (pts.length > 1) url += `&waypoints=${pts.slice(0, -1).map(encodeURIComponent).join('|')}`
  return url
}
