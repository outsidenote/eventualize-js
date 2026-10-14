import { test } from "node:test";
import * as assert from "node:assert";
import { formatAmount } from "./format";

test("formatAmount rounds float noise and groups thousands", () => {
  assert.strictEqual(formatAmount(0.1 + 0.2, "USD"), "0.3 USD");
  assert.strictEqual(formatAmount(1250, "USD"), "1,250 USD");
  assert.strictEqual(formatAmount(-50.555, "EUR"), "-50.56 EUR");
  assert.strictEqual(formatAmount(0, ""), "0");
});
