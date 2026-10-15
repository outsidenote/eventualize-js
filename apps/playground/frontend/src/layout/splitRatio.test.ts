import { test } from "node:test";
import * as assert from "node:assert";
import { clampRatio, parseStoredRatio, ratioFromPointer, SPLIT_DEFAULT } from "./splitRatio";

test("clampRatio", () => {
  assert.strictEqual(clampRatio(10), 25);
  assert.strictEqual(clampRatio(90), 75);
  assert.strictEqual(clampRatio(40.04), 40);
  assert.strictEqual(clampRatio(Number.NaN), SPLIT_DEFAULT);
});

test("ratioFromPointer", () => {
  assert.strictEqual(ratioFromPointer(500, 100, 1000), 40);
  assert.strictEqual(ratioFromPointer(0, 100, 1000), 25);
  assert.strictEqual(ratioFromPointer(500, 0, 0), SPLIT_DEFAULT);
});

test("parseStoredRatio", () => {
  assert.strictEqual(parseStoredRatio(null), SPLIT_DEFAULT);
  assert.strictEqual(parseStoredRatio("abc"), SPLIT_DEFAULT);
  assert.strictEqual(parseStoredRatio("55"), 55);
  assert.strictEqual(parseStoredRatio("99"), 75);
});
