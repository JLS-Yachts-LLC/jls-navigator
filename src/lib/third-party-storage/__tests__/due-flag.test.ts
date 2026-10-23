/** Overdue / Due Soon on 3rd Party Storage is worked out from the due date, never stored. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dueFlag, daysToDue } from "../data";

const NOW = new Date("2026-10-23T10:00").getTime();

test("a past due date is Overdue, one within 14 days is Due Soon, a later one has no flag", () => {
  assert.equal(dueFlag({ status: "Stored", due_date: "2026-10-20" }, NOW), "Overdue");
  assert.equal(dueFlag({ status: "Stored", due_date: "2026-10-30" }, NOW), "Due Soon");
  assert.equal(dueFlag({ status: "Stored", due_date: "2026-11-30" }, NOW), null);
});

test("a record with no due date, or one that is Closed, is never flagged", () => {
  assert.equal(dueFlag({ status: "Stored", due_date: null }, NOW), null);
  assert.equal(dueFlag({ status: "Closed", due_date: "2026-03-30" }, NOW), null);
});

test("a bad date gives no days rather than NaN", () => {
  assert.equal(daysToDue("not-a-date", NOW), null);
  assert.equal(daysToDue(null, NOW), null);
});
