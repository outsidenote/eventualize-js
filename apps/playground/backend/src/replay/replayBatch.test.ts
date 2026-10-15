import { test, describe, beforeEach } from "node:test";
import * as assert from "node:assert";
import { replayBatch } from "./replayBatch.js";
import type { ReplayItem } from "./replayBatch.js";
import { deposit, withdraw } from "../commands/commands.js";
import { NotFoundError } from "../errors.js";
import InMemoryStorageAdapter from "../tests/InMemoryStorageAdapter.js";

let storage: InMemoryStorageAdapter;

async function seed(): Promise<void> {
  storage = new InMemoryStorageAdapter();
  await deposit(storage, "alice", { value: 100, currency: "USD" }); // 0
  await deposit(storage, "alice", { value: 10, currency: "USD" }); // 1
  await deposit(storage, "alice", { value: 100_000, currency: "USD" }); // 2 (large)
  await withdraw(storage, "alice", { value: 50, currency: "USD" }); // 3
  await withdraw(storage, "alice", { value: 999_999, currency: "USD" }); // 4 (denied)
}

const strip = (i: ReplayItem) => ({
  offset: i.offset,
  eventType: i.event_meta.eventType,
  payload: i.event_payload,
  views: i.views,
  messages: i.messages,
});

describe("replayBatch", () => {
  beforeEach(seed);

  test("returns batchSize items starting at offset", async () => {
    const batch = await replayBatch(storage, "alice", { offset: 1, batchSize: 2, snapshots: true });
    assert.deepStrictEqual(
      batch.items.map((i) => i.offset),
      [1, 2],
    );
    assert.strictEqual(batch.isHead, false);
    assert.strictEqual(batch.lastOffset, 4);
    assert.deepStrictEqual(batch.items[1].views.balance, { amount: 100_110, currency: "USD" });
    assert.strictEqual(batch.items[1].messages[0].messageType, "LargeTransactionAlert");
  });

  test("stops at the head and reports isHead", async () => {
    const batch = await replayBatch(storage, "alice", {
      offset: 3,
      batchSize: 20,
      snapshots: true,
    });
    assert.deepStrictEqual(
      batch.items.map((i) => i.offset),
      [3, 4],
    );
    assert.strictEqual(batch.isHead, true);
    assert.strictEqual(batch.items[1].event_meta.eventType, "WithdrawalDenied");
    assert.strictEqual(batch.items[1].event_payload.reason, "insufficient funds");
  });

  test("items do not share view objects", async () => {
    const batch = await replayBatch(storage, "alice", { offset: 0, batchSize: 5, snapshots: true });
    const amounts = batch.items.map((i) => i.views.balance.amount);
    assert.deepStrictEqual(amounts, [100, 110, 100_110, 100_060, 100_060]);
    assert.notStrictEqual(batch.items[0].views.balance, batch.items[1].views.balance);
    assert.notStrictEqual(batch.items[0].views.stats, batch.items[1].views.stats);
  });

  test("stepping inside a batch equals a direct go-to for every offset", async () => {
    const full = await replayBatch(storage, "alice", {
      offset: 0,
      batchSize: 200,
      snapshots: true,
    });
    for (let offset = 0; offset <= 4; offset++) {
      const direct = await replayBatch(storage, "alice", { offset, batchSize: 1, snapshots: true });
      assert.deepStrictEqual(strip(direct.items[0]), strip(full.items[offset]));
    }
  });

  test("replay with and without snapshots gives the same items", async () => {
    for (let offset = 0; offset <= 4; offset++) {
      const withSnap = await replayBatch(storage, "alice", {
        offset,
        batchSize: 3,
        snapshots: true,
      });
      const noSnap = await replayBatch(storage, "alice", {
        offset,
        batchSize: 3,
        snapshots: false,
      });
      assert.deepStrictEqual(withSnap.items.map(strip), noSnap.items.map(strip));
    }
  });

  test("event_meta has ISO dates and nulls for missing fields", async () => {
    const batch = await replayBatch(storage, "alice", { offset: 0, batchSize: 1, snapshots: true });
    const meta = batch.items[0].event_meta;
    assert.strictEqual(meta.eventType, "FundsDeposited");
    assert.ok(!Number.isNaN(Date.parse(meta.capturedAt)));
    assert.ok(meta.storedAt === null || !Number.isNaN(Date.parse(meta.storedAt)));
    assert.ok(meta.traceparent === null || typeof meta.traceparent === "string");
  });

  test("unknown account is NotFoundError", async () => {
    await assert.rejects(
      replayBatch(storage, "nobody", { offset: 0, batchSize: 1, snapshots: true }),
      (err) => err instanceof NotFoundError,
    );
  });

  test("offset past the head is NotFoundError", async () => {
    await assert.rejects(
      replayBatch(storage, "alice", { offset: 5, batchSize: 1, snapshots: true }),
      (err) => err instanceof NotFoundError,
    );
  });
});
