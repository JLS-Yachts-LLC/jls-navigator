/**
 * Signed links for stored photos/files. The bug these guard against: a long board
 * asked for every link at once, one request each; the gateway timed some out and
 * that photo showed broken (looking "not uploaded" though it was stored).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createUrlSigner, parseStorageRef, type SignFn } from "../signed-url";

const fast = { delayMs: 1, retryDelayMs: 1 };
const ok = (bucket: string, paths: string[]) => paths.map((p) => ({ signedUrl: `https://signed/${bucket}/${p}?t=1` }));

function counting(over: Partial<{ fail: number }> = {}) {
  let failures = over.fail ?? 0;
  const calls: { bucket: string; paths: string[] }[] = [];
  const sign: SignFn = async (bucket, paths) => {
    calls.push({ bucket, paths: [...paths] });
    if (failures > 0) { failures--; throw new Error("gateway timeout"); }
    return ok(bucket, paths);
  };
  return { sign, calls };
}

test("a thousand photos asked for at once are signed in a handful of calls, each with its own link", async () => {
  const { sign, calls } = counting();
  const s = createUrlSigner(sign, fast);
  const paths = Array.from({ length: 1000 }, (_, i) => `packages/${i}/item.jpg`);
  const urls = await Promise.all(paths.map((p) => s.resolve("shipsync", p)));
  assert.equal(calls.length, 10, "1000 links / 100 per call");
  assert.ok(calls.every((c) => c.paths.length <= 100));
  paths.forEach((p, i) => assert.equal(urls[i], `https://signed/shipsync/${p}?t=1`, `link ${i} belongs to its own path`));
});

test("the same photo asked for many times at once is signed once", async () => {
  const { sign, calls } = counting();
  const s = createUrlSigner(sign, fast);
  const urls = await Promise.all(Array.from({ length: 50 }, () => s.resolve("shipsync", "a.jpg")));
  assert.equal(new Set(urls).size, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].paths, ["a.jpg"]);
});

test("a link already fetched is reused, not asked for again", async () => {
  const { sign, calls } = counting();
  const s = createUrlSigner(sign, fast);
  await s.resolve("shipsync", "a.jpg");
  await s.resolve("shipsync", "a.jpg");
  assert.equal(calls.length, 1);
});

test("a link close to expiry is signed again", async () => {
  const { sign, calls } = counting();
  let t = 0;
  const s = createUrlSigner(sign, { ...fast, now: () => t, refreshMs: 1000 });
  await s.resolve("shipsync", "a.jpg");
  t = 999; await s.resolve("shipsync", "a.jpg");
  assert.equal(calls.length, 1);
  t = 1001; await s.resolve("shipsync", "a.jpg");
  assert.equal(calls.length, 2);
});

test("different buckets are signed separately", async () => {
  const { sign, calls } = counting();
  const s = createUrlSigner(sign, fast);
  const [a, b] = await Promise.all([s.resolve("shipsync", "x.jpg"), s.resolve("crew-docs", "x.jpg")]);
  assert.notEqual(a, b);
  assert.deepEqual(calls.map((c) => c.bucket).sort(), ["crew-docs", "shipsync"]);
});

test("a timed-out call is retried and the photo still comes through", async () => {
  const { sign, calls } = counting({ fail: 2 });
  const s = createUrlSigner(sign, { ...fast, retries: 2 });
  assert.equal(await s.resolve("shipsync", "a.jpg"), "https://signed/shipsync/a.jpg?t=1");
  assert.equal(calls.length, 3);
});

test("when every attempt fails the caller gets null — and the failure is NOT remembered", async () => {
  const { sign, calls } = counting({ fail: 3 });
  const s = createUrlSigner(sign, { ...fast, retries: 2 });
  assert.equal(await s.resolve("shipsync", "a.jpg"), null);
  assert.equal(calls.length, 3);
  // next time the photo is shown (e.g. the board is reopened) it is simply asked for again, and works
  assert.equal(await s.resolve("shipsync", "a.jpg"), "https://signed/shipsync/a.jpg?t=1");
});

test("one path that can't be signed does not take down its neighbours", async () => {
  const sign: SignFn = async (_b, paths) => paths.map((p) => ({ signedUrl: p === "gone.jpg" ? null : `https://signed/${p}` }));
  const s = createUrlSigner(sign, fast);
  const [good, bad, good2] = await Promise.all([s.resolve("b", "a.jpg"), s.resolve("b", "gone.jpg"), s.resolve("b", "c.jpg")]);
  assert.equal(good, "https://signed/a.jpg");
  assert.equal(bad, null);
  assert.equal(good2, "https://signed/c.jpg");
});

test("requests that arrive while a batch is being signed are picked up afterwards", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const calls: string[][] = [];
  const sign: SignFn = async (b, paths) => { calls.push([...paths]); if (calls.length === 1) await gate; return ok(b, paths); };
  const s = createUrlSigner(sign, fast);
  const first = s.resolve("b", "one.jpg");
  await new Promise((r) => setTimeout(r, 15));             // first batch is now in flight
  const second = s.resolve("b", "two.jpg");
  release();
  assert.match((await first)!, /one\.jpg/);
  assert.match((await second)!, /two\.jpg/);
  assert.deepEqual(calls, [["one.jpg"], ["two.jpg"]]);
});

test("storage references parse from the shapes the app stores", () => {
  assert.deepEqual(parseStorageRef("shipsync/packages/1/item.jpg"), { bucket: "shipsync", path: "packages/1/item.jpg" });
  assert.deepEqual(parseStorageRef("https://x.supabase.co/storage/v1/object/public/shipsync/a/b.jpg"), { bucket: "shipsync", path: "a/b.jpg" });
  assert.deepEqual(parseStorageRef("https://x.supabase.co/storage/v1/object/sign/shipsync/a%20b.jpg?token=1"), { bucket: "shipsync", path: "a b.jpg" });
  assert.equal(parseStorageRef("https://example.com/photo.jpg"), null);
  assert.equal(parseStorageRef(""), null);
});
