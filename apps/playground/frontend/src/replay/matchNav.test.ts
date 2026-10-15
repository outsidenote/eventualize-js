import { test } from "node:test";
import * as assert from "node:assert";
import { centeredStart, fetchRange, stepMatch } from "./matchNav";

test("centeredStart centres and clamps at both edges", () => {
  assert.strictEqual(centeredStart(50, 20, 159), 40);
  assert.strictEqual(centeredStart(51, 20, 159), 41);
  assert.strictEqual(centeredStart(2, 20, 159), 0);
  assert.strictEqual(centeredStart(159, 20, 159), 140);
  assert.strictEqual(centeredStart(5, 20, 9), 0);
  assert.strictEqual(centeredStart(7, 1, 100), 7);
  assert.strictEqual(centeredStart(7, 3, 100), 6);
});

test("stepMatch clamps to 0..count-1", () => {
  assert.strictEqual(stepMatch(0, -1, 5), 0);
  assert.strictEqual(stepMatch(0, 1, 5), 1);
  assert.strictEqual(stepMatch(4, 1, 5), 4);
  assert.strictEqual(stepMatch(0, 1, 0), 0);
});

test("fetchRange adds one leading item unless the page is already at the maximum", () => {
  assert.deepStrictEqual(fetchRange(10, 20), { start: 9, size: 21 });
  assert.deepStrictEqual(fetchRange(0, 20), { start: 0, size: 20 });
  assert.deepStrictEqual(fetchRange(10, 200), { start: 10, size: 200 });
  assert.deepStrictEqual(fetchRange(0, 200), { start: 0, size: 200 });
  assert.deepStrictEqual(fetchRange(5, 199), { start: 4, size: 200 });
});
