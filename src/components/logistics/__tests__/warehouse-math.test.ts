/** Storage charge, CBM, zone labels, and shelf capacity / recommendation maths. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  storageCharge, calcCbm, zoneLabel, bayList, shelfList, shelfUsedDims, recommendShelves, shelfFitProblem,
  type WarehouseShelf, type WarehouseClientItem, type WarehouseInternalItem,
} from "../logistics-warehouse-data";

const shelf = (zone: string, bay: string, s: string, over: Partial<WarehouseShelf> = {}): WarehouseShelf => ({
  id: `${zone}${bay}${s}`, zone, bay, shelf: s, max_length_cm: 200, max_width_cm: 100, max_height_cm: 100,
  max_cbm: 2, max_weight_kg: 500, created_at: "", updated_at: "", ...over,
} as WarehouseShelf);
const client = (over: Partial<WarehouseClientItem>): WarehouseClientItem => ({
  id: "c", ref_no: "R", client_name: "X", description: "d", status: "Stored",
  zone: "A", bay: "1", shelf: "1", length_cm: null, width_cm: null, height_cm: null, weight_kg: null, cbm: null, ...over,
} as WarehouseClientItem);

test("CBM is L×W×H in cm over a million, and 0 when any side is missing", () => {
  assert.equal(calcCbm(100, 100, 100), 1);
  assert.equal(calcCbm(120, 80, 100), 0.96);
  assert.equal(calcCbm(0, 100, 100), 0);
  assert.equal(calcCbm(100, 100, 0), 0);
});

test("storage charge: nothing for no volume, 850 up to 3 CBM, 285 per CBM beyond", () => {
  assert.equal(storageCharge(0), 0);
  assert.equal(storageCharge(-1), 0);
  assert.equal(storageCharge(0.01), 850);
  assert.equal(storageCharge(3), 850);
  assert.equal(storageCharge(4), 850 + 285);
  assert.ok(Math.abs(storageCharge(3.5) - (850 + 142.5)) < 1e-9);
});

test("special zones read in full; lettered zones are just the letter", () => {
  assert.equal(zoneLabel("TEMP"), "Temp (Chiller/Freezer)");
  assert.equal(zoneLabel("temp"), "Temp (Chiller/Freezer)");
  assert.equal(zoneLabel("PRV"), "Prv (Provisioning)");
  assert.equal(zoneLabel("CHM"), "Chm (Chemicals)");
  assert.equal(zoneLabel("A"), "A");
});

test("bays are unique and sorted; shelves sort naturally (2 before 10)", () => {
  const all = [shelf("A", "2", "1"), shelf("A", "1", "1"), shelf("A", "1", "10"), shelf("A", "1", "2"), shelf("B", "1", "1")];
  assert.deepEqual(bayList(all, "A"), ["1", "2"]);
  assert.deepEqual(shelfList(all, "A", "1").map((s) => s.shelf), ["1", "2", "10"]);
  assert.deepEqual(bayList(all, "Z"), []);
});

test("used dims are the largest item per direction, ignoring Completed and other shelves", () => {
  const items = [
    client({ length_cm: 50, width_cm: 30, height_cm: 20 }),
    client({ length_cm: 40, width_cm: 90, height_cm: 10 }),
    client({ length_cm: 500, width_cm: 500, height_cm: 500, status: "Completed" }),
    client({ length_cm: 700, width_cm: 700, height_cm: 700, shelf: "2" }),
  ];
  assert.deepEqual(shelfUsedDims("A", "1", "1", items, [] as WarehouseInternalItem[]), { l: 50, w: 90, h: 20 });
  assert.deepEqual(shelfUsedDims("A", "1", "9", items, []), { l: 0, w: 0, h: 0 });
});

test("recommendation: must fit each dimension, the remaining volume and the remaining weight; tightest fit first", () => {
  const shelves = [
    shelf("A", "1", "1", { max_cbm: 5 }),                                  // roomy
    shelf("A", "1", "2", { max_cbm: 1.5 }),                                // tight but fits
    shelf("A", "1", "3", { max_length_cm: 90 }),                           // too short
    shelf("A", "1", "4", { max_cbm: 1.5 }),                                // half used below
    shelf("A", "1", "5", { max_weight_kg: 50 }),                           // too weak
  ];
  const items = [client({ shelf: "4", cbm: 1, weight_kg: 10 })];            // leaves 0.5 CBM on shelf 4
  const out = recommendShelves(shelves, items, [], { l: 100, w: 100, h: 100, kg: 100 });   // needs 1 CBM
  assert.deepEqual(out.map((r) => r.s.shelf), ["2", "1"]);                  // 4 has only 0.5 left; 3 and 5 can't take it
});

test("a Completed item frees its space", () => {
  const shelves = [shelf("A", "1", "1", { max_cbm: 1.5 })];
  const full = [client({ cbm: 1, weight_kg: 10 })];
  const freed = [client({ cbm: 1, weight_kg: 10, status: "Completed" })];
  const need = { l: 100, w: 100, h: 100, kg: 10 };
  assert.equal(recommendShelves(shelves, full, [], need).length, 0);
  assert.equal(recommendShelves(shelves, freed, [], need).length, 1);
});

test("a shelf with no weight limit never refuses on weight", () => {
  const shelves = [shelf("A", "1", "1", { max_weight_kg: null as unknown as number })];
  assert.equal(recommendShelves(shelves, [], [], { l: 10, w: 10, h: 10, kg: 99999 }).length, 1);
});

// ── the warning shown when choosing a shelf ──────────────────────────────────

test("shelf warning: nothing to say without a shelf, or before anything has been measured", () => {
  assert.equal(shelfFitProblem(undefined, { l: 100, w: 100, h: 100, kg: 10 }, [], []), null);
  assert.equal(shelfFitProblem(shelf("A", "1", "1"), { l: 0, w: 0, h: 0, kg: 0 }, [], []), null);
});

test("shelf warning: too big in any direction", () => {
  const s = shelf("A", "1", "1");                                            // 200 × 100 × 100
  assert.match(shelfFitProblem(s, { l: 201, w: 50, h: 50, kg: 1 }, [], [])!, /bigger/);
  assert.match(shelfFitProblem(s, { l: 50, w: 101, h: 50, kg: 1 }, [], [])!, /bigger/);
  assert.match(shelfFitProblem(s, { l: 50, w: 50, h: 101, kg: 1 }, [], [])!, /bigger/);
  assert.equal(shelfFitProblem(s, { l: 200, w: 100, h: 100, kg: 1 }, [], []), null, "exactly the shelf size (and exactly its volume) fits");
});

test("shelf warning: not enough volume left, saying how much IS left; an exact fit is fine", () => {
  const s = shelf("A", "1", "1", { max_cbm: 2 });
  const items = [client({ cbm: 1.5 })];
  assert.equal(shelfFitProblem(s, { l: 100, w: 100, h: 100, kg: 1 }, items, []), "Only 0.50 m³ is free on that shelf.");
  assert.equal(shelfFitProblem(s, { l: 100, w: 50, h: 100, kg: 1 }, items, []), null, "0.5 CBM into the 0.5 left fits exactly");
});

test("shelf warning: too heavy for what's left, but never when the shelf has no weight limit", () => {
  const s = shelf("A", "1", "1", { max_weight_kg: 100 });
  assert.match(shelfFitProblem(s, { l: 10, w: 10, h: 10, kg: 60 }, [client({ weight_kg: 50 })], [])!, /weight/);
  assert.equal(shelfFitProblem(s, { l: 10, w: 10, h: 10, kg: 50 }, [client({ weight_kg: 50 })], []), null);
  assert.equal(shelfFitProblem(shelf("A", "1", "1", { max_weight_kg: null as unknown as number }), { l: 10, w: 10, h: 10, kg: 9999 }, [], []), null);
});

test("shelf warning: a completed item no longer takes up room", () => {
  const s = shelf("A", "1", "1", { max_cbm: 1.5 });
  assert.ok(shelfFitProblem(s, { l: 100, w: 100, h: 100, kg: 1 }, [client({ cbm: 1 })], []));
  assert.equal(shelfFitProblem(s, { l: 100, w: 100, h: 100, kg: 1 }, [client({ cbm: 1, status: "Completed" })], []), null);
});
