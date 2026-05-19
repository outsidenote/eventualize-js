import { test, describe } from "node:test";
import * as assert from "node:assert";
import { handleUpdateLeaderboard } from "./commandHandler.js";
import type { UpdateAccountLeaderboard } from "./command.js";

describe("AccountLeaderboard commandHandler", () => {
  test("executes SQL UPSERT with correct deposit params", async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const mockPool = {
      query: async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [] };
      },
    };

    const cmd: UpdateAccountLeaderboard = {
      commandType: "UpdateAccountLeaderboard",
      accountId: "acc-1",
      delta: 100,
      currentBalance: 100,
      currency: "USD",
      transactionId: "tx-1",
    };

    await handleUpdateLeaderboard(cmd, mockPool as never);

    assert.strictEqual(queries.length, 1);
    assert.ok(queries[0].sql.includes("INSERT INTO account_leaderboard"));
    assert.strictEqual(queries[0].params[0], "acc-1");   // accountId
    assert.strictEqual(queries[0].params[2], 100);        // total_deposited increment
    assert.strictEqual(queries[0].params[3], 0);          // total_withdrawn increment
    assert.strictEqual(queries[0].params[4], 100);        // last_balance
  });

  test("executes SQL UPSERT with correct withdrawal params", async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const mockPool = {
      query: async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [] };
      },
    };

    const cmd: UpdateAccountLeaderboard = {
      commandType: "UpdateAccountLeaderboard",
      accountId: "acc-1",
      delta: -50,
      currentBalance: 50,
      currency: "USD",
      transactionId: "tx-2",
    };

    await handleUpdateLeaderboard(cmd, mockPool as never);

    assert.strictEqual(queries[0].params[2], 0);    // total_deposited increment = 0
    assert.strictEqual(queries[0].params[3], 50);   // total_withdrawn increment = abs(delta)
  });
});
