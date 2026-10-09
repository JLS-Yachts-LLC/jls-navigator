/**
 * The Logistics service worker (so the app opens with no signal) and the offline sign-in check.
 * The worker's code is a string; it is run here against small stand-ins for the browser's
 * cache and fetch so what it would do on a phone can be checked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LOGISTICS_SW, logisticsPwaHandler } from "../logistics-pwa";
import { hasStoredSession } from "../stored-session";

const ORIGIN = "https://polaris.test";

function boot(network: (url: string) => Response | Promise<Response>) {
  const stores = new Map<string, Map<string, Response>>();
  const key = (r: Request | string) => new URL(typeof r === "string" ? r : r.url, ORIGIN).href;
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(n: string) { return stores.delete(n); },
    async open(n: string) {
      if (!stores.has(n)) stores.set(n, new Map());
      const m = stores.get(n)!;
      return { async put(r: Request | string, res: Response) { m.set(key(r), res); } };
    },
    async match(r: Request | string) {
      for (const m of stores.values()) { const hit = m.get(key(r)); if (hit) return hit.clone(); }
      return undefined;
    },
  };
  const handlers: Record<string, (e: any) => void> = {};
  const self = { addEventListener: (t: string, f: (e: any) => void) => { handlers[t] = f; }, location: { origin: ORIGIN }, skipWaiting() {}, clients: { claim: async () => {} } };
  const calls: string[] = [];
  const fetchFn = async (req: Request) => { calls.push(req.url); return network(req.url); };
  new Function("self", "caches", "fetch", "Response", "URL", LOGISTICS_SW)(self, caches, fetchFn, Response, URL);

  /** Fire a fetch event; resolves to the response the worker gave, or null if it stayed out of it. */
  async function fire(url: string, init: { method?: string; mode?: string } = {}): Promise<Response | null> {
    const request = Object.assign(new Request(url, { method: init.method ?? "GET" }), {});
    Object.defineProperty(request, "mode", { value: init.mode ?? "no-cors" });
    let answer: Promise<Response> | null = null;
    handlers.fetch({ request, respondWith: (p: Promise<Response>) => { answer = p; } });
    return answer ? await answer : null;
  }
  return { fire, calls, stores, handlers, caches };
}

const ok = (body: string) => new Response(body, { status: 200 });

test("the app page is served from the network when there is one, and a copy is kept", async () => {
  const w = boot(() => ok("PAGE v1"));
  const r = await w.fire(`${ORIGIN}/logistics-app`, { mode: "navigate" });
  assert.equal(await r!.text(), "PAGE v1");
  assert.ok(w.stores.get("logistics-v1")!.has(`${ORIGIN}/logistics-app`));
});

test("with no signal the app page opens from the kept copy", async () => {
  let online = true;
  const w = boot(() => { if (!online) throw new TypeError("Failed to fetch"); return ok("PAGE v1"); });
  await w.fire(`${ORIGIN}/logistics-app`, { mode: "navigate" });
  online = false;
  const r = await w.fire(`${ORIGIN}/logistics-app`, { mode: "navigate" });
  assert.equal(await r!.text(), "PAGE v1");
});

test("a new release is picked up when online (the network wins over the kept copy)", async () => {
  let body = "PAGE v1";
  const w = boot(() => ok(body));
  await w.fire(`${ORIGIN}/logistics-app`, { mode: "navigate" });
  body = "PAGE v2";
  assert.equal(await (await w.fire(`${ORIGIN}/logistics-app`, { mode: "navigate" }))!.text(), "PAGE v2");
  const offline = boot(() => { throw new TypeError("Failed to fetch"); });
  assert.equal((await offline.fire(`${ORIGIN}/logistics-app`, { mode: "navigate" }))!.status, 503, "never opened before + no signal: a plain explanation, not a crash");
});

test("an error page from the server is not kept as the app", async () => {
  let status = 200;
  const w = boot(() => new Response(status === 200 ? "PAGE" : "ERR", { status }));
  await w.fire(`${ORIGIN}/logistics-app`, { mode: "navigate" });
  status = 500;
  await w.fire(`${ORIGIN}/logistics-app`, { mode: "navigate" });
  assert.equal(await (await w.caches.match(`${ORIGIN}/logistics-app`))!.text(), "PAGE");
});

test("built files are kept and served from the copy (they are named by content, so never stale)", async () => {
  let online = true;
  const w = boot(() => { if (!online) throw new TypeError("Failed to fetch"); return ok("JS"); });
  assert.equal(await (await w.fire(`${ORIGIN}/assets/index-ab12.js`))!.text(), "JS");
  online = false;
  assert.equal(await (await w.fire(`${ORIGIN}/assets/index-ab12.js`))!.text(), "JS");
  online = true;
  const before = w.calls.length;
  await w.fire(`${ORIGIN}/assets/index-ab12.js`);
  assert.equal(w.calls.length, before, "a kept file is not downloaded again");
});

test("a built file that was never fetched and can't be now fails cleanly", async () => {
  const w = boot(() => { throw new TypeError("Failed to fetch"); });
  const r = await w.fire(`${ORIGIN}/assets/never.js`);
  assert.equal(r!.type, "error");
});

test("it stays out of everything else: other methods, other sites, API calls, other pages", async () => {
  const w = boot(() => ok("x"));
  assert.equal(await w.fire(`${ORIGIN}/logistics-app`, { method: "POST", mode: "navigate" }), null);
  assert.equal(await w.fire("https://fonts.googleapis.com/css2?family=Jost"), null);
  assert.equal(await w.fire("https://abc.supabase.co/rest/v1/shipsync_packages"), null);
  assert.equal(await w.fire(`${ORIGIN}/api/shipsync/email-pod`), null);
  assert.equal(await w.fire(`${ORIGIN}/dashboard`, { mode: "navigate" }), null);
  assert.equal(w.calls.length, 0);
});

test("on activation only OLD logistics caches are removed", async () => {
  const w = boot(() => ok("x"));
  await w.caches.open("logistics-v0"); await w.caches.open("logistics-v1"); await w.caches.open("shipsync-v1");
  let done: Promise<unknown> = Promise.resolve();
  w.handlers.activate({ waitUntil: (p: Promise<unknown>) => { done = p; } });
  await done;
  assert.deepEqual([...w.stores.keys()].sort(), ["logistics-v1", "shipsync-v1"]);
});

test("the Worker serves the script only at /logistics-sw.js, with the right headers", async () => {
  const r = logisticsPwaHandler(new Request(`${ORIGIN}/logistics-sw.js`))!;
  assert.equal(r.headers.get("content-type"), "application/javascript; charset=utf-8");
  assert.equal(r.headers.get("service-worker-allowed"), "/logistics-app");
  assert.equal(r.headers.get("cache-control"), "no-cache");
  assert.equal(await r.text(), LOGISTICS_SW);
  assert.equal(logisticsPwaHandler(new Request(`${ORIGIN}/other.js`)), null);
  assert.equal(logisticsPwaHandler(new Request(`${ORIGIN}/logistics-sw.js`, { method: "POST" })), null);
});

// ── still signed in on the phone? ────────────────────────────────────────────

const store = (entries: Record<string, string>) => ({
  length: Object.keys(entries).length,
  key: (i: number) => Object.keys(entries)[i] ?? null,
  getItem: (k: string) => entries[k] ?? null,
});

test("a refresh token on the phone means still signed in", () => {
  assert.equal(hasStoredSession(store({ "sb-abcdef-auth-token": JSON.stringify({ access_token: "old", refresh_token: "r1" }) })), true);
});

test("no session, no refresh token, other storage keys, or unreadable storage all mean signed out", () => {
  assert.equal(hasStoredSession(store({})), false);
  assert.equal(hasStoredSession(store({ "sb-abcdef-auth-token": JSON.stringify({ access_token: "old" }) })), false);
  assert.equal(hasStoredSession(store({ "something-else": JSON.stringify({ refresh_token: "r1" }) })), false);
  assert.equal(hasStoredSession(store({ "sb-abcdef-auth-token": "{not json" })), false);
  assert.equal(hasStoredSession(null), false);
});
