/** Photos and signatures kept on the phone while a form is open (so a page reload doesn't lose them). */
import "fake-indexeddb/auto";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { saveDraftFile, loadDraftFile, deleteDraftFile, purgeDrafts, sessionDraftId } from "../logistics-offline";

const DAY = 24 * 60 * 60 * 1000;
const bytes = async (f: Blob) => Array.from(new Uint8Array(await f.arrayBuffer()));

beforeEach(async () => { await purgeDrafts(Date.now() + 100 * DAY); });   // empty it

test("a photo comes back exactly as it was saved, as a File with its name and type", async () => {
  await saveDraftFile("checkin-photo:s1", new File([new Uint8Array([1, 2, 3, 4])], "IMG_7.jpg", { type: "image/jpeg" }));
  const back = await loadDraftFile("checkin-photo:s1");
  assert.ok(back instanceof File);
  assert.equal(back!.name, "IMG_7.jpg");
  assert.equal(back!.type, "image/jpeg");
  assert.deepEqual(await bytes(back!), [1, 2, 3, 4]);
});

test("a signature (a bare Blob) comes back as a PNG file too", async () => {
  await saveDraftFile("later-sig:N1:ORKA", new Blob([new Uint8Array([9, 9, 9])], { type: "image/png" }));
  const back = await loadDraftFile("later-sig:N1:ORKA");
  assert.equal(back!.type, "image/png");
  assert.deepEqual(await bytes(back!), [9, 9, 9]);
});

test("nothing saved means null; deleting removes it; saving again replaces it", async () => {
  assert.equal(await loadDraftFile("nope"), null);
  await saveDraftFile("k", new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" }));
  await saveDraftFile("k", new File([new Uint8Array([2])], "b.jpg", { type: "image/jpeg" }));
  assert.deepEqual(await bytes((await loadDraftFile("k"))!), [2]);
  await deleteDraftFile("k");
  assert.equal(await loadDraftFile("k"), null);
  await deleteDraftFile("k");   // deleting what isn't there is fine
});

test("drafts are kept apart: another boat's photo, and another session's, are never mixed in", async () => {
  await saveDraftFile("handover-photo:s1:N1:ORKA", new File([new Uint8Array([1])], "o.jpg", { type: "image/jpeg" }));
  await saveDraftFile("handover-photo:s1:N1:NIRVANA", new File([new Uint8Array([2])], "n.jpg", { type: "image/jpeg" }));
  assert.deepEqual(await bytes((await loadDraftFile("handover-photo:s1:N1:ORKA"))!), [1]);
  assert.deepEqual(await bytes((await loadDraftFile("handover-photo:s1:N1:NIRVANA"))!), [2]);
  assert.equal(await loadDraftFile("handover-photo:s2:N1:ORKA"), null);
});

test("old drafts are dropped: a form's own after a day, a Complete Later one only after two weeks", async () => {
  const now = Date.now();
  await saveDraftFile("checkin-photo:old", new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" }), now - 2 * DAY);
  await saveDraftFile("checkin-photo:fresh", new File([new Uint8Array([1])], "b.jpg", { type: "image/jpeg" }), now - 1000);
  await saveDraftFile("later-photo:N1:ORKA", new File([new Uint8Array([1])], "c.jpg", { type: "image/jpeg" }), now - 5 * DAY);
  await saveDraftFile("later-photo:N2:ORKA", new File([new Uint8Array([1])], "d.jpg", { type: "image/jpeg" }), now - 20 * DAY);
  assert.equal(await purgeDrafts(now), 2);
  assert.equal(await loadDraftFile("checkin-photo:old"), null);
  assert.ok(await loadDraftFile("checkin-photo:fresh"));
  assert.ok(await loadDraftFile("later-photo:N1:ORKA"), "a handover saved for later survives the week");
  assert.equal(await loadDraftFile("later-photo:N2:ORKA"), null);
});

test("the session id is stable within a session and different between sessions", () => {
  const store = new Map<string, string>();
  (globalThis as any).sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  const a = sessionDraftId();
  assert.equal(sessionDraftId(), a);
  store.clear();
  assert.notEqual(sessionDraftId(), a);
  delete (globalThis as any).sessionStorage;
  assert.equal(sessionDraftId(), "nosession", "blocked storage doesn't throw");
});
