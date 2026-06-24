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
import { supabase } from '@/integrations/supabase/client'

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

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
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

export const queueAdd = (m: Mutation) => tx<number>('queue', 'readwrite', (s) => s.add(m as any))
export const queueAll = () => tx<(Mutation & { id: number })[]>('queue', 'readonly', (s) => s.getAll())
export const queueDel = (id: number) => tx<void>('queue', 'readwrite', (s) => s.delete(id))
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
    const up = await supabase.storage.from('shipsync').upload(m.path, blob, { upsert: true })
    if (up.error) throw up.error
    const url = supabase.storage.from('shipsync').getPublicUrl(m.path).data.publicUrl
    const { error } = await db2().from(m.table).update({ [m.field]: url }).eq('id', m.id)
    if (error) throw error
    await blobDel(m.blobKey)
  }
}

/** Flush queued mutations in order. Stops at the first failure (preserves order)
 *  so a transient error just means we retry next time. Returns how many synced. */
export async function flushQueue(): Promise<number> {
  let synced = 0
  const items = await queueAll().catch(() => [])
  for (const m of items) {
    try { await applyMutation(m); await queueDel(m.id); synced++ }
    catch { break }
  }
  return synced
}

export const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine)
