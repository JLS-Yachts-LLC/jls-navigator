/**
 * Warehouse module — CRUD over the warehouse_* Supabase tables.
 * Mirrors the same loadAll/makeCrud pattern used across ShipSync/Training.
 */
import { storageRef } from '@/lib/signed-url'
import { supabase } from '@/integrations/supabase/client'

const db = () => supabase as any

export type Zone = 'A' | 'B' | 'C' | 'D' | 'E'
export type ManualStatus = 'Stored' | 'Checked Out' | 'Returned' | 'Disposed' | 'Completed'
export type PackageContentManualStatus = ManualStatus
export interface WarehouseDoc { name: string; url: string }

export interface WarehouseShelf {
  id: string
  zone: Zone
  bay: string
  shelf: string
  max_length_cm: number
  max_width_cm: number
  max_height_cm: number
  max_cbm: number
  max_weight_kg: number | null
  created_at: string
  updated_at: string
}

export interface WarehouseClientItem {
  id: string
  ref_no: string
  client_name: string
  description: string
  quotation_no: string | null
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  weight_kg: number | null
  cbm: number | null
  charges: number | null
  date_stored: string | null
  due_date: string | null
  zone: Zone | null
  bay: string | null
  shelf: string | null
  invoice_no: string | null
  status: ManualStatus
  checked_out_date: string | null
  checked_out_to: string | null
  actual_return_date: string | null
  remarks: string | null
  documents: WarehouseDoc[]
  image_url: string | null
  created_at: string
  updated_at: string
}

export interface WarehouseInternalItem {
  id: string
  ref_no: string
  kind: 'documents' | 'assets'
  department: string
  description: string
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  weight_kg: number | null
  cbm: number | null
  date_stored: string | null
  destruction_date: string | null
  zone: Zone | null
  bay: string | null
  shelf: string | null
  status: ManualStatus
  checked_out_date: string | null
  checked_out_to: string | null
  actual_return_date: string | null
  remarks: string | null
  documents: WarehouseDoc[]
  image_url: string | null
  created_at: string
  updated_at: string
}

export interface WarehousePackageContent {
  id: string
  item_id: string
  ref_no: string
  client_or_dept: string | null
  item_name: string
  quantity: number
  unit: string
  status: PackageContentManualStatus
  due_date: string | null
  remarks: string | null
  image_url: string | null
  created_at: string
  updated_at: string
}

async function loadAll<T>(table: string, orderCol: string): Promise<T[]> {
  const all: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db().from(table).select('*').order(orderCol).range(offset, offset + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as T[]))
    if (data.length < 1000) break
  }
  return all
}

export const loadShelves = () => loadAll<WarehouseShelf>('warehouse_shelves', 'zone')
export const loadClientItems = () => loadAll<WarehouseClientItem>('warehouse_client_items', 'ref_no')
export const loadInternalItems = () => loadAll<WarehouseInternalItem>('warehouse_internal_items', 'ref_no')
export const loadPackageContents = () => loadAll<WarehousePackageContent>('warehouse_package_contents', 'ref_no')

function makeCrud<T extends { id: string }>(table: string) {
  return {
    create: async (record: Partial<T>): Promise<T> => {
      const { data, error } = await db().from(table).insert([record]).select('*').single()
      if (error) throw error
      return data as T
    },
    patch: async (id: string, patch: Partial<T>): Promise<void> => {
      const { error } = await db().from(table).update(patch).eq('id', id)
      if (error) throw error
    },
    remove: async (id: string): Promise<void> => {
      const { error } = await db().from(table).delete().eq('id', id)
      if (error) throw error
    },
  }
}
export const shelfCrud = makeCrud<WarehouseShelf>('warehouse_shelves')
export const clientItemCrud = makeCrud<WarehouseClientItem>('warehouse_client_items')
export const internalItemCrud = makeCrud<WarehouseInternalItem>('warehouse_internal_items')
export const packageContentCrud = makeCrud<WarehousePackageContent>('warehouse_package_contents')

/** Allocate the next Client Inventory reference number atomically (e.g. "CLI-0001"). */
export async function nextClientRef(): Promise<string> {
  const { data, error } = await db().rpc('next_warehouse_client_ref')
  if (error) throw error
  return data as string
}
/** Allocate the next Internal Inventory reference number atomically (e.g. "INT-0001"). */
export async function nextInternalRef(): Promise<string> {
  const { data, error } = await db().rpc('next_warehouse_internal_ref')
  if (error) throw error
  return data as string
}
/** Allocate the next Package Content item ID for a given parent ref number
 *  (e.g. "JLS-INT-26-0060" -> "JLS-INT-26-0060-01") — a per-parent suffix,
 *  not a global counter, matching the real numbering convention. */
export async function nextPackageItemId(refNo: string): Promise<string> {
  const { data, error } = await db().rpc('next_warehouse_package_item_id', { p_ref_no: refNo })
  if (error) throw error
  return data as string
}

/** Uploads share the ShipSync storage bucket, under their own path prefix —
 *  same bucket several other ShipSync attachment features already use. */
export async function uploadWarehouseFile(file: File | Blob, path: string): Promise<string> {
  const fullPath = `warehouse/${path}`
  const { error } = await supabase.storage.from('shipsync').upload(fullPath, file, { upsert: true })
  if (error) throw error
  return storageRef('shipsync', fullPath)
}
