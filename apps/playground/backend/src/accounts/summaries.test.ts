import { test, describe } from "node:test";
import * as assert from "node:assert";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import { STREAM_TYPE } from "../domain/streamType.js";
import InMemoryStorageAdapter from "../tests/InMemoryStorageAdapter.js";
import { listAccountSummaries } from "./summaries.js";

const deposit = (id: string) =>
  new EvDbEvent("FundsDeposited", new EvDbStreamCursor(STREAM_TYPE, id, 0), {
    value: 5,
    currency: "USD",
    description: "x",
  });

class FailingStorage extends InMemoryStorageAdapter {
  override async getLastOffsetAsync(address: EvDbStreamAddress): Promise<number> {
    if (address.streamId === "bad") throw new Error("boom");
    return super.getLastOffsetAsync(address);
  }
}

describe("listAccountSummaries", () => {
  test("20 accounts plus a ghost: summaries in id order, ghost skipped", async () => {
    const storage = new InMemoryStorageAdapter();
    const ids = Array.from({ length: 20 }, (_, i) => `acc${String(i).padStart(2, "0")}`);
    storage.seedEvents(ids.map(deposit));
    const result = await listAccountSummaries(storage, async () => [...ids, "ghost"]);
    assert.deepStrictEqual(
      result.map((a) => a.id),
      ids,
    );
    assert.ok(result.every((a) => a.lastOffset === 0 && a.balance.currency === "USD"));
  });

  test("a non-NotFound storage error propagates", async () => {
    const storage = new FailingStorage();
    storage.seedEvents([deposit("ok")]);
    await assert.rejects(
      listAccountSummaries(storage, async () => ["ok", "bad"]),
      /boom/,
    );
  });
});
