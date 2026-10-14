/** Typing a date on the phone: digits in, DD/MM/YYYY shown, YYYY-MM-DD out. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { maskDate, parseDate, formatDate } from "../date-input";

test("typed digits lay themselves out as DD/MM/YYYY, and anything else typed is ignored", () => {
  assert.equal(maskDate("1"), "1");
  assert.equal(maskDate("13"), "13");
  assert.equal(maskDate("131"), "13/1");
  assert.equal(maskDate("1310"), "13/10");
  assert.equal(maskDate("13102026"), "13/10/2026");
  assert.equal(maskDate("13/10/2026"), "13/10/2026", "re-masking the masked text changes nothing");
  assert.equal(maskDate("131020269999"), "13/10/2026", "no more than a full date");
  assert.equal(maskDate("1a3-1o0"), "13/10", "letters and dashes are dropped");
  assert.equal(maskDate("13/"), "13", "backspacing over the slash just removes it");
});

test("a complete real date becomes YYYY-MM-DD; incomplete or impossible ones give nothing", () => {
  assert.equal(parseDate("13/10/2026"), "2026-10-13");
  assert.equal(parseDate("01/01/2027"), "2027-01-01");
  assert.equal(parseDate("29/02/2028"), "2028-02-29", "a leap day");
  assert.equal(parseDate("29/02/2027"), null, "not a leap year");
  assert.equal(parseDate("31/04/2026"), null, "April has 30 days");
  assert.equal(parseDate("32/01/2026"), null);
  assert.equal(parseDate("13/13/2026"), null);
  assert.equal(parseDate("00/10/2026"), null);
  assert.equal(parseDate("13/10/26"), null, "two-digit years are not guessed at");
  assert.equal(parseDate("13/10/"), null);
  assert.equal(parseDate(""), null);
});

test("stored dates are shown as DD/MM/YYYY and round-trip", () => {
  assert.equal(formatDate("2026-10-13"), "13/10/2026");
  assert.equal(formatDate("2026-10-13T08:00:00Z"), "13/10/2026");
  assert.equal(formatDate(""), "");
  assert.equal(formatDate("nonsense"), "");
  assert.equal(parseDate(formatDate("2026-12-31")), "2026-12-31");
});
