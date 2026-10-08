/*
 * Client Portal app — service worker (scope /portal only).
 *
 * What it does:
 *  - the /portal page: fetched fresh every time it opens, so a new release is
 *    there straight away. Only when the network doesn't answer (no signal, or a
 *    weak one past the timeout) does the saved copy open instead.
 *  - its scripts, styles, fonts and icons: saved as they load. Built files are
 *    named by their content, so a saved one is never out of date.
 *  - everything else (the portal's data, Supabase, version.json) is left alone:
 *    it always comes from the network.
 *
 * Self-updating: the page itself watches /version.json and reloads onto a new
 * build when it is safe to (src/components/portal/portal-app.tsx). This worker
 * takes over as soon as it installs, so a change to it ships the same way.
 * Registered only by the portal, so the rest of Polaris is never affected.
 */
const VERSION = "v1";
const SHELL = `portal-shell-${VERSION}`;
const ASSETS = `portal-assets-${VERSION}`;
const KEEP = [SHELL, ASSETS];
const START = "/portal";
const MAX_ASSETS = 400;
const PAGE_TIMEOUT_MS = 6000;

const STATIC = [
  "/portal-icons/icon-192.png", "/portal-icons/icon-512.png",
  "/portal-icons/icon-maskable-512.png", "/portal-icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const assets = await caches.open(ASSETS);
    await Promise.all(STATIC.map((u) => assets.add(u).catch(() => {})));
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
    for (const k of await caches.keys()) if (k.startsWith("portal-") && !KEEP.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    if (url.origin === self.location.origin && (url.pathname === START || url.pathname === `${START}/`)) {
      event.respondWith(page(event));
    }
    return;
  }
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/portal-icons/")
      || /\.(woff2?|ttf|otf)$/.test(url.pathname)) {
      event.respondWith(cacheFirst(req));
    }
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(req));
  }
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** The portal page: the network first (that's how updates arrive), the saved copy without signal. */
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
    // Keep saving the fresh copy in the background if it's only slow.
    event.waitUntil(fresh.catch(() => {}));
    const saved = await shell.match(START);
    if (saved) return saved;
    return new Response(
      "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><title>JLS Yachts</title>" +
      "<body style='font-family:system-ui;padding:32px;background:#0D1E44;color:#F0F4F8'>" +
      "<h1 style='font-size:22px'>No signal</h1><p style='font-size:16px;line-height:1.6'>" +
      "The Client Portal needs a connection the first time it opens. Try again when you have signal.</p>",
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
async function cacheFirst(req) {
  const cache = await caches.open(ASSETS);
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

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
