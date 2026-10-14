/** Who may act on bunkering from the Client Portal, and what a signed declaration upload must be. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bunkeringActorRoles, canActOnBunkering, canSeeBunkeringPrices, declarationUploadProblem, declarationContentType, MAX_DECLARATION_BYTES } from "../bunkering-actions";
import { PORTAL_POSITIONS, positionLabel, hiddenSections, canSeeFinance } from "../portal-positions";

test("only the Captain, Relief Captain and Chief Engineer can confirm or approve bunkering — as their own role", () => {
  assert.deepEqual(bunkeringActorRoles("captain"), ["Captain"]);
  assert.deepEqual(bunkeringActorRoles("relief_captain"), ["Captain"]);
  assert.deepEqual(bunkeringActorRoles(""), ["Captain"], "a blank position counts as the Captain, as elsewhere in the portal");
  assert.deepEqual(bunkeringActorRoles(null), ["Captain"]);
  assert.deepEqual(bunkeringActorRoles("Chief_Engineer "), ["Chief Engineer"], "case and spaces don't matter");
  for (const p of ["chief_officer", "second_officer", "chief_stewardess", "chef", "purser", "owner", "representative", "other"]) {
    assert.deepEqual(bunkeringActorRoles(p), [], `${p} cannot commit the vessel to a fuel order`);
    assert.equal(canActOnBunkering(p), false);
  }
  assert.equal(canActOnBunkering("captain"), true);
});

test("a Chief Engineer is a portal position, can see prices to approve them, but not the vessel's accounts", () => {
  assert.ok((PORTAL_POSITIONS as readonly string[]).includes("chief_engineer"));
  assert.equal(positionLabel("chief_engineer"), "Chief Engineer");
  assert.equal(canSeeFinance("chief_engineer"), false, "no invoices or balances");
  assert.equal(hiddenSections("chief_engineer").has("bunkering"), false, "but Bunkering is theirs");
  assert.equal(canSeeBunkeringPrices("chief_engineer", canSeeFinance("chief_engineer")), true);
  assert.equal(canSeeBunkeringPrices("chef", canSeeFinance("chef")), false);
  assert.equal(canSeeBunkeringPrices("purser", canSeeFinance("purser")), true, "positions that see finance still see the prices");
});

test("the signed declaration must be a PDF or a photo, not empty, and not over 10 MB", () => {
  assert.equal(declarationUploadProblem({ name: "signed.pdf", type: "application/pdf", size: 200_000 }), null);
  assert.equal(declarationUploadProblem({ name: "IMG_1.jpg", type: "image/jpeg", size: 3_000_000 }), null);
  assert.equal(declarationUploadProblem({ name: "IMG_2.HEIC", type: "", size: 3_000_000 }), null, "a phone photo the browser gave no type for");
  assert.match(declarationUploadProblem({ name: "x.pdf", type: "application/pdf", size: 0 })!, /empty/);
  assert.match(declarationUploadProblem({ name: "x.pdf", type: "application/pdf", size: MAX_DECLARATION_BYTES + 1 })!, /10 MB/);
  assert.match(declarationUploadProblem({ name: "malware.exe", type: "application/x-msdownload", size: 1000 })!, /PDF or a photo/);
  assert.match(declarationUploadProblem({ name: "notes.txt", type: "text/plain", size: 1000 })!, /PDF or a photo/);
  assert.match(declarationUploadProblem({ name: "page.html", type: "text/html", size: 1000 })!, /PDF or a photo/);
});

test("a file's type is taken from what the browser says; the extension only fills in when it said nothing useful", () => {
  assert.equal(declarationContentType("a.pdf", "application/pdf"), "application/pdf");
  assert.equal(declarationContentType("a.jpeg", ""), "image/jpeg");
  assert.equal(declarationContentType("a.pdf", "application/octet-stream"), "application/pdf");
  assert.equal(declarationContentType("renamed.pdf", "text/html"), null, "a file that says it's HTML is not accepted just because of its name");
});
