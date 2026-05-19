import { test, describe } from "node:test";
import * as assert from "node:assert";
import { computeRiskLevel, handleUpdateRisk } from "./commandHandler.js";
import type { UpdateAccountRisk } from "./command.js";

describe("RiskAssessment — computeRiskLevel", () => {
  test("returns 'none' when fewer than 10 transactions", () => {
    const txs = [{ delta: -10 }, { delta: -10 }];
    assert.strictEqual(computeRiskLevel(txs, 100), "none");
  });

  test("returns 'low' when avg delta is positive", () => {
    const txs = Array.from({ length: 10 }, () => ({ delta: 10 }));
    assert.strictEqual(computeRiskLevel(txs, 500), "low");
  });

  test("returns 'low' when steps-to-zero > 20", () => {
    // avg delta = -5, balance = 200 → steps = 40 > 20
    const txs = Array.from({ length: 10 }, () => ({ delta: -5 }));
    assert.strictEqual(computeRiskLevel(txs, 200), "low");
  });

  test("returns 'medium' when steps-to-zero is 10–20", () => {
    // avg delta = -10, balance = 150 → steps = 15
    const txs = Array.from({ length: 10 }, () => ({ delta: -10 }));
    assert.strictEqual(computeRiskLevel(txs, 150), "medium");
  });

  test("returns 'high' when steps-to-zero <= 10", () => {
    // avg delta = -20, balance = 100 → steps = 5
    const txs = Array.from({ length: 10 }, () => ({ delta: -20 }));
    assert.strictEqual(computeRiskLevel(txs, 100), "high");
  });
});

describe("RiskAssessment — handleUpdateRisk", () => {
  test("upserts MongoDB document with rolling window and risk level", async () => {
    let upsertedDoc: unknown = null;

    const mockCollection = {
      findOne: async (_filter: unknown) => null,
      updateOne: async (_filter: unknown, update: unknown, _options: unknown) => {
        upsertedDoc = (update as Record<string, unknown>)["$set"];
        return { modifiedCount: 1 };
      },
    };

    const cmd: UpdateAccountRisk = {
      commandType: "UpdateAccountRisk",
      accountId: "acc-1",
      delta: 100,
      currentBalance: 100,
      currency: "USD",
      transactionId: "tx-1",
    };

    await handleUpdateRisk(cmd, mockCollection as never);

    const doc = upsertedDoc as Record<string, unknown>;
    assert.strictEqual(doc["accountId"], "acc-1");
    assert.strictEqual(doc["riskLevel"], "none"); // only 1 transaction, < 10
    assert.strictEqual(doc["currentBalance"], 100);
    assert.strictEqual((doc["transactions"] as unknown[]).length, 1);
  });
});
