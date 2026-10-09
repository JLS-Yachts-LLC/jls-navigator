/**
 * The one-time "shrink old photos" job: back up the original, write the small one to the SAME path, read it back,
 * and never lose the original.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeBackend } from "../../../components/logistics/__tests__/fake-backend";

const be = new FakeBackend();
let mod: typeof import("../shrink-old-photos");

before(async () => {
  await be.start();
  process.env.SUPABASE_URL = be.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.SUPABASE_PUBLISHABLE_KEY = "anon";
  mod = await import("../shrink-old-photos");
});
after(async () => { await be.stop(); });
beforeEach(() => be.reset());

const P = "packages/abc/item_1.jpg";
const big = () => Buffer.alloc(2_000_000, 7);
const small = () => new Blob([Buffer.alloc(150_000, 9)], { type: "image/jpeg" });

test("a big photo is backed up, replaced at the same path, and verified", async () => {
  be.files.set(`shipsync/${P}`, big());
  const r = await mod.shrinkOne(P, async () => small());
  assert.equal(r.kind, "shrunk");
  assert.equal(be.files.get(`shipsync/${P}`)!.length, 150_000, "the photo at its address is now the small one");
  assert.equal(be.files.get(`shipsync/originals/${P}`)!.length, 2_000_000, "the original is kept in originals/");
});

test("a photo that is already small is left completely alone (no backup, no write)", async () => {
  be.files.set(`shipsync/${P}`, Buffer.alloc(300_000, 1));
  const r = await mod.shrinkOne(P, async () => { throw new Error("must not be called"); });
  assert.equal(r.kind, "skipped");
  assert.equal(be.uploads.length, 0);
  assert.equal(be.files.has(`shipsync/originals/${P}`), false);
});

test("if the result isn't meaningfully smaller, nothing is touched", async () => {
  be.files.set(`shipsync/${P}`, big());
  const r = await mod.shrinkOne(P, async () => new Blob([Buffer.alloc(1_900_000, 2)], { type: "image/jpeg" }));
  assert.equal(r.kind, "skipped");
  assert.equal(be.files.get(`shipsync/${P}`)!.length, 2_000_000);
  assert.equal(be.files.has(`shipsync/originals/${P}`), false);
});

test("if the backup can't be made, the photo is NOT replaced", async () => {
  be.files.set(`shipsync/${P}`, big());
  be.faults.push({ match: /POST \/storage\/v1\/object\/copy/, fault: 500 });
  const r = await mod.shrinkOne(P, async () => small());
  assert.equal(r.kind, "failed");
  assert.equal(be.files.get(`shipsync/${P}`)!.length, 2_000_000, "original still in place");
});

test("if writing the small one fails, the original is still there", async () => {
  be.files.set(`shipsync/${P}`, big());
  be.faults.push({ match: /POST \/storage\/v1\/object\/shipsync\/packages/, fault: 500 });
  const r = await mod.shrinkOne(P, async () => small());
  assert.equal(r.kind, "failed");
  assert.equal(be.files.get(`shipsync/${P}`)!.length, 2_000_000);
});

test("running it again after a run: the backup is never overwritten with the small copy, and it finishes as 'already small'", async () => {
  be.files.set(`shipsync/${P}`, big());
  await mod.shrinkOne(P, async () => small());
  const again = await mod.shrinkOne(P, async () => small());
  assert.equal(again.kind, "skipped");
  assert.equal(be.files.get(`shipsync/originals/${P}`)!.length, 2_000_000);
});

test("a backup left by an earlier interrupted run is kept, and the job carries on", async () => {
  be.files.set(`shipsync/${P}`, big());
  be.files.set(`shipsync/originals/${P}`, Buffer.alloc(2_000_000, 7));   // earlier run copied, then stopped
  const r = await mod.shrinkOne(P, async () => small());
  assert.equal(r.kind, "shrunk");
  assert.equal(be.files.get(`shipsync/originals/${P}`)!.length, 2_000_000);
});
