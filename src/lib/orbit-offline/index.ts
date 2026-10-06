/**
 * Orbit field app offline — wiring it into the browser.
 *
 * The crew often have no mobile signal on the quay. On the field app's pages
 * (/orbit-app) only:
 *
 *  1. supabase-js calls go through the offline layer (./offline-fetch): reads
 *     are saved on the phone and served from there with no signal; changes made
 *     with no signal wait in an outbox and are sent, in order, when it returns.
 *     supabase-js looks up the global fetch on every call, so the layer is put
 *     in front of window.fetch — and steps aside on any other page.
 *  2. The sign-in saved on the phone keeps the person signed in with no signal.
 *     Supabase's own getSession tries to refresh an expired token first, and with
 *     no network it keeps retrying for ~25 s — which would stall every screen.
 *  3. A service worker (public/orbit-sw.js) keeps the app itself on the phone, so
 *     it opens with no signal, along with photos already seen.
 *
 * Testing: localStorage "orbit-offline-sim" = "1" makes the app behave as if it
 * had no signal (reads from the phone, changes to the outbox).
 */
import { supabase } from "@/integrations/supabase/client";
import { createOfflineLayer, type OfflineLayer } from "./offline-fetch";
import { idbStore, type OutboxItem } from "./store";

export const ORBIT_FIELD_PREFIX = "/orbit-app";
export const ORBIT_OFFLINE_EVENT = "orbit-offline-changed";
export const ORBIT_SYNCED_EVENT = "orbit-offline-synced";
const SIM_KEY = "orbit-offline-sim";
const FRESH_KEY = "orbit-offline-last-fresh";
const PROBE_MS = 20_000;

let layer: OfflineLayer | null = null;
let originalFetch: typeof fetch | null = null;
let realGetSession: (() => Promise<any>) | null = null;

const onFieldApp = () => typeof location !== "undefined" && location.pathname.startsWith(ORBIT_FIELD_PREFIX);
const simOn = () => { try { return localStorage.getItem(SIM_KEY) === "1"; } catch { return false; } };

/** The Supabase session saved on this phone, read directly (no network). */
export function storedSession(): { access_token: string; user: { id: string; email?: string } } & Record<string, unknown> | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^sb-.+-auth-token$/.test(k)) continue;
      const s = JSON.parse(localStorage.getItem(k) ?? "null");
      if (s?.access_token && s?.user?.id) return s;
    }
  } catch { /* storage blocked */ }
  return null;
}

const emit = (name: string) => window.dispatchEvent(new Event(name));

/** Put the offline layer in place. Safe to call more than once; a no-op off the field app. */
export function installOrbitOffline(): void {
  if (typeof window === "undefined" || layer || !onFieldApp()) return;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!supabaseUrl || typeof indexedDB === "undefined") return;

  const original = window.fetch.bind(window);
  originalFetch = original;
  layer = createOfflineLayer({
    baseFetch: original,
    supabaseUrl,
    store: idbStore,
    currentUserId: () => storedSession()?.user?.id ?? null,
    getAccessToken: async () => {
      const { data } = await (realGetSession ? realGetSession() : supabase.auth.getSession());
      return data?.session?.access_token ?? null;
    },
    forcedOffline: () => navigator.onLine === false || simOn(),
    uuid: () => crypto.randomUUID(),
    now: () => new Date(),
    onChange: () => emit(ORBIT_OFFLINE_EVENT),
    onSynced: () => emit(ORBIT_SYNCED_EVENT),
    onFresh: () => { try { localStorage.setItem(FRESH_KEY, String(Date.now())); } catch { /* ignore */ } },
  });

  const offlineFetch = layer.fetch;
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    onFieldApp() ? offlineFetch(input, init) : original(input, init)) as typeof fetch;

  patchGetSession();

  window.addEventListener("online", () => void probe());
  window.addEventListener("offline", () => { layer?.markDown(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void probe(); });
  window.setInterval(() => void probe(), PROBE_MS);
  void probe(anonKey);

  registerServiceWorker();
}

/** Keep the person signed in with no signal (see the note at the top). */
function patchGetSession(): void {
  const auth = supabase.auth as unknown as { getSession: () => Promise<any> };
  const orig = auth.getSession.bind(auth);
  realGetSession = orig;
  auth.getSession = async () => {
    if (!onFieldApp() || !layer) return orig();
    const saved = storedSession();
    if (layer.isOffline() && saved) return { data: { session: saved }, error: null };
    const res = await Promise.race([orig(), new Promise((r) => setTimeout(() => r(null), 6000))]);
    if (res) return res;
    // A refresh that is hanging means there's no real connection.
    layer.markDown();
    return { data: { session: saved }, error: null };
  };
}

let probing = false;
/** Is the connection back? If so, send whatever is waiting. */
async function probe(anonKey?: string): Promise<void> {
  if (!layer || probing || !onFieldApp()) return;
  if (navigator.onLine === false || simOn()) { layer.markDown(); emit(ORBIT_OFFLINE_EVENT); return; }
  probing = true;
  try {
    if (layer.isOffline()) {
      const key = anonKey ?? (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? "";
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      try {
        await originalFetch!(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`, { headers: { apikey: key }, signal: ctrl.signal });
        layer.markUp();
      } catch {
        return;
      } finally {
        clearTimeout(timer);
      }
    }
    if ((await layer.pending()) > 0) await layer.flush();
  } finally {
    probing = false;
  }
}

function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/orbit-sw.js", { scope: ORBIT_FIELD_PREFIX })
    .then(async (reg) => {
      await navigator.serviceWorker.ready;
      // The page's first scripts loaded before the worker was in charge — hand
      // it the list so the app can open next time with no signal.
      const urls = performance.getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => u.startsWith(location.origin + "/assets/") || /fonts\.(googleapis|gstatic)\.com/.test(u));
      (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ type: "cache-urls", urls: [location.origin + ORBIT_FIELD_PREFIX, ...urls] });
      void reg.update().catch(() => {});
    })
    .catch(() => { /* offline support is a bonus, never a blocker */ });
}

// ── Pre-loading ─────────────────────────────────────────────────────────────

let lastPrefetch = { key: "", at: 0 };
const PREFETCH_EVERY_MS = 5 * 60_000;
const MAX_PREFETCH_PHOTOS = 40;

const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * With signal, load everything the person's jobs will need — attendance,
 * comments, photos, checklists, inventory — so a job they never opened works
 * with no signal later. Called after the job list loads; at most every five
 * minutes for the same set of jobs.
 */
export async function prefetchFieldJobs(p: { projectIds: string[]; boatTaskIds: string[]; boatIds: string[] }): Promise<void> {
  if (!layer || layer.isOffline() || !onFieldApp()) return;
  const key = [p.projectIds, p.boatTaskIds, p.boatIds].map((x) => [...x].sort().join(",")).join("|");
  if (key === lastPrefetch.key && Date.now() - lastPrefetch.at < PREFETCH_EVERY_MS) return;
  lastPrefetch = { key, at: Date.now() };

  const sb = supabase as any;
  const reads: Promise<{ data: unknown }>[] = [];
  for (const table of ["orbit2_attendance", "orbit2_notes", "orbit2_files"]) {
    for (const ids of chunks(p.projectIds, 50)) reads.push(sb.from(table).select("*").in("project_id", ids));
    for (const ids of chunks(p.boatTaskIds, 50)) reads.push(sb.from(table).select("*").in("boat_task_id", ids));
  }
  if (p.boatIds.length) {
    for (const ids of chunks(p.boatIds, 50)) {
      reads.push(sb.from("orbit2_boat_inventory").select("*").in("boat_id", ids));
      reads.push(sb.from("orbit2_boat_checklist").select("*").in("boat_id", ids));
    }
    reads.push(sb.from("orbit2_checklist_templates").select("*").eq("active", true));
    reads.push(sb.from("orbit2_checklist_forms").select("*").eq("active", true));
  }
  const results = await Promise.allSettled(reads);

  // Job photos too, newest first, so they show with no signal (kept by the service worker).
  if (!navigator.serviceWorker?.controller) return;
  const photos = results
    .flatMap((r) => (r.status === "fulfilled" && Array.isArray(r.value?.data) ? r.value.data : []))
    .filter((f: any) => f?.slot === "image" && typeof f.storage_ref === "string")
    .sort((a: any, b: any) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .slice(0, MAX_PREFETCH_PHOTOS);
  if (!photos.length) return;
  const { resolveSignedUrl } = await import("@/lib/signed-url");
  for (const f of photos as { storage_ref: string }[]) {
    if (layer.isOffline()) return;
    try {
      const url = await resolveSignedUrl(f.storage_ref);
      if (url) await originalFetch!(url, { mode: "cors", credentials: "omit" }).catch(() => {});
    } catch { /* skip that photo */ }
  }
}

// ── For the screen ───────────────────────────────────────────────────────────

export type OfflineStatus = {
  offline: boolean;
  /** Changes waiting to be sent. */
  pending: number;
  /** Changes that couldn't be sent (refused, or overtaken by the office). */
  problems: OutboxItem[];
  /** When the app last had fresh data from the server (ms), if ever. */
  lastFresh: number | null;
};

export async function readStatus(): Promise<OfflineStatus> {
  const uid = storedSession()?.user?.id ?? null;
  let items: OutboxItem[] = [];
  try { items = (await idbStore.outbox()).filter((i) => i.userId === uid); } catch { /* no IndexedDB */ }
  let lastFresh: number | null = null;
  try { lastFresh = Number(localStorage.getItem(FRESH_KEY)) || null; } catch { /* ignore */ }
  return {
    offline: layer ? layer.isOffline() : (typeof navigator !== "undefined" && navigator.onLine === false),
    pending: items.filter((i) => i.state === "pending").length,
    problems: items.filter((i) => i.state !== "pending"),
    lastFresh,
  };
}

/** Try to send now (the person tapped "Send now"). */
export async function sendNow(): Promise<void> { await probe(); }

/** Drop a change that couldn't be sent. */
export async function discardChange(seq: number): Promise<void> {
  await idbStore.remove(seq);
  emit(ORBIT_OFFLINE_EVENT);
}

/** Put a refused change back in line and try again. */
export async function retryChange(item: OutboxItem): Promise<void> {
  await idbStore.update({ ...item, state: "pending", error: undefined });
  emit(ORBIT_OFFLINE_EVENT);
  await probe();
}
