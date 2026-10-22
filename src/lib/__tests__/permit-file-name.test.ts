/**
 * Permit Inbox file names (SD-0077) — a permit or certificate filed to the
 * vessel's SharePoint folder is named by its expiry date, which is what the
 * team looks for, falling back to the issue date and then the received date.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { permitFileName } from "../permits/permit-file-name";

const received = "2026-10-22T06:40:18.361Z";

test("an entry permit is named by its expiry date", () => {
  const name = permitFileName("Madame Gu", { permit_type: "exit_entry", dma_phase: "Entry", issue_date: "2026-09-23", expiry_date: "2027-03-23" }, received);
  assert.equal(name, "Madame Gu - Entry Permit - 23Mar2027.pdf");
});

test("statutory certificates are named by their expiry date too", () => {
  const name = permitFileName("Madame Gu", { permit_type: "sanitation", dma_phase: null, issue_date: "2026-04-01", expiry_date: "2026-10-01" }, received);
  assert.equal(name, "Madame Gu - Sanitation Certificate - 01Oct2026.pdf");
});

test("without an expiry the issue date is used", () => {
  const name = permitFileName("Madame Gu", { permit_type: "exit_entry", dma_phase: "Exit", issue_date: "2026-09-23", expiry_date: null }, received);
  assert.equal(name, "Madame Gu - Exit Permit - 23Sep2026.pdf");
});

test("without either date the received date is used", () => {
  const name = permitFileName("Madame Gu", { permit_type: "tdra", dma_phase: null, issue_date: null, expiry_date: null }, received);
  assert.equal(name, "Madame Gu - TDRA Licence - 22Oct2026.pdf");
});
