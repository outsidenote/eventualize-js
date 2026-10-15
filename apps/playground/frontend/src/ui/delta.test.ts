import { test } from "node:test";
import * as assert from "node:assert";
import { deltaOf } from "./delta";

test("deltaOf", () => {
  assert.deepStrictEqual(deltaOf(10, 7), { sign: 1, abs: 3 });
  assert.deepStrictEqual(deltaOf(7, 10), { sign: -1, abs: 3 });
  assert.deepStrictEqual(deltaOf(5, 5), { sign: 0, abs: 0 });
  assert.deepStrictEqual(deltaOf(5, null), { sign: 0, abs: 0 });
  assert.deepStrictEqual(deltaOf(0.1 + 0.2, 0.3), { sign: 0, abs: 0 });
  // cents(1.005 - 1) = cents(0.00499…) = 0: sub-cent noise is not a change
  assert.deepStrictEqual(deltaOf(1.005, 1), { sign: 0, abs: 0 });
  assert.deepStrictEqual(deltaOf(1.02, 1), { sign: 1, abs: 0.02 });
});
