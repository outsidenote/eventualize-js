import { test, describe } from "node:test";
import * as assert from "node:assert";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import { fetchPage } from "./fetchPage.js";
import InMemoryStorageAdapter from "./InMemoryStorageAdapter.test-support.js";

const address = new EvDbStreamAddress("S", "s-1");

/** Counts how many adapter iterators were closed (their `finally` ran). */
class ClosingTracker extends InMemoryStorageAdapter {
  public closed = 0;
  override async *getEventsAsync(
    cursor: EvDbStreamCursor,
    pageSize?: number,
  ): AsyncGenerator<EvDbEvent, void, undefined> {
    try {
      yield* super.getEventsAsync(cursor, pageSize);
    } finally {
      this.closed++;
    }
  }
}

const seeded = (count: number): ClosingTracker => {
  const adapter = new ClosingTracker();
  adapter.seedEvents(
    Array.from(
      { length: count },
      (_, i) => new EvDbEvent("Added", new EvDbStreamCursor(address, i), { points: i }),
    ),
  );
  return adapter;
};

describe("fetchPage", () => {
  test("returns at most pageSize events from fromOffset", async () => {
    const page = await fetchPage(seeded(10), address, 2, 3);
    assert.deepStrictEqual(
      page.map((e) => e.streamCursor.offset),
      [2, 3, 4],
    );
  });

  test("closes the adapter iterator after a full page", async () => {
    const adapter = seeded(10);
    await fetchPage(adapter, address, 0, 3);
    assert.strictEqual(adapter.closed, 1);
  });

  test("returns an empty page past the head", async () => {
    const adapter = seeded(2);
    const page = await fetchPage(adapter, address, 5, 3);
    assert.deepStrictEqual(page, []);
    assert.strictEqual(adapter.closed, 1);
  });
});
