/**
 * Logistics app — service worker, so the app OPENS with no signal.
 *
 * Without it, the phone only keeps working if the app was already open when the signal
 * dropped; open it in the warehouse dead spot and you get the browser's "no connection"
 * page. This worker keeps a copy of the app page and of its (content-hashed, so never
 * changing) script and style files, and serves them when the network isn't there.
 *
 * Served by the Worker at /logistics-sw.js (like the ShipSync driver one) so it gets the
 * right headers. It deliberately touches nothing else: no API calls, no other pages.
 */

export const LOGISTICS_SW = `
const CACHE = 'logistics-v1';
const SHELL = '/logistics-app';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith('logistics-') && k !== CACHE).map((k) => caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The app page: the network when there is one (so a new release is picked up), else the last copy.
  if (req.mode === 'navigate' && url.pathname === SHELL) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) { const c = await caches.open(CACHE); await c.put(SHELL, res.clone()); }
        return res;
      } catch {
        return (await caches.match(SHELL)) || new Response('Offline — open the app once with a connection first.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Built files are named by their content, so a cached one is never stale.
  if (url.pathname.startsWith('/assets/') || /\\.(woff2?|png|svg|ico|webmanifest)$/.test(url.pathname)) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) { const c = await caches.open(CACHE); await c.put(req, res.clone()); }
        return res;
      } catch { return Response.error(); }
    })());
  }
});
`.trim();

export function logisticsPwaHandler(request: Request): Response | null {
  if (request.method !== 'GET') return null;
  if (new URL(request.url).pathname !== '/logistics-sw.js') return null;
  return new Response(LOGISTICS_SW, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/logistics-app',
      // Always re-check, so a fixed worker reaches phones promptly.
      'Cache-Control': 'no-cache',
    },
  });
}
