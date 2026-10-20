/** Sidebar Favourites: only visible items show, in the person's order; pin, unpin, move and drop. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dropFavourite, moveFavourite, resolveFavourites, toggleFavourite } from "../sidebar-favourites";

const items = (...s: string[]) => s.map((screen) => ({ screen }));

test("favourites follow the saved order and skip items the sidebar isn't showing", () => {
  const visible = items("dashboard", "crew", "permits");
  const got = resolveFavourites(["permits", "finance", "dashboard", "permits"], visible).map((i) => i.screen);
  assert.deepEqual(got, ["permits", "dashboard"]);
});

test("a favourite is the sidebar's own item, not a copy", () => {
  const visible = items("crew");
  assert.equal(resolveFavourites(["crew"], visible)[0], visible[0]);
});

test("pin adds to the end; pinning again unpins", () => {
  assert.deepEqual(toggleFavourite(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggleFavourite(["a", "b"], "a"), ["b"]);
});

test("move up/down swaps with the neighbouring visible pin, leaving hidden pins in place", () => {
  const vis = new Set(["a", "b", "c"]);
  assert.deepEqual(moveFavourite(["a", "x", "b", "c"], "b", -1, vis), ["b", "a", "x", "c"]);
  assert.deepEqual(moveFavourite(["a", "x", "b", "c"], "a", 1, vis), ["x", "b", "a", "c"]);
  assert.deepEqual(moveFavourite(["a", "b"], "a", -1, vis), ["a", "b"]);
  assert.deepEqual(moveFavourite(["a", "b"], "b", 1, vis), ["a", "b"]);
});

test("drop puts the dragged pin before or after the target", () => {
  assert.deepEqual(dropFavourite(["a", "b", "c"], "c", "a", "before"), ["c", "a", "b"]);
  assert.deepEqual(dropFavourite(["a", "b", "c"], "a", "c", "after"), ["b", "c", "a"]);
  assert.deepEqual(dropFavourite(["a", "b", "c"], "a", "a", "after"), ["a", "b", "c"]);
  assert.deepEqual(dropFavourite(["a", "b"], "z", "a", "before"), ["a", "b"]);
});
