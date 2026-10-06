/*
 * Orbit field app — service worker (scope /orbit-app only).
 *
 * Keeps the app itself on the phone so it opens with no signal:
 *  - the /orbit-app page: network first, the saved copy when there is no signal
 *  - its scripts, styles, fonts and icons: saved as they load
 *  - job photos seen or pre-loaded by the app: saved, and shown with no signal
 *  - a photo taken with no signal: shown from the outbox until it has been sent
 *
 * Data (jobs, notes, attendance…) is not handled here — the page's offline layer
 * (src/lib/orbit-offline) does that. Registered only by the field app, so the
 * rest of Polaris is never affected.
 */
const VERSION = "v1";
const SHELL = `orbit-shell-${VERSION}`;
const ASSETS = `orbit-assets-${VERSION}`;
const PHOTOS = `orbit-photos-${VERSION}`;
const KEEP = [SHELL, ASSETS, PHOTOS];
const START = "/orbit-app";
const MAX_ASSETS = 400;
const MAX_PHOTOS = 200;

const STATIC = ["/orbit-app.webmanifest", "/orbit-icons/icon-192.png", "/orbit-icons/icon-512.png", "/orbit-icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const assets = await caches.open(ASSETS);
    await Promise.all(STATIC.map((u) => assets.add(u).catch(() => {})));
    try {
      const res = await fetch(new Request(START, { cache: "reload" }));
      if (res.ok) {
        await (await caches.open(SHELL)).put(START, res.clone());
        await cacheAssetsFrom(res);
      }
    } catch { /* installed with no signal — the page will fill it in */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("orbit-") && !KEEP.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

// The page sends what it loaded before this worker was in charge.
self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type !== "cache-urls" || !Array.isArray(msg.urls)) return;
  event.waitUntil((async () => {
    const assets = await caches.open(ASSETS);
    for (const u of msg.urls) {
      try {
        const url = new URL(u);
        if (url.origin === self.location.origin && url.pathname === START) {
          if (!(await (await caches.open(SHELL)).match(START))) {
            const res = await fetch(START);
            if (res.ok && !res.redirected) await (await caches.open(SHELL)).put(START, res);
          }
          continue;
        }
        if (!(await assets.match(u))) {
          const res = await fetch(u, { mode: url.origin === self.location.origin ? "same-origin" : "cors", credentials: "omit" });
          if (res.ok) await assets.put(u, res);
        }
      } catch { /* skip */ }
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    if (url.origin === self.location.origin && url.pathname.startsWith(START)) event.respondWith(page(event));
    return;
  }
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/orbit-icons/")
      || url.pathname.endsWith(".webmanifest") || /\.(woff2?|ttf|otf)$/.test(url.pathname)) {
      event.respondWith(cacheFirst(req, ASSETS));
    }
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(req, ASSETS));
    return;
  }
  // Job photos — shown in the app, or pre-loaded by it for later.
  if (url.hostname.endsWith(".supabase.co") && url.pathname.includes("/storage/v1/object/sign/")) {
    event.respondWith(photo(url));
  }
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * The app page. The saved copy opens at once — waiting on a weak or absent
 * signal would leave the crew staring at a blank screen — and a fresh copy is
 * fetched alongside for next time (so a new release arrives on the next open).
 */
async function page(event) {
  const req = event.request;
  const shell = await caches.open(SHELL);
  const fresh = fetch(req).then(async (res) => {
    if (res.ok && !res.redirected) {
      await shell.put(START, res.clone());
      cacheAssetsFrom(res.clone()).catch(() => {});
    }
    return res;
  });
  const saved = await shell.match(START);
  if (saved) {
    event.waitUntil(fresh.catch(() => {}));
    return saved;
  }
  try {
    return await withTimeout(fresh, 15000);
  } catch {
    return new Response(
      "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><title>Orbit</title>" +
      "<body style='font-family:system-ui;padding:32px;background:#07112A;color:#EFF1F6'>" +
      "<h1 style='font-size:22px'>No signal</h1><p style='font-size:16px;line-height:1.6'>Open Orbit once with signal and it will work offline after that.</p>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}

/** Save every script and style a fresh copy of the page refers to (after a deploy too). */
async function cacheAssetsFrom(res) {
  const html = await res.text();
  const assets = await caches.open(ASSETS);
  const urls = new Set();
  for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) urls.add(m[1]);
  for (const u of urls) {
    if (await assets.match(u)) continue;
    try { const r = await fetch(u); if (r.ok) await assets.put(u, r); } catch { /* skip */ }
  }
  await trim(assets, MAX_ASSETS);
}

/** Built files never change under the same name, so the saved copy is always right. */
async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === "opaque") cache.put(req, res.clone()).then(() => trim(cache, MAX_ASSETS)).catch(() => {});
    return res;
  } catch {
    return Response.error();
  }
}

/** A job photo: from the network when possible (and kept), else the kept copy, else the outbox. */
async function photo(url) {
  const cache = await caches.open(PHOTOS);
  const key = url.origin + url.pathname; // the signed token changes; the photo doesn't
  if (url.searchParams.get("token") !== "offline") {
    try {
      const res = await withTimeout(fetch(url.href, { mode: "cors", credentials: "omit" }), 15000);
      if (res.ok) {
        cache.put(key, res.clone()).then(() => trim(cache, MAX_PHOTOS)).catch(() => {});
        return res;
      }
    } catch { /* fall through */ }
  }
  const hit = await cache.match(key);
  if (hit) return hit;
  const queued = await photoFromOutbox(decodeURIComponent(url.pathname.split("/object/sign/")[1] || ""));
  if (queued) return new Response(queued, { headers: { "content-type": queued.type || "image/jpeg" } });
  return Response.error();
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

/** Same database the page uses (src/lib/orbit-offline/store.ts, DB_VERSION) — same upgrade, so either can create it. */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("orbit-offline", 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("rows")) db.createObjectStore("rows", { keyPath: "k" }).createIndex("ut", ["userId", "table"]);
      if (!db.objectStoreNames.contains("reads")) db.createObjectStore("reads", { keyPath: "key" }).createIndex("savedAt", "savedAt");
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "k" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function photoFromOutbox(objectPath) {
  if (!objectPath) return null;
  try {
    const db = await openDb();
    const items = await new Promise((resolve, reject) => {
      const r = db.transaction("outbox", "readonly").objectStore("outbox").getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
    const it = items.find((i) => i.kind === "upload" && i.uploadPath === objectPath);
    const entry = it && (it.form || []).find((e) => typeof e.value !== "string");
    return entry ? entry.value : null;
  } catch {
    return null;
  }
}
