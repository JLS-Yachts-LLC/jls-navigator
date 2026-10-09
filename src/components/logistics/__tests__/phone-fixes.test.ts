/** Fixes from the phone-screen review: signature position, the Delivered date filter. */
import "fake-indexeddb/auto";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeBackend } from "./fake-backend";
import { toCanvasPoint, MIN_SIGNATURE_TRAVEL } from "@/components/shipsync/driver/signature-geometry";

const be = new FakeBackend();
let dd: typeof import("../logistics-delivery-data");
before(async () => {
  await be.start();
  process.env.SUPABASE_URL = be.url;
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-key";
  dd = await import("../logistics-delivery-data");
});
after(async () => { await be.stop(); });
beforeEach(() => be.reset());

// ── signature ────────────────────────────────────────────────────────────────

test("a touch on a 340px-wide phone maps to the 520px canvas (the ink used to land short of the finger)", () => {
  const rect = { left: 20, top: 100, width: 340, height: 180 };
  const canvas = { width: 520, height: 180 };
  assert.deepEqual(toCanvasPoint(20, 100, rect, canvas), { x: 0, y: 0 }, "top-left corner");
  const right = toCanvasPoint(360, 280, rect, canvas);              // bottom-right corner of the pad
  assert.ok(Math.abs(right.x - 520) < 1e-9 && Math.abs(right.y - 180) < 1e-9, "the whole pad can be reached, right-hand edge included");
  const mid = toCanvasPoint(190, 190, rect, canvas);
  assert.ok(Math.abs(mid.x - 260) < 1e-9 && Math.abs(mid.y - 90) < 1e-9);
});

test("when the canvas is shown at its own size nothing is scaled, and a zero-size box doesn't divide by zero", () => {
  assert.deepEqual(toCanvasPoint(50, 60, { left: 0, top: 0, width: 520, height: 180 }, { width: 520, height: 180 }), { x: 50, y: 60 });
  assert.deepEqual(toCanvasPoint(5, 5, { left: 0, top: 0, width: 0, height: 0 }, { width: 520, height: 180 }), { x: 5, y: 5 });
  assert.ok(MIN_SIGNATURE_TRAVEL > 0);
});

// ── Delivered date filter ────────────────────────────────────────────────────

test("a UAE day runs from 00:00 to 00:00 the next day, including across month and year ends", () => {
  assert.deepEqual(dd.uaeDayBounds("2026-10-09"), { from: "2026-10-09T00:00:00+04:00", to: "2026-10-10T00:00:00+04:00" });
  assert.deepEqual(dd.uaeDayBounds("2026-10-31"), { from: "2026-10-31T00:00:00+04:00", to: "2026-11-01T00:00:00+04:00" });
  assert.deepEqual(dd.uaeDayBounds("2026-12-31"), { from: "2026-12-31T00:00:00+04:00", to: "2027-01-01T00:00:00+04:00" });
  assert.deepEqual(dd.uaeDayBounds("2028-02-28"), { from: "2028-02-28T00:00:00+04:00", to: "2028-02-29T00:00:00+04:00" });
});

test("the Delivered date filter finds that day's notes in UAE time (it used to find nothing)", async () => {
  const note = (id: string, deliveredAtUtc: string) => be.rows("shipsync_delivery_notes").push({ id, number: id, status: "delivered", boat_name: "ORKA", delivered_at: deliveredAtUtc });
  note("early", "2026-10-08T21:30:00Z");   // 01:30 on 9 Oct in Dubai -> belongs to the 9th
  note("noon", "2026-10-09T08:00:00Z");    // 12:00 on 9 Oct
  note("late", "2026-10-09T19:59:00Z");    // 23:59 on 9 Oct
  note("next", "2026-10-09T20:00:00Z");    // 00:00 on 10 Oct -> the 10th
  note("prev", "2026-10-08T19:59:00Z");    // 23:59 on 8 Oct -> the 8th
  const found = (await dd.searchDelivered({ q: "", boat: "", date: "2026-10-09" })).map((r) => r.note.id).sort();
  assert.deepEqual(found, ["early", "late", "noon"]);
});
