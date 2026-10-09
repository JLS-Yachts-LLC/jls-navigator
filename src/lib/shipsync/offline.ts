/**
 * ShipSync driver offline layer.
 *
 * The driver PWA must keep working in marina dead-zones. We:
 *  - cache the driver's runs (delivery notes + packages) in IndexedDB, and
 *  - queue every change (status, scan, photo, signature, delivery) when offline,
 *    flushing it to Supabase the moment the connection returns.
 *
 * IndexedDB stores: kv (snapshots), queue (ordered mutations), blobs (images
 * waiting to upload). Everything is best-effort and degrades gracefully.
 */
import { storageRef } from '@/lib/signed-url'
import { supabase } from '@/integrations/supabase/client'
import { isNetworkError } from '@/lib/network-error'
import { withType } from './image-shrink'

const DB_NAME = 'shipsync-driver'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Resolves once the transaction has COMMITTED (not merely when the request was accepted), so
 *  "queued" really means it is safe on the phone; a failed commit rejects instead of vanishing. */
function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    let result: T
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    req.onsuccess = () => { result = req.result as T }
    t.oncomplete = () => { db.close(); resolve(result) }
    t.onerror = () => { db.close(); reject(t.error ?? req.error) }
    t.onabort = () => { db.close(); reject(t.error ?? new Error('The phone could not save this (storage may be full).')) }
  }))
}

// ── KV snapshot cache ────────────────────────────────────────────────────────
export const kvSet = (key: string, val: unknown) => tx<void>('kv', 'readwrite', (s) => s.put(val as any, key))
export const kvGet = <T>(key: string) => tx<T>('kv', 'readonly', (s) => s.get(key))

// ── Image blob staging (for offline photo/signature uploads) ─────────────────
export const blobPut = (key: string, blob: Blob) => tx<void>('blobs', 'readwrite', (s) => s.put(blob as any, key))
export const blobGet = (key: string) => tx<Blob | undefined>('blobs', 'readonly', (s) => s.get(key))
export const blobDel = (key: string) => tx<void>('blobs', 'readwrite', (s) => s.delete(key))

// ── Mutation queue ────────────────────────────────────────────────────────────
export type Mutation =
  | { kind: 'patch'; table: 'shipsync_packages' | 'shipsync_delivery_notes'; id: string; patch: Record<string, unknown> }
  | { kind: 'uploadAndPatch'; blobKey: string; path: string; table: 'shipsync_packages'; id: string; field: string }

/**
 * The queue's own key is `id` (auto-increment), so a queued mutation's TARGET row id is
 * stored as `rowId`. It used to be stored as `id` too, which made it the key: a second
 * change queued for the same parcel — its photo, after its status — failed with a key
 * clash, and the handover could not be saved offline at all.
 */
export type QueuedMutation = Mutation & { qid: IDBValidKey }

export const queueAdd = (m: Mutation) => {
  const { id: rowId, ...rest } = m
  return tx<number>('queue', 'readwrite', (s) => s.add({ ...rest, rowId } as any))
}
export async function queueAll(): Promise<QueuedMutation[]> {
  const rows = await tx<any[]>('queue', 'readonly', (s) => s.getAll())
  // Records written by the old version have no rowId: their `id` IS the row id (and was the key).
  return rows.map((r) => (r.rowId !== undefined ? { ...r, id: r.rowId, qid: r.id } : { ...r, qid: r.id })) as QueuedMutation[]
}
export const queueDel = (qid: IDBValidKey) => tx<void>('queue', 'readwrite', (s) => s.delete(qid))
export async function queueCount(): Promise<number> {
  try { return (await queueAll()).length } catch { return 0 }
}

const db2 = () => supabase as any

async function applyMutation(m: Mutation): Promise<void> {
  if (m.kind === 'patch') {
    const { error } = await db2().from(m.table).update(m.patch).eq('id', m.id)
    if (error) throw error
  } else {
    const blob = await blobGet(m.blobKey)
    if (!blob) return // blob gone — skip
    const up = await supabase.storage.from('shipsync').upload(m.path, withType(blob, m.path), { upsert: true })
    if (up.error) throw up.error
    const url = storageRef('shipsync', m.path)
    const { error } = await db2().from(m.table).update({ [m.field]: url }).eq('id', m.id)
    if (error) throw error
    await blobDel(m.blobKey)
  }
}

/** Flush queued mutations in order. No signal stops the run (preserving order) so it
 *  retries next time; any OTHER failure leaves that one item queued and carries on — a
 *  single rejected photo or row must not hold up every later proof of delivery behind it.
 *  Returns how many synced. */
export async function flushQueue(): Promise<number> {
  let synced = 0
  const items = await queueAll().catch(() => [])
  for (const m of items) {
    try { await applyMutation(m); await queueDel(m.qid); synced++ }
    catch (e) { if (isNetworkError(e)) break }
  }
  return synced
}

export const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine)
