/**
 * Logistics mobile app — check-ins saved on the phone while there is no signal.
 *
 * The warehouse and quayside have dead spots. When a check-in can't reach the
 * server it is parked here (IndexedDB, photo included) and uploaded by itself
 * once the phone is back online. Kept in its own database, separate from the
 * driver app's queue, so the two can never get in each other's way.
 *
 * Only works while the app is already open when the signal drops — there is no
 * service worker caching the page itself.
 */
import { commitQueued, createCheckin, updateCheckin, findByAwb, isNetworkError, type CheckinPayload } from "./checkin-commit";

const DB_NAME = "logistics-offline";
const STORE = "checkins";
const DRAFTS = "drafts";
export const QUEUE_EVENT = "logistics-checkins-changed";

export type QueuedCheckin = {
  id: string; payload: CheckinPayload; photo: Blob | null; savedAt: string;
  /** Why the last upload attempt failed, when it wasn't just a missing signal. */
  error?: string;
  /** The AWB turned out to be on file already — held for the person to choose, never merged on its own. */
  conflict?: { summary: string };
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
      if (!req.result.objectStoreNames.contains(DRAFTS)) req.result.createObjectStore(DRAFTS, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Runs one request and resolves only when the transaction has COMMITTED — not just
 * when the request was accepted. A quota or commit failure after that point aborts
 * the write, and the caller must hear about it rather than clear the form and tell
 * the person their check-in is safe on the phone.
 */
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest, store: string = STORE): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    let result: T;
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => { result = req.result as T; };
    t.oncomplete = () => { db.close(); resolve(result); };
    t.onerror = () => { db.close(); reject(t.error ?? req.error); };
    t.onabort = () => { db.close(); reject(t.error ?? new Error("The phone could not save this check-in (storage may be full).")); };
  });
}

const changed = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(QUEUE_EVENT)); };

export async function queueCheckin(payload: CheckinPayload, photo: Blob | null): Promise<void> {
  const item: QueuedCheckin = { id: payload.id, payload, photo, savedAt: new Date().toISOString() };
  await tx<void>("readwrite", (s) => s.put(item));
  changed();
}

export const allCheckins = async (): Promise<QueuedCheckin[]> =>
  (await tx<QueuedCheckin[]>("readonly", (s) => s.getAll())).sort((a, b) => a.savedAt.localeCompare(b.savedAt));

export async function discardCheckin(id: string): Promise<void> {
  await tx<void>("readwrite", (s) => s.delete(id));
  changed();
}

export type FlushResult = { synced: number; failed: number; needsDecision: number; remaining: number };

let running: Promise<FlushResult> | null = null;

/**
 * Upload everything waiting, oldest first. A missing signal stops the run (try
 * again later); any other failure is recorded on that check-in and the rest carry
 * on. A parcel whose AWB is already on file is held for a decision, and skipped
 * until it gets one. Calling it while a run is in progress just joins that run.
 */
export function flushCheckins(): Promise<FlushResult> {
  if (running) return running;
  running = (async () => {
    let synced = 0, failed = 0, needsDecision = 0;
    const items = await allCheckins().catch(() => [] as QueuedCheckin[]);
    for (const it of items) {
      if (it.conflict) { needsDecision++; continue; }
      try {
        const r = await commitQueued(it.payload, it.photo);
        if (r.result === "conflict") {
          const x = r.existing;
          const summary = `${x.barcode} is already on the ${x.local_import ?? "Local"} board${x.boat_name ? ` for ${x.boat_name}` : ""} (${x.status.replace(/_/g, " ")}).`;
          await tx<void>("readwrite", (s) => s.put({ ...it, error: undefined, conflict: { summary } }));
          needsDecision++;
          continue;
        }
        await tx<void>("readwrite", (s) => s.delete(it.id));
        synced++;
      } catch (e) {
        if (isNetworkError(e)) break;
        failed++;
        const error = String((e as { message?: string } | null)?.message ?? e);
        await tx<void>("readwrite", (s) => s.put({ ...it, error })).catch(() => {});
      }
    }
    const remaining = (await allCheckins().catch(() => [] as QueuedCheckin[])).length;
    changed();
    return { synced, failed, needsDecision, remaining };
  })().finally(() => { running = null; });
  return running;
}

/**
 * Settle a held check-in: check it in on the record that already has its AWB (or,
 * if that record has since gone, as a new parcel) — or throw it away.
 */
export async function resolveConflict(id: string, action: "merge" | "discard"): Promise<void> {
  if (action === "discard") { await discardCheckin(id); return; }
  const it = (await allCheckins()).find((x) => x.id === id);
  if (!it) return;
  const existing = await findByAwb(it.payload.awb);
  if (existing) await updateCheckin(existing, it.payload, it.photo);
  else await createCheckin(it.payload, it.photo);
  await discardCheckin(id);
}

// ── Drafts: a photo or signature kept on the phone while a form is open ──────
//
// Opening the camera can make Android and iOS reload the page when memory is tight, which wiped
// the form and the photo. A photo (or signature) taken is kept here as it is taken, and put back
// when the form opens again. Cleared when the form is saved or abandoned.

type DraftRecord = { key: string; blob: Blob; name: string; type: string; savedAt: number };

/** Keep `file` under `key`. */
export async function saveDraftFile(key: string, file: Blob & { name?: string }, now: number = Date.now()): Promise<void> {
  const rec: DraftRecord = { key, blob: file, name: file.name ?? "", type: file.type, savedAt: now };
  await tx<void>("readwrite", (s) => s.put(rec), DRAFTS);
}

/** The file kept under `key`, as a File — or null. */
export async function loadDraftFile(key: string): Promise<File | null> {
  const rec = await tx<DraftRecord | undefined>("readonly", (s) => s.get(key), DRAFTS);
  if (!rec) return null;
  return rec.blob instanceof File ? rec.blob : new File([rec.blob], rec.name || "draft", { type: rec.type || rec.blob.type });
}

export async function deleteDraftFile(key: string): Promise<void> {
  await tx<void>("readwrite", (s) => s.delete(key), DRAFTS);
}

/** Drop drafts nobody came back for: a form's own draft after a day, a "Complete Later" one after two weeks. */
export async function purgeDrafts(now: number = Date.now()): Promise<number> {
  const all = await tx<DraftRecord[]>("readonly", (s) => s.getAll(), DRAFTS);
  const DAY = 24 * 60 * 60 * 1000;
  let n = 0;
  for (const r of all) {
    const limit = r.key.startsWith("later-") ? 14 * DAY : DAY;
    if (now - r.savedAt > limit) { await deleteDraftFile(r.key); n++; }
  }
  return n;
}

/** One id per browser tab/session, so a half-finished form's draft is only ever put back into the same session's form. */
export function sessionDraftId(): string {
  try {
    let id = sessionStorage.getItem("logistics-session");
    if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem("logistics-session", id); }
    return id;
  } catch { return "nosession"; }
}
