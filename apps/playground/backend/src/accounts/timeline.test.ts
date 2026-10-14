import { test, describe } from "node:test";
import * as assert from "node:assert";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import { STREAM_TYPE } from "../domain/streamType.js";
import { NotFoundError } from "../errors.js";
import InMemoryStorageAdapter from "../tests/InMemoryStorageAdapter.js";
import { getTimeline, TIMELINE_LIMIT } from "./timeline.js";

describe("getTimeline", () => {
  test("caps at the last TIMELINE_LIMIT events", async () => {
    const storage = new InMemoryStorageAdapter();
    const total = TIMELINE_LIMIT + 3;
    storage.seedEvents(
      Array.from(
        { length: total },
        (_, offset) =>
          new EvDbEvent("FundsDeposited", new EvDbStreamCursor(STREAM_TYPE, "big", offset), {
            value: 1,
            currency: "USD",
            description: "x",
          }),
      ),
    );
    const { lastOffset, events } = await getTimeline(storage, "big");
    assert.strictEqual(lastOffset, total - 1);
    assert.strictEqual(events.length, 5000);
    assert.strictEqual(events[0].offset, 3);
    assert.strictEqual(events[events.length - 1].offset, 5002);
  });

  test("a payload without a numeric value gives value 0", async () => {
    const storage = new InMemoryStorageAdapter();
    storage.seedEvents([
      new EvDbEvent("FundsDeposited", new EvDbStreamCursor(STREAM_TYPE, "odd", 0), {
        currency: "USD",
      }),
    ]);
    const { events } = await getTimeline(storage, "odd");
    assert.deepStrictEqual(events, [{ offset: 0, eventType: "FundsDeposited", value: 0 }]);
  });

  test("unknown account is NotFoundError", async () => {
    await assert.rejects(getTimeline(new InMemoryStorageAdapter(), "nobody"), NotFoundError);
  });
});
