/** Crew Academy reminder rules. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { reminderKinds } from "../reminders";

const now = new Date("2026-10-19T09:00:00Z");

test("a new enrolment is announced, an old one isn't", () => {
  assert.deepEqual(reminderKinds({ status: "not_started", created_at: "2026-10-18T10:00:00Z", due_date: null }, now), ["enrolled"]);
  assert.deepEqual(reminderKinds({ status: "not_started", created_at: "2026-09-01T10:00:00Z", due_date: null }, now), []);
});

test("due soon covers today to three days out", () => {
  const e = (due: string) => reminderKinds({ status: "in_progress", created_at: "2026-09-01T00:00:00Z", due_date: due }, now);
  assert.deepEqual(e("2026-10-19"), ["due_soon"]);
  assert.deepEqual(e("2026-10-22"), ["due_soon"]);
  assert.deepEqual(e("2026-10-23"), []);
});

test("overdue repeats weekly, at most four times", () => {
  const e = (due: string) => reminderKinds({ status: "not_started", created_at: "2026-09-01T00:00:00Z", due_date: due }, now);
  assert.deepEqual(e("2026-10-18"), ["overdue-0"]);
  assert.deepEqual(e("2026-10-12"), ["overdue-0"]);
  assert.deepEqual(e("2026-10-11"), ["overdue-1"]);
  assert.deepEqual(e("2026-06-01"), ["overdue-3"]);
});

test("finished courses get nothing", () => {
  assert.deepEqual(reminderKinds({ status: "completed", created_at: "2026-10-19T00:00:00Z", due_date: "2026-10-18" }, now), []);
});
