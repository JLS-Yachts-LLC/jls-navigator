/** Crew Academy certificate PDF: builds for both owners and survives names the standard fonts can't draw. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { buildCertificatePdf, certificateNumber } from "../certificate.server";

const base = {
  number: "CA-2026-ABC234", courseTitle: "Fire safety on board — extinguishers", vesselName: "AQUILA",
  vesselLogoUrl: null, score: 92, issuedAt: "2026-10-19T09:00:00Z", expiresAt: "2027-10-19T09:00:00Z",
};

test("a JLS certificate is a one-page landscape PDF", async () => {
  const bytes = await buildCertificatePdf({ ...base, owner: "jls", learnerName: "José Müller" });
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  const { width, height } = doc.getPage(0).getSize();
  assert.ok(width > height);
});

test("a vessel certificate works without a logo, and odd characters don't break it", async () => {
  const bytes = await buildCertificatePdf({ ...base, owner: "vessel", learnerName: "Иван Петров 李", expiresAt: null, score: null });
  assert.ok(bytes.length > 1000);
});

test("certificate numbers look right and differ", () => {
  const a = certificateNumber(new Date("2026-05-01")), b = certificateNumber(new Date("2026-05-01"));
  assert.match(a, /^CA-2026-[A-HJ-NP-Z2-9]{6}$/);
  assert.notEqual(a, b);
});
