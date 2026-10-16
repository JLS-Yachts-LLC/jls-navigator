/**
 * Permit expiry — the GDRFA entry permit (SD-0058). A yacht's entry permit expires
 * about six months after it entered, however often it is updated for crew changes,
 * so its expiry is tracked like the DMA and FMA permits — but only the ENTRY permit
 * (exit permits carry no expiry), and only while the yacht is still in the country.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { currentPermits, permitLabel, type ExpiryPermitRow } from "../permit-expiry";

const today = "2026-10-16";
const row = (over: Partial<ExpiryPermitRow>): ExpiryPermitRow => ({
  id: Math.random().toString(36).slice(2), yacht_id: "y1", permit_type: "exit_entry", permit_number: null,
  issuing_authority: null, dma_phase: "Entry", expiry_date: "2026-12-01", status: "active", ...over,
});

test("an entry permit is tracked and named for the agents", () => {
  const out = currentPermits([row({})], [{ id: "y1", status: "In Country" }], today);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, "GDRFA entry permit");
  assert.equal(out[0].expiryDate, "2026-12-01");
  assert.equal(out[0].days, 46);
  assert.equal(permitLabel("exit_entry", null, "Entry"), "GDRFA entry permit");
});

test("exit permits never count", () => {
  const out = currentPermits([row({ dma_phase: "Exit", expiry_date: "2026-12-01" })], [{ id: "y1" }], today);
  assert.equal(out.length, 0);
});

test("a departed yacht's old entry permit drops out", () => {
  const out = currentPermits([row({})], [{ id: "y1", status: "Departed" }], today);
  assert.equal(out.length, 0);
});

test("the latest entry permit wins, and other permits are unaffected by departure", () => {
  const rows = [
    row({ expiry_date: "2026-11-01" }),
    row({ expiry_date: "2027-03-01" }),
    row({ permit_type: "dma", dma_phase: null, expiry_date: "2026-12-20" }),
  ];
  const here = currentPermits(rows, [{ id: "y1", status: "In Country" }], today);
  assert.deepEqual(here.map((p) => [p.permitType, p.expiryDate]), [["dma", "2026-12-20"], ["exit_entry", "2027-03-01"]]);
  const gone = currentPermits(rows, [{ id: "y1", status: "departed" }], today);
  assert.deepEqual(gone.map((p) => p.permitType), ["dma"]);
});
