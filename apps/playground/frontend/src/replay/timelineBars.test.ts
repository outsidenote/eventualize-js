import { test } from "node:test";
import * as assert from "node:assert";
import { barHeight, barKind, inWindow } from "./timelineBars";

test("barKind", () => {
  assert.strictEqual(barKind("FundsDeposited"), "deposit");
  assert.strictEqual(barKind("FundsWithdrawn"), "withdraw");
  assert.strictEqual(barKind("WithdrawalDenied"), "denied");
});

test("barHeight grows with log10(value), 15..100", () => {
  assert.strictEqual(barHeight(0), 15);
  assert.strictEqual(barHeight(1), 15);
  assert.strictEqual(barHeight(10), 32);
  assert.strictEqual(barHeight(10_000), 83);
  assert.strictEqual(barHeight(1e9), 100);
  assert.ok(barHeight(500) > barHeight(50));
});

test("inWindow", () => {
  assert.ok(inWindow(5, { start: 5, end: 9 }));
  assert.ok(!inWindow(10, { start: 5, end: 9 }));
  assert.ok(!inWindow(5, null));
});
