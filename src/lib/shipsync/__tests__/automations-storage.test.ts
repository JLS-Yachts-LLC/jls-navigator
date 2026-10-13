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

// ── What goes on the proof-of-delivery email ─────────────────────────────────

test("the delivery note PDF is attached (not linked) with one delivered photo and one received photo", async () => {
  be.files.set("shipsync/delivery-notes/0006/delivery-1.pdf", Buffer.alloc(5_000, 1));
  be.files.set("shipsync/packages/a/delivery_1.jpg", Buffer.alloc(40_000, 2));
  be.files.set("shipsync/packages/a/item_1.jpg", Buffer.alloc(30_000, 3));
  const r = await m.buildProofAttachments(
    [{ barcode: "AWB1", delivery_photo_url: "shipsync/packages/a/delivery_1.jpg", item_photo_url: "shipsync/packages/a/item_1.jpg" }],
    { stored: "shipsync/delivery-notes/0006/delivery-1.pdf", filename: "BOAT-DeliveryNote-6.pdf" },
  );
  assert.equal(r.pdfAttached, true);
  assert.equal(r.photos, 2);
  assert.deepEqual(r.attachments.map((a) => a.filename), ["BOAT-DeliveryNote-6.pdf", "AWB1-delivered.jpg", "AWB1-received.jpg"]);
  assert.equal(r.attachments[0].contentType, "application/pdf");
  assert.equal(r.attachments[1].contentType, "image/jpeg");
  assert.equal(Buffer.from(r.attachments[0].contentBase64, "base64").length, 5_000, "the real bytes, base64-encoded");
});

test("a shipment of 100 parcels still sends just ONE delivered and ONE received photo", async () => {
  be.files.set("shipsync/delivery-notes/0007/d.pdf", Buffer.alloc(100, 99));
  const pk = [];
  for (let i = 0; i < 100; i++) {
    be.files.set(`shipsync/packages/p${i}/d.jpg`, Buffer.alloc(100, i % 200));
    be.files.set(`shipsync/packages/p${i}/i.jpg`, Buffer.alloc(120, i % 200));
    pk.push({ barcode: `B${i}`, delivery_photo_url: `shipsync/packages/p${i}/d.jpg`, item_photo_url: `shipsync/packages/p${i}/i.jpg` });
  }
  const r = await m.buildProofAttachments(pk, { stored: "shipsync/delivery-notes/0007/d.pdf", filename: "n.pdf" });
  assert.equal(r.photos, 2);
  assert.equal(r.attachments.length, 3, "the PDF and two photos");
  assert.deepEqual(r.attachments.slice(1).map((a) => a.filename), ["B0-delivered.jpg", "B0-received.jpg"]);
});

test("if a parcel's photo can't be used, the next parcel's is tried for that kind", async () => {
  be.files.set("shipsync/delivery-notes/0009/d.pdf", Buffer.alloc(100, 1));
  be.files.set("shipsync/packages/second/d.jpg", Buffer.alloc(100, 2));
  const r = await m.buildProofAttachments(
    [
      { barcode: "FIRST", delivery_photo_url: "shipsync/packages/gone/d.jpg", item_photo_url: null },
      { barcode: "SECOND", delivery_photo_url: "shipsync/packages/second/d.jpg", item_photo_url: null },
    ],
    { stored: "shipsync/delivery-notes/0009/d.pdf", filename: "n.pdf" },
  );
  assert.equal(r.photos, 1);
  assert.equal(r.attachments[1].filename, "SECOND-delivered.jpg");
  assert.ok(r.skipped.some((x) => /FIRST-delivered photo \(could not be read/.test(x)));
});

test("a photo that can't be read or is too big for the mail service is left out, never fatal", async () => {
  be.files.set("shipsync/delivery-notes/0008/d.pdf", Buffer.alloc(100, 1));
  be.files.set("shipsync/packages/big/d.jpg", Buffer.alloc(3_500_000, 1));
  be.files.set("shipsync/packages/ok/d.jpg", Buffer.alloc(100, 2));
  const r = await m.buildProofAttachments(
    [
      { barcode: "BIG", delivery_photo_url: "shipsync/packages/big/d.jpg", item_photo_url: null },
      { barcode: "GONE", delivery_photo_url: "shipsync/packages/gone/d.jpg", item_photo_url: null },
      { barcode: "OK", delivery_photo_url: "shipsync/packages/ok/d.jpg", item_photo_url: null },
    ],
    { stored: "shipsync/delivery-notes/0008/d.pdf", filename: "n.pdf" },
  );
  assert.equal(r.photos, 1);
  assert.equal(r.skipped.length, 2);
  assert.ok(r.skipped.some((s) => /BIG-delivered photo \(too large/.test(s)));
  assert.ok(r.skipped.some((s) => /GONE-delivered photo \(could not be read/.test(s)));
});

test("if the PDF itself can't be attached it is reported, so the email falls back to a link", async () => {
  const r = await m.buildProofAttachments([], { stored: "shipsync/delivery-notes/none/d.pdf", filename: "n.pdf" });
  assert.equal(r.pdfAttached, false);
  assert.equal(r.attachments.length, 0);
  assert.match(r.skipped[0], /delivery note PDF/);
});
