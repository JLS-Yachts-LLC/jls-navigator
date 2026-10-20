/**
 * The Polaris Chats service worker: served only at /chats-sw.js, scoped to the app,
 * and a clicked new-message alert opens (or focuses) the app on that conversation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHATS_SW, chatsPwaHandler } from "../chats-pwa";

const ORIGIN = "https://polaris.test";

test("the Worker serves the script only at /chats-sw.js, with the right headers", async () => {
  const r = chatsPwaHandler(new Request(`${ORIGIN}/chats-sw.js`))!;
  assert.equal(r.headers.get("content-type"), "application/javascript; charset=utf-8");
  assert.equal(r.headers.get("service-worker-allowed"), "/chats-app");
  assert.equal(r.headers.get("cache-control"), "no-cache");
  assert.equal(await r.text(), CHATS_SW);
  assert.equal(chatsPwaHandler(new Request(`${ORIGIN}/other.js`)), null);
  assert.equal(chatsPwaHandler(new Request(`${ORIGIN}/chats-sw.js`, { method: "POST" })), null);
});

/** Runs the worker's code against a stand-in `self` and returns its click handler. */
function boot(windows: Array<{ url: string }>) {
  const handlers: Record<string, (e: any) => void> = {};
  const log: string[] = [];
  const clients = windows.map((w) => ({
    url: w.url,
    async focus() { log.push(`focus ${w.url}`); },
    postMessage(m: any) { log.push(`post ${JSON.stringify(m)}`); },
  }));
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (e: any) => void) => { handlers[type] = fn; },
    clients: {
      async matchAll() { return clients; },
      async openWindow(u: string) { log.push(`open ${u}`); },
      async claim() {},
    },
    skipWaiting() {},
  };
  new Function("self", "caches", "fetch", CHATS_SW)(self, {}, async () => new Response(""));
  const click = async (data: unknown) => {
    let done: Promise<unknown> = Promise.resolve();
    handlers.notificationclick({ notification: { data, close() { log.push("close"); } }, waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
  };
  return { click, log };
}

test("clicking an alert focuses the open app and tells it which conversation", async () => {
  const w = boot([{ url: `${ORIGIN}/dashboard` }, { url: `${ORIGIN}/chats-app` }]);
  await w.click({ contactId: "c1", lineId: "l1" });
  assert.deepEqual(w.log, ["close", `focus ${ORIGIN}/chats-app`, `post {"type":"open-thread","contactId":"c1","lineId":"l1"}`]);
});

test("clicking an alert with the app closed opens it on that conversation", async () => {
  const w = boot([{ url: `${ORIGIN}/dashboard` }]);
  await w.click({ contactId: "c 1", lineId: "l1" });
  assert.deepEqual(w.log, ["close", "open /chats-app?c=c%201&l=l1"]);
});
