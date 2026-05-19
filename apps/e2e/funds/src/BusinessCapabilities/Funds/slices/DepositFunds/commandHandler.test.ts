import { test, describe } from "node:test";
import * as assert from "node:assert";
import StorageAdapterStub from "../../../../tests/StorageAdapterStub.js";
import FundsStreamFactory from "../../swimlanes/Funds/index.js";
import { handleDeposit } from "./commandHandler.js";

describe("DepositFunds commandHandler", () => {
  test("appendEventFundsDeposited is called with the command payload", async () => {
    const storageAdapter = new StorageAdapterStub();
    const stream = FundsStreamFactory.create("acc-1", storageAdapter, storageAdapter);

    handleDeposit(stream, {
      commandType: "DepositFunds",
      accountId: "acc-1",
      amount: 150,
      currency: "USD",
    });

    const events = stream.getEvents();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].eventType, "FundsDeposited");
    assert.deepStrictEqual(events[0].payload, { accountId: "acc-1", amount: 150, currency: "USD" });
  });
});
