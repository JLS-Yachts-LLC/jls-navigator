/**
 * Polaris Chats — service worker for the WhatsApp-only app (/chats-app).
 *
 * Two jobs, nothing else:
 *  - keep a copy of the app page and its (content-hashed) files, so the installed
 *    app opens to its own screen rather than the browser's "no connection" page;
 *  - open the right conversation when a new-message alert is clicked. Alerts are
 *    shown by the page (src/components/whatsapp/chats-app.tsx) through this worker,
 *    because some browsers (Android Chrome) refuse `new Notification()` in a page.
 *
 * Served by the Worker at /chats-sw.js with Service-Worker-Allowed: /chats-app, so it
 * never touches the rest of Polaris. No API calls are cached — messages are always live.
 */

export const CHATS_SW = `
const CACHE = 'chats-v1';
const SHELL = '/chats-app';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith('chats-') && k !== CACHE).map((k) => caches.delete(k)));
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
        if (res && res.ok && !res.redirected) { const c = await caches.open(CACHE); await c.put(SHELL, res.clone()); }
        return res;
      } catch {
        return (await caches.match(SHELL)) || new Response('Offline — Polaris Chats needs a connection.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
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

// A new-message alert was clicked: bring the app forward on that conversation.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => new URL(w.url).pathname === SHELL);
    if (win) {
      await win.focus();
      win.postMessage({ type: 'open-thread', contactId: d.contactId, lineId: d.lineId });
      return;
    }
    const q = d.contactId && d.lineId ? '?c=' + encodeURIComponent(d.contactId) + '&l=' + encodeURIComponent(d.lineId) : '';
    await self.clients.openWindow(SHELL + q);
  })());
});
`.trim();

export function chatsPwaHandler(request: Request): Response | null {
  if (request.method !== "GET") return null;
  if (new URL(request.url).pathname !== "/chats-sw.js") return null;
  return new Response(CHATS_SW, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/chats-app",
      // Always re-check, so a fixed worker reaches every computer promptly.
      "Cache-Control": "no-cache",
    },
  });
}
