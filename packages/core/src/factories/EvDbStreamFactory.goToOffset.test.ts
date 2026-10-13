import { test, describe } from "node:test";
import * as assert from "node:assert";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import { EvDbStreamFactory } from "./EvDbStreamFactory.js";
import { createViewFactory } from "./EvDbViewFactory.js";
import type { ViewFactory } from "./EvDbViewFactory.js";
import InMemoryStorageAdapter from "../store/InMemoryStorageAdapter.test-support.js";

type Events = { Added: { points: number } };
// `type`, not `interface`: TViews must satisfy Record<string, unknown>.
type Views = {
  Sum: { sum: number; lastCapturedAt: number };
  Count: { count: number };
};

const factory = new EvDbStreamFactory<Events, "S", Views>({
  streamType: "S",
  viewNames: ["Sum", "Count"],
  viewFactories: [
    createViewFactory<Views["Sum"], Events>({
      viewName: "Sum",
      streamType: "S",
      defaultState: { sum: 0, lastCapturedAt: 0 },
      handlers: {
        Added: (s, e, m) => ({ sum: s.sum + e.points, lastCapturedAt: m.capturedAt.getTime() }),
      },
    }) as unknown as ViewFactory<unknown, Events>,
    createViewFactory<Views["Count"], Events>({
      viewName: "Count",
      streamType: "S",
      defaultState: { count: 0 },
      handlers: { Added: (s) => ({ count: s.count + 1 }) },
    }) as unknown as ViewFactory<unknown, Events>,
  ],
  eventTypes: [
    {
      eventName: "Added",
      eventMessagesProducer: (event, views) => [
        EvDbMessage.createFromMetadata(event, "Added", { views }),
      ],
    },
  ],
});

const address = new EvDbStreamAddress("S", "s-1");
const capturedAt = (offset: number): Date => new Date(Date.UTC(2020, 0, 1, 0, 0, offset));
const ev = (offset: number): EvDbEvent =>
  new EvDbEvent(
    "Added",
    new EvDbStreamCursor(address, offset),
    { points: offset + 1 },
    capturedAt(offset),
    "test",
    new Date(),
  );
const sumTo = (offset: number): number => ((offset + 1) * (offset + 2)) / 2;
const seeded = (count: number, opts: { ignoreMaxOffset?: boolean } = {}) => {
  const adapter = new InMemoryStorageAdapter(opts);
  adapter.seedEvents(Array.from({ length: count }, (_, i) => ev(i)));
  return adapter;
};
const sumAddr = new EvDbViewAddress(address, "Sum");
const countAddr = new EvDbViewAddress(address, "Count");

describe("EvDbStreamFactory.goToOffset", () => {
  test("views equal a full fold of 0..offset", async () => {
    const adapter = seeded(10);
    const s = await factory.goToOffset("s-1", 4, adapter, adapter);
    assert.strictEqual(s.event.streamCursor.offset, 4);
    assert.strictEqual(s.views.Sum.sum, sumTo(4));
    assert.strictEqual(s.views.Count.count, 5);
  });

  test("view handlers see the stored capturedAt", async () => {
    const adapter = seeded(5);
    const s = await factory.goToOffset("s-1", 3, adapter, adapter);
    assert.strictEqual(s.views.Sum.lastCapturedAt, capturedAt(3).getTime());
  });

  test("uses the latest snapshot at or before the offset", async () => {
    const adapter = seeded(10);
    adapter.seedSnapshot(sumAddr, 2, { sum: sumTo(2), lastCapturedAt: 0 });
    adapter.seedSnapshot(countAddr, 2, { count: 3 });
    adapter.seedSnapshot(sumAddr, 8, { sum: 999, lastCapturedAt: 0 });
    adapter.seedSnapshot(countAddr, 8, { count: 999 });
    const s = await factory.goToOffset("s-1", 5, adapter, adapter);
    assert.strictEqual(s.views.Sum.sum, sumTo(5));
    assert.strictEqual(s.views.Count.count, 6);
  });

  test("ignores a snapshot newer than the target (adapter ignores maxOffset)", async () => {
    const adapter = seeded(10, { ignoreMaxOffset: true });
    adapter.seedSnapshot(sumAddr, 8, { sum: 999, lastCapturedAt: 0 });
    adapter.seedSnapshot(countAddr, 8, { count: 999 });
    const s = await factory.goToOffset("s-1", 5, adapter, adapter);
    assert.strictEqual(s.views.Sum.sum, sumTo(5));
    assert.strictEqual(s.views.Count.count, 6);
  });

  test("one view without a snapshot folds from 0", async () => {
    const adapter = seeded(10);
    adapter.seedSnapshot(sumAddr, 3, { sum: sumTo(3), lastCapturedAt: 0 });
    const s = await factory.goToOffset("s-1", 6, adapter, adapter);
    assert.strictEqual(s.views.Sum.sum, sumTo(6));
    assert.strictEqual(s.views.Count.count, 7);
  });

  test("all views have a snapshot at the target offset", async () => {
    const adapter = seeded(10);
    adapter.seedSnapshot(sumAddr, 4, { sum: sumTo(4), lastCapturedAt: 0 });
    adapter.seedSnapshot(countAddr, 4, { count: 5 });
    const s = await factory.goToOffset("s-1", 4, adapter, adapter);
    assert.strictEqual(s.event.streamCursor.offset, 4);
    assert.strictEqual(s.views.Sum.sum, sumTo(4));
    assert.strictEqual(s.views.Count.count, 5);
    assert.strictEqual(s.messages.length, 1);
  });

  test("without a snapshot adapter, views fold from default state", async () => {
    const adapter = seeded(6);
    const s = await factory.goToOffset("s-1", 2, adapter);
    assert.strictEqual(s.views.Sum.sum, sumTo(2));
    assert.strictEqual(s.views.Count.count, 3);
  });

  test("messages are produced for the current event with post-apply view states", async () => {
    const adapter = seeded(6);
    const s = await factory.goToOffset("s-1", 2, adapter, adapter);
    assert.strictEqual(s.messages.length, 1);
    assert.strictEqual(s.messages[0].streamCursor.offset, 2);
    const payload = s.messages[0].payload;
    assert.ok(payload !== undefined);
    assert.deepStrictEqual(payload["views"], {
      Sum: { sum: sumTo(2), lastCapturedAt: capturedAt(2).getTime() },
      Count: { count: 3 },
    });
  });

  test("forward to the head with a small page size", async () => {
    const adapter = seeded(7);
    const s = await factory.goToOffset("s-1", 0, adapter, adapter, 2);
    const seen = [s.event.streamCursor.offset];
    while (!s.isHead) {
      await s.forward();
      seen.push(s.event.streamCursor.offset);
    }
    assert.deepStrictEqual(seen, [0, 1, 2, 3, 4, 5, 6]);
    assert.strictEqual(s.views.Sum.sum, sumTo(6));
  });

  test("does not store anything", async () => {
    const adapter = seeded(4);
    const s = await factory.goToOffset("s-1", 1, adapter, adapter);
    await s.forward(2);
    assert.strictEqual(adapter.storedMessages.length, 0);
    assert.strictEqual((await adapter.getSnapshotAsync(sumAddr)).offset, -1);
  });

  test("throws when the offset is not in the stream", async () => {
    const adapter = new InMemoryStorageAdapter();
    adapter.seedEvents([ev(1), ev(2)]); // like factory.create(): starts at 1
    await assert.rejects(factory.goToOffset("s-1", 0, adapter, adapter), RangeError);
    await assert.rejects(factory.goToOffset("s-1", 5, adapter, adapter), RangeError);
  });

  test("rejects invalid offset and pageSize", async () => {
    const adapter = seeded(3);
    await assert.rejects(factory.goToOffset("s-1", -1, adapter, adapter), RangeError);
    await assert.rejects(factory.goToOffset("s-1", 1.5, adapter, adapter), RangeError);
    await assert.rejects(factory.goToOffset("s-1", 0, adapter, adapter, 0), RangeError);
  });

  test("read-only at the type level", async () => {
    const adapter = seeded(2);
    const s = await factory.goToOffset("s-1", 0, adapter, adapter);
    // @ts-expect-error read-only stream has no store()
    assert.strictEqual(s.store, undefined);
    // @ts-expect-error read-only stream has no appendEventAdded()
    assert.strictEqual(s.appendEventAdded, undefined);
  });
});
