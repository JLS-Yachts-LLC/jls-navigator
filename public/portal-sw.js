/*
 * Client Portal app — service worker (scope /portal only).
 *
 * What it does:
 *  - the /portal page: fetched fresh every time it opens, so a new release is
 *    there straight away. Only when the network doesn't answer (no signal, or a
 *    weak one past the timeout) does the saved copy open instead.
 *  - its scripts, styles, fonts and icons: saved as they load. Built files are
 *    named by their content, so a saved one is never out of date.
 *  - the vessel's data (portal API reads and Supabase reads): from the network
 *    when there is one, and saved as it arrives — so with no signal the app shows
 *    what was last loaded. Never writes, never staff previews. The page clears
 *    this store when someone signs out or a different person signs in.
 *  - notifications: shows what the server pushes (src/lib/portal/push.server.ts)
 *    and opens the right section when one is tapped.
 *
 * Self-updating: the page itself watches /version.json and reloads onto a new
 * build when it is safe to (src/components/portal/portal-app.tsx). This worker
 * takes over as soon as it installs, so a change to it ships the same way.
 * Registered only by the portal, so the rest of Polaris is never affected.
 */
const VERSION = "v2";
const SHELL = `portal-shell-${VERSION}`;
const ASSETS = `portal-assets-${VERSION}`;
const DATA = `portal-data-${VERSION}`;
const KEEP = [SHELL, ASSETS, DATA];
const START = "/portal";
const MAX_ASSETS = 400;
const PAGE_TIMEOUT_MS = 6000;
const DATA_TIMEOUT_MS = 8000;
const MAX_DATA = 600;

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
    // The portal's own API reads — not notifications, not staff previews.
    if (url.pathname.startsWith("/api/portal/") && !url.pathname.startsWith("/api/portal/push")
      && !req.headers.has("X-Portal-Preview")) {
      event.respondWith(data(event));
      return;
    }
    if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/portal-icons/")
      || /\.(woff2?|ttf|otf)$/.test(url.pathname)) {
      event.respondWith(cacheFirst(req));
    }
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(req));
    return;
  }
  // The vessel's data from Supabase (reads only; sign-in and storage are left alone).
  if (url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/rest/v1/")) {
    event.respondWith(data(event));
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

/**
 * A data read: the network when it answers in time (and saved), else the saved
 * copy. Keyed by URL plus the vessel on screen, since a login with several
 * vessels asks the same URLs for each.
 */
async function data(event) {
  const req = event.request;
  // Staff previewing a client's portal: straight through, nothing saved on their computer.
  const page = event.clientId ? await self.clients.get(event.clientId) : null;
  if (page && new URL(page.url).searchParams.has("previewCaptain")) return fetch(req);
  const cache = await caches.open(DATA);
  const key = req.url + "#" + (req.headers.get("X-Portal-Yacht") || "");
  try {
    const res = await withTimeout(fetch(req), DATA_TIMEOUT_MS);
    const type = res.headers.get("content-type") || "";
    if (res.ok && type.includes("json")) cache.put(key, res.clone()).then(() => trim(cache, MAX_DATA)).catch(() => {});
    return res;
  } catch {
    const saved = await cache.match(key);
    if (saved) return saved;
    return new Response(JSON.stringify({ error: "You're offline, and this hasn't been loaded on this phone before." }),
      { status: 503, headers: { "content-type": "application/json" } });
  }
}

// The page asks for the saved data to go (sign-out, or a different person signing in).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear-data") event.waitUntil(caches.delete(DATA));
});

self.addEventListener("push", (event) => {
  let n = {};
  try { n = event.data ? event.data.json() : {}; } catch { n = { title: "JLS Yachts", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(n.title || "JLS Yachts", {
    body: n.body || "",
    icon: "/portal-icons/icon-192.png",
    badge: "/portal-icons/icon-192.png",
    tag: n.tag || undefined,
    renotify: !!n.tag,
    data: { url: n.url || "/portal" },
  }));
});

// Tapping a notification opens the app on that section (or brings it forward).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/portal", self.location.origin).href;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of open) {
      if (new URL(c.url).pathname.startsWith(START)) { await c.focus(); return c.navigate(target).catch(() => {}); }
    }
    return self.clients.openWindow(target);
  })());
});

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
