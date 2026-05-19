import { test, describe } from "node:test";
import * as assert from "node:assert";
import StorageAdapterStub from "../../../../tests/StorageAdapterStub.js";
import FundsStreamFactory from "../../swimlanes/Funds/index.js";
import { handleWithdraw } from "./commandHandler.js";

describe("WithdrawFunds commandHandler", () => {
  test("appends FundsWithdrawn when balance is sufficient", async () => {
    const storageAdapter = new StorageAdapterStub();
    const stream = FundsStreamFactory.create("acc-1", storageAdapter, storageAdapter);
    stream.appendEventFundsDeposited({ accountId: "acc-1", amount: 200, currency: "USD" });

    handleWithdraw(stream, { commandType: "WithdrawFunds", accountId: "acc-1", amount: 50, currency: "USD" });

    const events = stream.getEvents();
    const withdrawn = events.filter((e) => e.eventType === "FundsWithdrawn");
    assert.strictEqual(withdrawn.length, 1);
    assert.deepStrictEqual(withdrawn[0].payload, { accountId: "acc-1", amount: 50, currency: "USD" });
  });

  test("throws INSUFFICIENT_FUNDS when balance is too low", async () => {
    const storageAdapter = new StorageAdapterStub();
    const stream = FundsStreamFactory.create("acc-1", storageAdapter, storageAdapter);

    assert.throws(
      () => handleWithdraw(stream, { commandType: "WithdrawFunds", accountId: "acc-1", amount: 50, currency: "USD" }),
      { message: "INSUFFICIENT_FUNDS" },
    );
  });
});
