/**
 * Where a checked-in parcel is saved. The rules (from the logistics team):
 *   paid, any type            -> Import board
 *   Import, unpaid, BOE 101…  -> Import board (barcode asterisks ignored)
 *   Import, unpaid, otherwise -> Local board (including a blank BOE)
 *   Local, unpaid             -> Local
 *   Transit                   -> Transit (the Import/Transit board)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { routeCheckin, type Board } from "../checkin-commit";

const cases: [Board, boolean, string, Board][] = [
  // paid -> Import
  ["Local", true, "", "Import"],
  ["Local", true, "999", "Import"],
  ["Import", true, "", "Import"],
  ["Import", true, "20212", "Import"],
  // Import, unpaid, BOE decides
  ["Import", false, "101234567", "Import"],
  ["Import", false, "101", "Import"],
  ["Import", false, "*101234567", "Import"],
  ["Import", false, "*101234567*", "Import"],
  ["Import", false, "  101234567  ", "Import"],
  ["Import", false, "* 101234567 *", "Import"],
  ["Import", false, "20212345", "Local"],
  ["Import", false, "", "Local"],
  ["Import", false, "   ", "Local"],
  ["Import", false, "*", "Local"],
  ["Import", false, "1001234", "Local"],     // 101 must be at the START
  ["Import", false, "X101234", "Local"],
  ["Import", false, "0101234", "Local"],
  // Local, unpaid
  ["Local", false, "", "Local"],
  ["Local", false, "101234567", "Local"],    // Local has no BOE rule
  // Transit stays on the Import/Transit board
  ["Transit", false, "", "Transit"],
  ["Transit", false, "101234567", "Transit"],
  ["Transit", true, "", "Transit"],
];

for (const [type, paid, boe, expected] of cases) {
  test(`${type} ${paid ? "paid" : "unpaid"} BOE ${JSON.stringify(boe)} -> ${expected}`, () => {
    assert.equal(routeCheckin(type, paid, boe), expected);
  });
}
