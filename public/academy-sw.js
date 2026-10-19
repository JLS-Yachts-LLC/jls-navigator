/*
 * Crew Academy — service worker (scope /academy only).
 *
 * Just enough for the page to open with no signal:
 *  - the /academy page: from the network first (that's how updates arrive), the
 *    saved copy when the network doesn't answer within a few seconds;
 *  - its scripts, styles and fonts: saved as they load (built files are named by
 *    their content, so a saved one is never out of date).
 *
 * Course content and files are NOT handled here — the page saves the courses a
 * crew member chooses ("Save for offline") into its own store
 * (src/components/academy/academy-offline.ts) and wipes it on sign-out. This
 * worker never sees or stores API answers or sign-in tokens.
 * Registered only by /academy, so the rest of Polaris is never affected.
 */
const VERSION = "v1";
const SHELL = `academy-shell-${VERSION}`;
const ASSETS = `academy-assets-${VERSION}`;
const KEEP = [SHELL, ASSETS];
const START = "/academy";
const PAGE_TIMEOUT_MS = 6000;
const MAX_ASSETS = 400;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const res = await fetch(new Request(START, { cache: "reload" }));
      if (res.ok && !res.redirected) {
        await (await caches.open(SHELL)).put(START, res.clone());
        await cacheAssetsFrom(res);
      }
    } catch { /* installed with no signal — the next open fills it in */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if ((k.startsWith("academy-shell-") || k.startsWith("academy-assets-")) && !KEEP.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate") {
    if (url.origin === self.location.origin && (url.pathname === START || url.pathname === `${START}/`)) event.respondWith(page(event));
    return;
  }
  if (url.origin === self.location.origin && (url.pathname.startsWith("/assets/") || /\.(woff2?|ttf|otf)$/.test(url.pathname))) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") event.respondWith(cacheFirst(req));
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function page(event) {
  const shell = await caches.open(SHELL);
  const fresh = fetch(event.request).then(async (res) => {
    if (res.ok && !res.redirected) {
      await shell.put(START, res.clone());
      cacheAssetsFrom(res.clone()).catch(() => {});
    }
    return res;
  });
  try {
    return await withTimeout(fresh, PAGE_TIMEOUT_MS);
  } catch {
    event.waitUntil(fresh.catch(() => {}));
    const saved = await shell.match(START);
    if (saved) return saved;
    return new Response(
      "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><title>Crew Academy</title>" +
      "<body style='font-family:system-ui;padding:32px;background:#0b1220;color:#e8edf5'>" +
      "<h1 style='font-size:20px'>No signal</h1><p>Crew Academy needs a connection the first time it opens on this phone.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    cache.put(req, res.clone()).catch(() => {});
    trim(cache).catch(() => {});
  }
  return res;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i]);
}

/** Save the scripts and styles the page links to, so it can start offline. */
async function cacheAssetsFrom(res) {
  const html = await res.text();
  const urls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  const cache = await caches.open(ASSETS);
  await Promise.all(urls.map((u) => cache.add(u).catch(() => {})));
}
