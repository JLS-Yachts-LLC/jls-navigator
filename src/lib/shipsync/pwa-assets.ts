/**
 * ShipSync driver PWA assets, served by the Worker so they get correct headers
 * and scope on Cloudflare (no static public/ dir in this project).
 *   /shipsync-sw.js            — service worker (offline app shell + asset cache)
 *   /shipsync-driver.webmanifest — installable manifest
 *   /shipsync-icon.svg         — app icon
 */

const SW_JS = `
const CACHE = 'shipsync-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.startsWith('shipsync-') && k !== CACHE).map(k => caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(CACHE); c.put('/shipsync/driver', res.clone());
        return res;
      } catch {
        return (await caches.match('/shipsync/driver')) || (await caches.match(req)) || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }
  if (/\\.(js|css|woff2?|png|svg|ico|json|webmanifest)$/.test(url.pathname) || url.pathname.startsWith('/assets/')) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      const live = fetch(req).then((res) => { if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone())); return res; }).catch(() => cached);
      return cached || live;
    })());
  }
});
`.trim();

const MANIFEST = JSON.stringify({
  name: 'ShipSync Driver',
  short_name: 'ShipSync',
  start_url: '/shipsync/driver',
  scope: '/shipsync/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#0d1520',
  theme_color: '#0d1520',
  icons: [{ src: '/shipsync-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
});

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="96" fill="#0d1520"/>
<g fill="none" stroke="#479EF5" stroke-width="22" stroke-linejoin="round" stroke-linecap="round">
<path d="M120 200 L256 140 L392 200 L256 260 Z"/>
<path d="M120 200 V330 L256 392 V260"/>
<path d="M392 200 V330 L256 392"/>
</g>
<text x="256" y="460" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#479EF5" text-anchor="middle">SS</text>
</svg>`.trim();

export function shipsyncPwaHandler(request: Request): Response | null {
  const url = new URL(request.url);
  if (request.method !== 'GET') return null;
  if (url.pathname === '/shipsync-sw.js') {
    return new Response(SW_JS, { headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/shipsync/',
      'Cache-Control': 'no-cache',
    } });
  }
  if (url.pathname === '/shipsync-driver.webmanifest') {
    return new Response(MANIFEST, { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' } });
  }
  if (url.pathname === '/shipsync-icon.svg') {
    return new Response(ICON_SVG, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' } });
  }
  return null;
}
