/**
 * Orbit field app offline — what is kept on the phone.
 *
 *  - reads:  the last response for each request the app made while online, so a
 *            screen can be drawn again with no signal.
 *  - rows:   every row of the field app's tables seen while online (jobs, notes,
 *            attendance, checklists…), so a screen never opened with signal can
 *            still be answered — the job list pre-loads each job's details.
 *  - outbox: changes made with no signal, in the order they were made, sent by
 *            themselves once the phone is back online.
 *
 * Both are tagged with the signed-in user, so a second person signing in on the
 * same phone never sees the first person's jobs or sends their changes.
 * IndexedDB in the browser; an in-memory version backs the tests.
 */

export type SavedRead = {
  key: string;
  userId: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  savedAt: number;
};

/** One FormData entry of a queued upload (the photo itself is kept as a Blob). */
export type FormEntry = { name: string; value: string | Blob; filename?: string };

export type OutboxItem = {
  seq?: number;
  userId: string;
  createdAt: string;
  /** "rest" = a database change, "upload" = a photo, "storage" = any other file operation. */
  kind: "rest" | "upload" | "storage";
  table: string | null;
  method: string;
  url: string;
  /** Request headers minus Authorization (a fresh token is used when it is sent). */
  headers: Record<string, string>;
  /** JSON text for database changes; null for uploads (see form). */
  body: string | null;
  /** Upload body, rebuilt into FormData when sent. */
  form?: FormEntry[];
  /** "bucket/path" of an upload — lets the photo show before it has been sent. */
  uploadPath?: string;
  upsert: boolean;
  conflictCols: string[];
  /** What the person did, in their words — shown if it can't be sent. */
  label: string;
  state: "pending" | "failed" | "skipped";
  error?: string;
  attempts: number;
};

export type SavedRow = { k: string; userId: string; table: string; id: string; row: Record<string, unknown>; savedAt: number };

export interface OfflineStore {
  getRead(key: string): Promise<SavedRead | undefined>;
  putRead(r: SavedRead): Promise<void>;
  outbox(): Promise<OutboxItem[]>;
  add(item: OutboxItem): Promise<number>;
  update(item: OutboxItem): Promise<void>;
  remove(seq: number): Promise<void>;
  /** Rows of one table seen while online, for this user. */
  tableRows(userId: string, table: string): Promise<Record<string, unknown>[]>;
  putRows(userId: string, table: string, rows: Record<string, unknown>[], savedAt: number): Promise<void>;
  deleteRows(userId: string, table: string, ids: string[]): Promise<void>;
  getMeta<T>(k: string): Promise<T | undefined>;
  setMeta(k: string, v: unknown): Promise<void>;
}

/** Keep the newest saved reads only — a phone's storage is not unlimited. */
export const MAX_READS = 600;

// ── IndexedDB ────────────────────────────────────────────────────────────────

export const DB_NAME = "orbit-offline";
const READS = "reads";
const OUTBOX = "outbox";
const META = "meta";
const ROWS = "rows";
/** Bumped with every new store; public/orbit-sw.js opens the same database and must match. */
export const DB_VERSION = 2;

const rowKey = (userId: string, table: string, id: string) => `${userId}|${table}|${id}`;

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ROWS)) db.createObjectStore(ROWS, { keyPath: "k" }).createIndex("ut", ["userId", "table"]);
      if (!db.objectStoreNames.contains(READS)) db.createObjectStore(READS, { keyPath: "key" }).createIndex("savedAt", "savedAt");
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: "seq", autoIncrement: true });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "k" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }));
}

let putsSincePrune = 0;

async function pruneReads(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(READS, "readwrite");
    const idx = tx.objectStore(READS).index("savedAt");
    const countReq = tx.objectStore(READS).count();
    countReq.onsuccess = () => {
      let extra = countReq.result - MAX_READS;
      if (extra <= 0) return;
      // Oldest first.
      idx.openCursor().onsuccess = (e) => {
        const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cur || extra <= 0) return;
        cur.delete();
        extra--;
        cur.continue();
      };
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export const idbStore: OfflineStore = {
  getRead: (key) => run<SavedRead | undefined>(READS, "readonly", (s) => s.get(key)),
  async putRead(r) {
    await run<void>(READS, "readwrite", (s) => s.put(r));
    if (++putsSincePrune >= 50) { putsSincePrune = 0; void pruneReads().catch(() => {}); }
  },
  async outbox() {
    const all = await run<OutboxItem[]>(OUTBOX, "readonly", (s) => s.getAll());
    return all.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  },
  add: (item) => run<number>(OUTBOX, "readwrite", (s) => s.add(item)),
  update: async (item) => { await run<void>(OUTBOX, "readwrite", (s) => s.put(item)); },
  remove: async (seq) => { await run<void>(OUTBOX, "readwrite", (s) => s.delete(seq)); },
  async tableRows(userId, table) {
    const all = await run<SavedRow[]>(ROWS, "readonly", (s) => s.index("ut").getAll([userId, table]));
    return all.map((r) => r.row);
  },
  async putRows(userId, table, rows, savedAt) {
    if (!rows.length) return;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ROWS, "readwrite");
      const st = tx.objectStore(ROWS);
      for (const row of rows) {
        const id = String(row.id);
        st.put({ k: rowKey(userId, table, id), userId, table, id, row, savedAt } satisfies SavedRow);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async deleteRows(userId, table, ids) {
    if (!ids.length) return;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ROWS, "readwrite");
      const st = tx.objectStore(ROWS);
      for (const id of ids) st.delete(rowKey(userId, table, id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  getMeta: async <T,>(k: string) => (await run<{ k: string; v: T } | undefined>(META, "readonly", (s) => s.get(k)))?.v,
  setMeta: async (k, v) => { await run<void>(META, "readwrite", (s) => s.put({ k, v })); },
};

// ── In memory (tests) ────────────────────────────────────────────────────────

export function memoryStore(): OfflineStore & { reads: Map<string, SavedRead>; items: OutboxItem[] } {
  const reads = new Map<string, SavedRead>();
  const items: OutboxItem[] = [];
  const meta = new Map<string, unknown>();
  const rows = new Map<string, Record<string, unknown>>();
  let seq = 0;
  return {
    reads,
    items,
    getRead: async (k) => reads.get(k),
    putRead: async (r) => { reads.set(r.key, r); },
    outbox: async () => [...items].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)),
    add: async (item) => { const s = ++seq; items.push({ ...item, seq: s }); return s; },
    update: async (item) => { const i = items.findIndex((x) => x.seq === item.seq); if (i >= 0) items[i] = { ...item }; },
    remove: async (s) => { const i = items.findIndex((x) => x.seq === s); if (i >= 0) items.splice(i, 1); },
    tableRows: async (u, t) => [...rows.entries()].filter(([k]) => k.startsWith(rowKey(u, t, ""))).map(([, r]) => ({ ...r })),
    putRows: async (u, t, list) => { for (const r of list) rows.set(rowKey(u, t, String(r.id)), { ...r }); },
    deleteRows: async (u, t, ids) => { for (const id of ids) rows.delete(rowKey(u, t, id)); },
    getMeta: async <T,>(k: string) => meta.get(k) as T | undefined,
    setMeta: async (k, v) => { meta.set(k, v); },
  };
}
