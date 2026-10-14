import { test, describe } from "node:test";
import * as assert from "node:assert";
import PlaygroundFundsStreamFactory from "./PlaygroundFundsStreamFactory.js";
import { LARGE_TRANSACTION_ALERT } from "./messages.js";
import InMemoryStorageAdapter from "../tests/InMemoryStorageAdapter.js";

describe("PlaygroundFundsStreamFactory views", () => {
  test("balance, stats and risk fold over all event types", async () => {
    const adapter = new InMemoryStorageAdapter();
    const stream = PlaygroundFundsStreamFactory.create("alice", adapter, adapter);
    await stream.appendEventFundsDeposited({ description: "d", value: 100, currency: "USD" });
    await stream.appendEventFundsDeposited({ description: "d", value: 20_000, currency: "USD" });
    await stream.appendEventFundsWithdrawn({ description: "w", value: 50, currency: "USD" });
    await stream.appendEventWithdrawalDenied({
      description: "w",
      value: 1_000_000,
      currency: "USD",
      reason: "insufficient funds",
    });

    assert.deepStrictEqual(stream.views.balance, { amount: 20_050, currency: "USD" });
    assert.deepStrictEqual(stream.views.stats, { deposits: 2, withdrawals: 1, denied: 1 });
    // 0 → max(0, -0.5) = 0 → +3 = 3 → 3 → +2 +3 = 8
    assert.strictEqual(stream.views.risk, 8);
  });

  test("risk never goes below 0", async () => {
    const adapter = new InMemoryStorageAdapter();
    const stream = PlaygroundFundsStreamFactory.create("bob", adapter, adapter);
    await stream.appendEventFundsDeposited({ description: "d", value: 1, currency: "USD" });
    await stream.appendEventFundsDeposited({ description: "d", value: 1, currency: "USD" });
    assert.strictEqual(stream.views.risk, 0);
  });

  test("risk is capped at 10", async () => {
    const adapter = new InMemoryStorageAdapter();
    const stream = PlaygroundFundsStreamFactory.create("carol", adapter, adapter);
    for (let i = 0; i < 5; i++) {
      await stream.appendEventFundsDeposited({ description: "d", value: 50_000, currency: "USD" });
    }
    assert.strictEqual(stream.views.risk, 10);
  });

  test("large transactions produce LargeTransactionAlert, small ones do not", async () => {
    const adapter = new InMemoryStorageAdapter();
    const stream = PlaygroundFundsStreamFactory.create("dave", adapter, adapter);
    await stream.appendEventFundsDeposited({ description: "d", value: 9_999, currency: "USD" });
    await stream.appendEventFundsDeposited({ description: "d", value: 10_000, currency: "USD" });

    const messages = stream.getMessages();
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].messageType, LARGE_TRANSACTION_ALERT);
    assert.deepStrictEqual(messages[0].payload, {
      eventType: "FundsDeposited",
      value: 10_000,
      currency: "USD",
      balanceAfter: 19_999,
    });
  });

  test("handlers do not change the default state objects", async () => {
    const adapter = new InMemoryStorageAdapter();
    const first = PlaygroundFundsStreamFactory.create("e1", adapter, adapter);
    await first.appendEventFundsDeposited({ description: "d", value: 5, currency: "EUR" });
    const second = PlaygroundFundsStreamFactory.create("e2", adapter, adapter);
    assert.deepStrictEqual(second.views.balance, { amount: 0, currency: "" });
    assert.deepStrictEqual(second.views.stats, { deposits: 0, withdrawals: 0, denied: 0 });
  });
});
