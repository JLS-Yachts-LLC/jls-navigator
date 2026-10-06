/**
 * Orbit field app offline — the fetch layer.
 *
 * Sits under supabase-js on the field app's pages (see ./index.ts). Every
 * request to our Supabase project passes through here:
 *
 *  - Reads (GET/HEAD, and rpc calls) go to the network as normal and the answer
 *    is saved on the phone. With no signal, the saved answer is returned instead.
 *  - Changes (insert / update / upsert / delete, photo uploads) go to the network
 *    as normal. With no signal they are put in the outbox and the app is told
 *    they worked, so the person carries on; the outbox is sent in order later.
 *  - Either way, unsent changes are applied over what is read back, so a screen
 *    shows what the person did rather than what the server last knew.
 *
 * Kept free of browser globals (everything comes in through `deps`) so the tests
 * can drive it with the real supabase-js against a fake network.
 */
import {
  applyOverlay, eqValues, matchAll, parseFilters, parseOrder, restTable, sortRows, wantsObject,
  type PendingWrite, type Row,
} from "./postgrest";
import type { FormEntry, OfflineStore, OutboxItem } from "./store";

/** Tables whose inserts get an id from the phone. Every one has `id uuid default gen_random_uuid()`. */
export const ID_TABLES = new Set([
  "orbit2_attendance", "orbit2_notes", "orbit2_files", "orbit2_boat_inventory",
  "orbit2_boat_tasks", "orbit2_projects", "orbit2_boat_checklist",
]);

/**
 * Tables whose rows are kept on the phone one by one, so any simple question
 * about them (this job's notes, this boat's checklist) can be answered offline —
 * even for a job never opened with signal, once the job list has pre-loaded it.
 */
export const ROW_TABLES = new Set([
  "orbit2_projects", "orbit2_boat_tasks", "orbit2_boats", "orbit2_notes", "orbit2_files",
  "orbit2_attendance", "orbit2_boat_inventory", "orbit2_boat_checklist",
  "orbit2_checklist_templates", "orbit2_checklist_forms",
]);

/**
 * Timestamp columns the database fills with now() — filled from the phone for a
 * change made offline, so Attend at 09:10 doesn't read as 14:30 when signal returns.
 */
export const TIME_DEFAULTS: Record<string, string[]> = {
  orbit2_attendance: ["attended_at"],
  orbit2_notes: ["created_at"],
  orbit2_files: ["created_at"],
  orbit2_boat_inventory: ["created_at", "updated_at"],
  orbit2_boat_tasks: ["created_at", "updated_at"],
  orbit2_projects: ["created_at", "updated_at"],
};

/** Plain words for what a queued change was — shown if it can't be sent. */
const TABLE_LABELS: Record<string, string> = {
  orbit2_attendance: "Attend / Done",
  orbit2_notes: "Comment",
  orbit2_files: "Photo",
  orbit2_boat_inventory: "Inventory change",
  orbit2_boat_checklist: "Checklist tick",
  orbit2_boat_tasks: "Job status",
  orbit2_projects: "Job status",
};

export type Deps = {
  baseFetch: typeof fetch;
  supabaseUrl: string;
  store: OfflineStore;
  /** The signed-in user, from the session saved on the phone (works offline). */
  currentUserId(): string | null;
  /** A usable access token for sending the outbox — null when there isn't one yet. */
  getAccessToken(): Promise<string | null>;
  /** Forced offline (the phone says so, or the testing switch is on). */
  forcedOffline(): boolean;
  uuid(): string;
  now(): Date;
  /** Something in the outbox or the connection state changed. */
  onChange(): void;
  /** The outbox was sent and the screen should load fresh data. */
  onSynced(): void;
  /** A read came back from the server — what is on screen is current. */
  onFresh?(): void;
  timeouts?: Partial<{ read: number; write: number; upload: number; sign: number }>;
};

const DEFAULT_TIMEOUTS = { read: 10_000, write: 15_000, upload: 60_000, sign: 8_000 };

class NetworkDown extends Error {}

export type OfflineLayer = {
  fetch: typeof fetch;
  flush(): Promise<{ sent: number; left: number }>;
  isOffline(): boolean;
  /** Mark the network as up again (e.g. after a successful health check). */
  markUp(): void;
  markDown(): void;
  /** Number of changes waiting to be sent, for this user. */
  pending(): Promise<number>;
};

function headerObject(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(h ?? {}).forEach((v, k) => { out[k.toLowerCase()] = v; });
  return out;
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

export function createOfflineLayer(deps: Deps): OfflineLayer {
  const t = { ...DEFAULT_TIMEOUTS, ...(deps.timeouts ?? {}) };
  const base = deps.supabaseUrl.replace(/\/+$/, "");
  let down = false;
  let flushing: Promise<{ sent: number; left: number }> | null = null;

  const isOffline = () => deps.forcedOffline() || down;
  const markDown = () => { if (!down) { down = true; deps.onChange(); } };
  const markUp = () => { if (down) { down = false; deps.onChange(); } };

  async function network(input: RequestInfo | URL, init: RequestInit, ms: number): Promise<Response> {
    if (deps.forcedOffline()) throw new NetworkDown("offline");
    const ctrl = new AbortController();
    const outer = init.signal;
    if (outer?.aborted) throw new DOMException("Aborted", "AbortError");
    const onAbort = () => ctrl.abort();
    outer?.addEventListener("abort", onAbort);
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await deps.baseFetch(input, { ...init, signal: ctrl.signal });
      markUp();
      return res;
    } catch (e) {
      // The caller cancelled — not a signal problem, so not an offline case.
      if (outer?.aborted) throw e;
      markDown();
      throw new NetworkDown(String((e as Error)?.message ?? e));
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onAbort);
    }
  }

  async function myOutbox(): Promise<OutboxItem[]> {
    const uid = deps.currentUserId();
    return (await deps.store.outbox()).filter((i) => i.userId === uid);
  }

  async function pendingWrites(): Promise<PendingWrite[]> {
    return (await myOutbox())
      .filter((i) => i.state === "pending" && i.kind === "rest" && i.table)
      .map((i) => ({
        table: i.table!,
        method: i.method,
        url: i.url,
        body: i.body ? safeJson(i.body) : null,
        upsert: i.upsert,
        conflictCols: i.conflictCols,
      }));
  }

  /** A saved or fresh read, with unsent changes applied. */
  async function overlaid(url: string, accept: string | null, text: string, status: number, headers: Record<string, string>): Promise<Response> {
    const writes = await pendingWrites();
    const table = restTable(url);
    if (!table || !writes.some((w) => w.table === table) || !text) {
      return new Response(text || null, { status, headers });
    }
    const parsed = safeJson(text);
    if (parsed === undefined) return new Response(text, { status, headers });
    const out = applyOverlay(url, parsed, writes, wantsObject(accept));
    return new Response(JSON.stringify(out), { status, headers: { ...headers, "content-type": "application/json; charset=utf-8" } });
  }

  // ── Reads ───────────────────────────────────────────────────────────────────
  async function read(url: string, init: RequestInit, method: string, hdrs: Record<string, string>, bodyText: string | null): Promise<Response> {
    const accept = hdrs["accept"] ?? null;
    const key = `${method} ${url} ${accept ?? ""}${bodyText ? ` ${bodyText}` : ""}`;
    const uid = deps.currentUserId();
    const table = restTable(url);
    const snap = method === "GET" && table ? snapshotable(url, table) : null;

    if (!isOffline()) {
      try {
        const res = await network(url, init, t.read);
        if (res.status >= 400 || !uid) return res;
        const text = await res.clone().text();
        const keep: Record<string, string> = {};
        for (const h of ["content-type", "content-range"]) { const v = res.headers.get(h); if (v) keep[h] = v; }
        const now = deps.now().getTime();
        void deps.store.putRead({ key, userId: uid, status: res.status, headers: keep, body: text, savedAt: now }).catch(() => {});
        if (snap && table) await keepRows(uid, table, url, text, now).catch(() => {});
        deps.onFresh?.();
        return overlaid(url, accept, text, res.status, keep);
      } catch (e) {
        if (!(e instanceof NetworkDown)) throw e;
      }
    }

    const saved = uid ? await deps.store.getRead(key) : undefined;
    // The rows kept for this table answer any simple question about it — and are
    // newer than this exact answer when the job list pre-loaded since.
    if (uid && snap && table) {
      const rowsAt = (await deps.store.getMeta<number>(`rows:${uid}:${table}`)) ?? 0;
      if (rowsAt && (!saved || saved.userId !== uid || rowsAt > saved.savedAt)) {
        return fromRows(uid, table, url, accept);
      }
    }
    if (saved && saved.userId === uid) {
      return overlaid(url, accept, saved.body, saved.status, { ...saved.headers, "x-orbit-offline": "1" });
    }
    // Never loaded on this phone. A list can still show what the person added
    // offline (an Attend on a job never opened with signal); otherwise say so.
    if (method === "GET" && table && !wantsObject(accept)) {
      const writes = await pendingWrites();
      if (writes.some((w) => w.table === table)) {
        return json(applyOverlay(url, [], writes, false), 200, { "x-orbit-offline": "1" });
      }
    }
    return json({
      code: "OFFLINE",
      message: "No signal, and this hasn't been opened on this phone with signal yet.",
      details: null, hint: null,
    // 504, not 503: postgrest-js retries a 503 three times (1 s, 2 s, 4 s) before giving up.
    }, 504, { "x-orbit-offline": "1" });
  }

  /** Can this read be answered from (and teach) the rows kept for its table? */
  function snapshotable(url: string, table: string): boolean {
    if (!ROW_TABLES.has(table)) return false;
    const params = new URL(url).searchParams;
    const select = params.get("select");
    if (select && select.replace(/\s/g, "") !== "*") return false; // partial rows would overwrite full ones
    return !parseFilters(params).unsupported;
  }

  /** Remember every row of a fresh answer; forget kept rows the server no longer returns for it. */
  async function keepRows(uid: string, table: string, url: string, text: string, now: number): Promise<void> {
    const parsed = safeJson(text);
    const list = (Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? [parsed] : [])
      .filter((r): r is Row => !!r && typeof r === "object" && "id" in (r as Row));
    await deps.store.putRows(uid, table, list, now);
    const params = new URL(url).searchParams;
    if (Array.isArray(parsed) && !params.has("limit") && !params.has("offset")) {
      const { filters } = parseFilters(params);
      const returned = new Set(list.map((r) => String(r.id)));
      const gone = (await deps.store.tableRows(uid, table))
        .filter((r) => matchAll(r, filters) === true && !returned.has(String(r.id)))
        .map((r) => String(r.id));
      await deps.store.deleteRows(uid, table, gone);
    }
    await deps.store.setMeta(`rows:${uid}:${table}`, now);
  }

  /** Answer a read from the kept rows: filter, order, page, then the person's unsent changes. */
  async function fromRows(uid: string, table: string, url: string, accept: string | null): Promise<Response> {
    const params = new URL(url).searchParams;
    const { filters } = parseFilters(params);
    let rows = (await deps.store.tableRows(uid, table)).filter((r) => matchAll(r, filters) === true);
    const order = parseOrder(params);
    if (order) rows = sortRows(rows, order);
    const offset = Number(params.get("offset") ?? 0) || 0;
    const limit = params.has("limit") ? Number(params.get("limit")) : undefined;
    rows = rows.slice(offset, limit !== undefined ? offset + limit : undefined);
    const out = applyOverlay(url, rows, await pendingWrites(), false) as Row[];
    const hdrs = { "x-orbit-offline": "1" };
    if (!wantsObject(accept)) return json(out, 200, hdrs);
    // .single() / .maybeSingle(): exactly one row, or PostgREST's "not one row" answer.
    if (out.length === 1) return json(out[0], 200, hdrs);
    return json({ code: "PGRST116", details: `The result contains ${out.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" }, 406, hdrs);
  }

  // ── Database changes ───────────────────────────────────────────────────────
  async function write(url: string, init: RequestInit, method: string, hdrs: Record<string, string>, bodyText: string | null): Promise<Response> {
    const table = restTable(url)!;
    const params = new URL(url).searchParams;
    const prefer = hdrs["prefer"] ?? "";
    const upsert = /resolution=(merge|ignore)-duplicates/.test(prefer);
    const conflictCols = (params.get("on_conflict") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const wantsRows = /return=representation/.test(prefer);
    const asObject = wantsObject(hdrs["accept"] ?? null);

    // Every plain insert carries its own id, so a send that timed out but did
    // arrive can be retried safely — the second copy is refused as a duplicate.
    // (Never on an upsert: that would rewrite the id of the row it updates.)
    const body: unknown = bodyText ? safeJson(bodyText) : null;
    if (method === "POST" && !upsert && ID_TABLES.has(table) && body && typeof body === "object") {
      const rows = Array.isArray(body) ? body : [body];
      for (const r of rows) if (r && typeof r === "object" && !("id" in r)) (r as Record<string, unknown>).id = deps.uuid();
      bodyText = JSON.stringify(body);
    }

    // Changes go out in the order they were made: while anything is waiting,
    // a new change waits behind it.
    const waiting = (await myOutbox()).some((i) => i.state === "pending");
    if (!isOffline() && !waiting) {
      try {
        return await network(url, { ...init, body: bodyText ?? undefined }, t.write);
      } catch (e) {
        if (!(e instanceof NetworkDown)) throw e;
      }
    }

    // Offline: fill the times the database would have, from the phone's clock.
    // A job's Work Completion time is normally stamped by the database when
    // Done arrives; one pressed with no signal must keep the time it was pressed
    // (the orbit2_projects trigger only stamps it when it is empty).
    if (method === "PATCH" && table === "orbit2_projects" && body && typeof body === "object" && !Array.isArray(body)) {
      const b = body as Record<string, unknown>;
      if (typeof b.status === "string" && b.status.startsWith("Complete") && !("work_completed_at" in b)) {
        b.work_completed_at = deps.now().toISOString();
        bodyText = JSON.stringify(body);
      }
    }
    if (method === "POST" && body && typeof body === "object") {
      const now = deps.now().toISOString();
      const rows = Array.isArray(body) ? body : [body];
      for (const r of rows) {
        if (!r || typeof r !== "object") continue;
        for (const col of TIME_DEFAULTS[table] ?? []) if (!(col in r)) (r as Record<string, unknown>)[col] = now;
      }
      bodyText = JSON.stringify(body);
    }

    await queue({
      kind: "rest", table, method, url,
      headers: stripAuth(hdrs), body: bodyText,
      upsert, conflictCols,
      label: TABLE_LABELS[table] ?? "Change",
    });

    if (!wantsRows) return new Response(null, { status: method === "POST" ? 201 : 204, headers: { "x-orbit-queued": "1" } });
    let rows: unknown[];
    if (method === "POST") rows = Array.isArray(body) ? body : [body];
    else if (method === "PATCH") rows = [{ ...eqValues(url), ...(body && typeof body === "object" ? body : {}) }];
    else rows = [];
    return json(asObject ? rows[0] ?? null : rows, method === "POST" ? 201 : 200, { "x-orbit-queued": "1" });
  }

  // ── Files ─────────────────────────────────────────────────────────────────
  async function upload(url: string, init: RequestInit, method: string, hdrs: Record<string, string>, objectPath: string): Promise<Response> {
    const waiting = (await myOutbox()).some((i) => i.state === "pending");
    if (!isOffline() && !waiting) {
      try { return await network(url, init, t.upload); }
      catch (e) { if (!(e instanceof NetworkDown)) throw e; }
    }
    const form: FormEntry[] = [];
    let body: string | null = null;
    const raw = init.body as unknown;
    if (typeof FormData !== "undefined" && raw instanceof FormData) {
      raw.forEach((value, name) => {
        form.push(typeof value === "string" ? { name, value } : { name, value, filename: (value as File).name || "file" });
      });
    } else if (typeof Blob !== "undefined" && raw instanceof Blob) {
      form.push({ name: "__raw__", value: raw });
    } else if (typeof raw === "string") {
      body = raw;
    }
    const headers = stripAuth(hdrs);
    // FormData sets its own boundary when it is rebuilt.
    if (form.length && form[0].name !== "__raw__") delete headers["content-type"];
    await queue({
      kind: "upload", table: null, method, url, headers, body, form, uploadPath: objectPath,
      upsert: false, conflictCols: [], label: "Photo",
    });
    return json({ Key: objectPath, Id: deps.uuid() }, 200, { "x-orbit-queued": "1" });
  }

  async function sign(url: string, init: RequestInit, objectPath: string): Promise<Response> {
    if (!isOffline()) {
      try {
        const res = await network(url, init, t.sign);
        if (res.ok) return res;
      } catch (e) {
        if (!(e instanceof NetworkDown)) throw e;
      }
    }
    // No signal: a link the service worker answers from the photos it has kept
    // (or the photo still waiting in the outbox).
    return json({ signedURL: `/object/sign/${objectPath}?token=offline` }, 200, { "x-orbit-offline": "1" });
  }

  async function otherStorage(url: string, init: RequestInit, method: string, hdrs: Record<string, string>, bodyText: string | null): Promise<Response> {
    if (!isOffline()) {
      try { return await network(url, init, t.write); }
      catch (e) { if (!(e instanceof NetworkDown)) throw e; }
    }
    if (method === "GET" || method === "HEAD") throw new TypeError("Failed to fetch (offline)");
    await queue({
      kind: "storage", table: null, method, url, headers: stripAuth(hdrs), body: bodyText,
      upsert: false, conflictCols: [], label: "File",
    });
    return json([], 200, { "x-orbit-queued": "1" });
  }

  async function queue(part: Omit<OutboxItem, "userId" | "createdAt" | "state" | "attempts">): Promise<void> {
    await deps.store.add({
      ...part,
      userId: deps.currentUserId() ?? "",
      createdAt: deps.now().toISOString(),
      state: "pending",
      attempts: 0,
    });
    deps.onChange();
    if (!isOffline()) void flush();
  }

  // ── The entry point ─────────────────────────────────────────────────────────
  async function offlineFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(base + "/")) return deps.baseFetch(input, init);

    const method = (init.method ?? (typeof input === "object" && "method" in input ? (input as Request).method : "GET")).toUpperCase();
    const hdrs = headerObject(init.headers ?? (typeof input === "object" && "headers" in input ? (input as Request).headers : undefined));
    const path = url.slice(base.length);
    const bodyText = typeof init.body === "string" ? init.body : null;

    if (path.startsWith("/auth/")) {
      // Fail fast with no signal; the session saved on the phone carries on.
      if (isOffline()) throw new TypeError("Failed to fetch (offline)");
      try { return await network(input, init, t.read); }
      catch (e) { if (e instanceof NetworkDown) throw new TypeError("Failed to fetch"); throw e; }
    }

    if (path.startsWith("/rest/v1/")) {
      const isRpc = path.startsWith("/rest/v1/rpc/");
      if (method === "GET" || method === "HEAD" || isRpc) return read(url, init, method, hdrs, isRpc ? bodyText : null);
      return write(url, init, method, hdrs, bodyText);
    }

    const sm = /^\/storage\/v1\/object\/(sign\/)?(.+?)(\?.*)?$/.exec(path);
    if (sm) {
      const objectPath = decodeURIComponent(sm[2]);
      if (sm[1] && method === "POST") return sign(url, init, objectPath);
      const isOp = /^(list|move|copy|info|public|authenticated|upload)\//.test(sm[2]);
      if ((method === "POST" || method === "PUT") && !sm[1] && !isOp) return upload(url, init, method, hdrs, objectPath);
      return otherStorage(url, init, method, hdrs, bodyText);
    }

    // Edge functions, realtime and anything else: straight through.
    return deps.baseFetch(input, init);
  }

  // ── Sending the outbox ──────────────────────────────────────────────────────
  async function doFlush(): Promise<{ sent: number; left: number }> {
    let sent = 0;
    const items = (await myOutbox()).filter((i) => i.state === "pending");
    if (!items.length) return { sent, left: 0 };
    const token = await deps.getAccessToken();
    if (!token) return { sent, left: items.length };

    for (const it of items) {
      const headers: Record<string, string> = { ...it.headers, authorization: `Bearer ${token}` };
      let body: BodyInit | undefined = it.body ?? undefined;
      if (it.form?.length) {
        if (it.form[0].name === "__raw__") body = it.form[0].value as Blob;
        else {
          const fd = new FormData();
          for (const e of it.form) {
            if (typeof e.value === "string") fd.append(e.name, e.value);
            else fd.append(e.name, e.value, e.filename);
          }
          body = fd;
        }
      }
      // Ask for the rows back on an update, so one that matched nothing (the
      // office changed or removed the job first) is reported, not lost quietly.
      if (it.kind === "rest" && it.method === "PATCH") {
        const prefs = (headers["prefer"] ?? "").split(",").map((x) => x.trim()).filter((x) => x && !x.startsWith("return="));
        headers["prefer"] = [...prefs, "return=representation"].join(",");
      }

      let res: Response;
      try {
        res = await network(it.url, { method: it.method, headers, body }, it.kind === "upload" ? t.upload * 1.5 : t.write * 2);
      } catch (e) {
        if (e instanceof NetworkDown) break;
        throw e;
      }

      if (res.ok) {
        if (it.kind === "rest" && it.method === "PATCH") {
          const data = safeJson(await res.text().catch(() => ""));
          if (Array.isArray(data) && data.length === 0) {
            await deps.store.update({ ...it, state: "skipped", error: "Not applied — the office had already changed this job." });
            continue;
          }
        }
        await deps.store.remove(it.seq!);
        sent++;
        continue;
      }

      const text = await res.text().catch(() => "");
      // Already there — a send that timed out earlier did arrive.
      if (/23505|"Duplicate"|already exists/i.test(text)) {
        await deps.store.remove(it.seq!);
        sent++;
        continue;
      }
      // Token trouble or a server hiccup: stop and try again later, in order.
      // Five server errors in a row on the same change: set it aside for the
      // person to see, rather than hold up everything behind it.
      if (res.status === 401 || res.status >= 500 || res.status === 429) {
        if (res.status !== 401 && it.attempts + 1 >= 5) {
          await deps.store.update({ ...it, state: "failed", error: `The server couldn't take this change (error ${res.status}).`, attempts: it.attempts + 1 });
          continue;
        }
        await deps.store.update({ ...it, attempts: it.attempts + 1 });
        break;
      }
      const msg = (safeJson(text) as { message?: string } | undefined)?.message ?? (text.slice(0, 200) || `Error ${res.status}`);
      await deps.store.update({ ...it, state: "failed", error: msg, attempts: it.attempts + 1 });
    }

    const left = (await myOutbox()).filter((i) => i.state === "pending").length;
    return { sent, left };
  }

  async function flush(): Promise<{ sent: number; left: number }> {
    if (flushing) return flushing;
    flushing = (async () => {
      try {
        const r = await doFlush();
        if (r.sent) {
          await deps.store.setMeta("lastSync", deps.now().toISOString()).catch(() => {});
          deps.onSynced();
        }
        return r;
      } finally {
        flushing = null;
        deps.onChange();
      }
    })();
    return flushing;
  }

  return {
    fetch: offlineFetch as typeof fetch,
    flush,
    isOffline,
    markUp,
    markDown,
    pending: async () => (await myOutbox()).filter((i) => i.state === "pending").length,
  };
}

function stripAuth(h: Record<string, string>): Record<string, string> {
  const out = { ...h };
  delete out["authorization"];
  return out;
}

function safeJson(text: string): unknown {
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}
