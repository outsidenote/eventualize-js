import { test, describe } from "node:test";
import * as assert from "node:assert";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import { deposit, withdraw } from "./commands.js";
import { ValidationError } from "../errors.js";
import InMemoryStorageAdapter from "../tests/InMemoryStorageAdapter.js";

describe("commands", () => {
  test("first deposit creates the account at offset 0", async () => {
    const storage = new InMemoryStorageAdapter();
    const result = await deposit(storage, "alice", { value: 100, currency: "USD" });
    assert.strictEqual(result.offset, 0);
    assert.strictEqual(result.eventType, "FundsDeposited");
    assert.deepStrictEqual(result.views.balance, { amount: 100, currency: "USD" });
  });

  test("withdraw within balance appends FundsWithdrawn", async () => {
    const storage = new InMemoryStorageAdapter();
    await deposit(storage, "alice", { value: 100, currency: "USD" });
    const result = await withdraw(storage, "alice", { value: 100, currency: "USD" });
    assert.strictEqual(result.offset, 1);
    assert.strictEqual(result.eventType, "FundsWithdrawn");
    assert.strictEqual(result.views.balance.amount, 0);
  });

  test("withdraw above balance appends WithdrawalDenied and keeps the balance", async () => {
    const storage = new InMemoryStorageAdapter();
    await deposit(storage, "alice", { value: 100, currency: "USD" });
    const result = await withdraw(storage, "alice", { value: 101, currency: "USD" });
    assert.strictEqual(result.eventType, "WithdrawalDenied");
    assert.strictEqual(result.views.balance.amount, 100);
    assert.strictEqual(result.views.stats.denied, 1);
  });

  test("withdraw on an empty account is denied", async () => {
    const storage = new InMemoryStorageAdapter();
    const result = await withdraw(storage, "ghost", { value: 1, currency: "USD" });
    assert.strictEqual(result.offset, 0);
    assert.strictEqual(result.eventType, "WithdrawalDenied");
  });

  test("a command in another currency is rejected and stores nothing", async () => {
    const storage = new InMemoryStorageAdapter();
    await deposit(storage, "alice", { value: 100, currency: "USD" });
    await assert.rejects(
      deposit(storage, "alice", { value: 1, currency: "EUR" }),
      (err) => err instanceof ValidationError,
    );
    const next = await deposit(storage, "alice", { value: 1, currency: "USD" });
    assert.strictEqual(next.offset, 1);
  });

  test("default descriptions are used when none is given", async () => {
    const storage = new InMemoryStorageAdapter();
    await deposit(storage, "alice", { value: 10, currency: "USD" });
    await withdraw(storage, "alice", { value: 5, currency: "USD", description: "rent" });
    const descriptions: unknown[] = [];
    for await (const e of storage.getEventsAsync(
      new EvDbStreamCursor("playground-funds", "alice", 0),
    )) {
      descriptions.push(e.payload.description);
    }
    assert.deepStrictEqual(descriptions, ["deposit", "rent"]);
  });

  test("withdraw compares and stores cents: intent 0.1 + 0.2 against balance 0.3", async () => {
    const storage = new InMemoryStorageAdapter();
    await deposit(storage, "alice", { value: 0.3, currency: "USD" });
    const result = await withdraw(storage, "alice", { value: 0.1 + 0.2, currency: "USD" });
    assert.strictEqual(result.eventType, "FundsWithdrawn");
    const values: unknown[] = [];
    for await (const e of storage.getEventsAsync(
      new EvDbStreamCursor("playground-funds", "alice", 0),
    )) {
      values.push(e.payload.value);
    }
    assert.deepStrictEqual(values, [0.3, 0.3]);
  });
});
