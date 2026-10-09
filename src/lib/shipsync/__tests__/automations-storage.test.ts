/**
 * Proof-of-delivery plumbing on the server: reading the signature image back from the
 * private bucket (it used to be fetched as if it were a URL, which always failed and left
 * the signature box on the PDF blank), and making a PDF link that works from an inbox
 * (the email button used to point at a bare "shipsync/..." path).
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeBackend } from "../../../components/logistics/__tests__/fake-backend";

const be = new FakeBackend();
let m: typeof import("../automations.server");

before(async () => {
  await be.start();
  process.env.SUPABASE_URL = be.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.SUPABASE_PUBLISHABLE_KEY = "anon";
  m = await import("../automations.server");
});
after(async () => { await be.stop(); });
beforeEach(() => be.reset());

test("a signature stored as a private bucket reference is read back from storage", async () => {
  be.files.set("shipsync/deliveries/abc/signature_1.png", Buffer.from([137, 80, 78, 71, 1, 2, 3]));
  const bytes = await m.downloadStored("shipsync/deliveries/abc/signature_1.png");
  assert.deepEqual(Array.from(bytes!), [137, 80, 78, 71, 1, 2, 3]);
});

test("a signature stored the OLD way, as a full storage URL, is read too", async () => {
  be.files.set("shipsync/deliveries/abc/signature_2.png", Buffer.from([9, 9]));
  const bytes = await m.downloadStored(`https://x.supabase.co/storage/v1/object/public/shipsync/deliveries/abc/signature_2.png`);
  assert.deepEqual(Array.from(bytes!), [9, 9]);
});

test("a signature that is missing gives null (the PDF just leaves the box blank) rather than throwing", async () => {
  assert.equal(await m.downloadStored("shipsync/deliveries/none/signature.png"), null);
});

test("the PDF link for an email is a real signed https URL, not a bare path", async () => {
  const link = await m.linkForEmail("shipsync/delivery-notes/0006/delivery-1.pdf");
  assert.match(link, /^https?:\/\//);
  assert.match(link, /delivery-notes\/0006\/delivery-1\.pdf/);
  assert.match(link, /token=T/);
});

test("a value that is already an ordinary web link is passed through unchanged", async () => {
  assert.equal(await m.linkForEmail("https://example.com/a.pdf"), "https://example.com/a.pdf");
});
