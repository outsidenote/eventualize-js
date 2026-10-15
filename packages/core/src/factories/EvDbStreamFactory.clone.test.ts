import { test, describe, before, after, beforeEach } from "node:test";
import * as assert from "node:assert";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";
import type { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import { EvDbStreamFactory } from "./EvDbStreamFactory.js";
import { createViewFactory } from "./EvDbViewFactory.js";
import type { ViewFactory } from "./EvDbViewFactory.js";
import EvDbCloneError from "../store/EvDbCloneError.js";
import InMemoryStorageAdapter from "../store/InMemoryStorageAdapter.test-support.js";

type Events = {
  Added: { points: number };
  Doubled: { factor: number };
  AddedV2: { amount: number };
};
type Views = {
  Sum: { sum: number; lastCapturedAt: number };
  Count: { count: number };
};

let producerCalls = 0;
let producerShouldThrow = false;

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
        AddedV2: (s, e, m) => ({ sum: s.sum + e.amount, lastCapturedAt: m.capturedAt.getTime() }),
        Doubled: (s, e, m) => ({ sum: s.sum * e.factor, lastCapturedAt: m.capturedAt.getTime() }),
      },
    }) as unknown as ViewFactory<unknown, Events>,
    createViewFactory<Views["Count"], Events>({
      viewName: "Count",
      streamType: "S",
      defaultState: { count: 0 },
      handlers: {
        Added: (s) => ({ count: s.count + 1 }),
        AddedV2: (s) => ({ count: s.count + 1 }),
        Doubled: (s) => ({ count: s.count + 1 }),
      },
    }) as unknown as ViewFactory<unknown, Events>,
  ],
  eventTypes: [
    {
      eventName: "Added",
      eventMessagesProducer: (event, views) => {
        producerCalls++;
        if (producerShouldThrow) throw new Error("producer failure");
        return [EvDbMessage.createFromMetadata(event, "Added", { views }, "points")];
      },
    },
    { eventName: "Doubled" },
    { eventName: "AddedV2" },
  ],
});

/** Like `factory`, but every `Added` event produces two messages (3 items per event). */
const twoMessagesFactory = new EvDbStreamFactory<Events, "S">({
  streamType: "S",
  viewNames: [],
  viewFactories: [],
  eventTypes: [
    {
      eventName: "Added",
      eventMessagesProducer: (event) => [
        EvDbMessage.createFromMetadata(event, "Added", { part: 1 }, "points"),
        EvDbMessage.createFromMetadata(event, "Added", { part: 2 }, "points"),
      ],
    },
  ],
});

const SRC = "src";
const TGT = "tgt";
const at = (offset: number): Date => new Date(Date.UTC(2020, 0, 1, 0, 0, offset));
const SOURCE_TRACEPARENT = "00-11111111111111111111111111111111-2222222222222222-01";

const ev = (
  offset: number,
  eventType: string,
  payload: IEvDbPayloadData,
  streamId: string = SRC,
): EvDbEvent =>
  new EvDbEvent(
    eventType,
    new EvDbStreamCursor("S", streamId, offset),
    payload,
    at(offset),
    `writer-${offset}`,
    new Date(),
    SOURCE_TRACEPARENT,
    "",
  );

// Sum after each offset: 1, 3, 6, 9, 13
const SOURCE: ReadonlyArray<[string, IEvDbPayloadData]> = [
  ["Added", { points: 1 }],
  ["Added", { points: 2 }],
  ["Doubled", { factor: 2 }],
  ["Added", { points: 3 }],
  ["Added", { points: 4 }],
];

const seeded = (firstOffset = 0): InMemoryStorageAdapter => {
  const adapter = new InMemoryStorageAdapter();
  adapter.seedEvents(SOURCE.map(([t, p], i) => ev(firstOffset + i, t, p)));
  return adapter;
};

const readEvents = async (
  adapter: InMemoryStorageAdapter,
  streamId: string = TGT,
): Promise<EvDbEvent[]> => {
  const out: EvDbEvent[] = [];
  for await (const e of adapter.getEventsAsync(new EvDbStreamCursor("S", streamId, 0))) {
    out.push(e);
  }
  return out;
};

/** Fails the second storeStreamAsync call. */
class FailOnSecondStore extends InMemoryStorageAdapter {
  private storeCalls = 0;
  override async storeStreamAsync(
    events: ReadonlyArray<EvDbEvent>,
    messages: ReadonlyArray<EvDbMessage>,
  ) {
    this.storeCalls++;
    if (this.storeCalls === 2) throw new Error("boom");
    return super.storeStreamAsync(events, messages);
  }
}

/** Records the number of items (events + messages) of every storeStreamAsync call. */
class RecordingBatchAdapter extends InMemoryStorageAdapter {
  public readonly batchSizes: number[] = [];
  override async storeStreamAsync(
    events: ReadonlyArray<EvDbEvent>,
    messages: ReadonlyArray<EvDbMessage>,
  ) {
    this.batchSizes.push(events.length + messages.length);
    return super.storeStreamAsync(events, messages);
  }
}

/** Fails the first storeSnapshotAsync call (the events of that page are already stored). */
class FailOnFirstSnapshot extends InMemoryStorageAdapter {
  private snapshotCalls = 0;
  override async storeSnapshotAsync(data: EvDbStoredSnapshotData): Promise<void> {
    this.snapshotCalls++;
    if (this.snapshotCalls === 1) throw new Error("snapshot boom");
    return super.storeSnapshotAsync(data);
  }
}

const provider = new NodeTracerProvider();
before(() => provider.register());
after(() => provider.shutdown());

describe("EvDbStreamFactory.clone", () => {
  beforeEach(() => {
    producerCalls = 0;
    producerShouldThrow = false;
  });

  test("copies events as is, keeping type, payload, capturedAt and capturedBy", async () => {
    const adapter = seeded();
    const target = await factory.clone(SRC, TGT, adapter, adapter);
    const events = await readEvents(adapter);
    assert.deepStrictEqual(
      events.map((e) => e.streamCursor.offset),
      [0, 1, 2, 3, 4],
    );
    assert.deepStrictEqual(
      events.map((e) => e.eventType),
      SOURCE.map(([t]) => t),
    );
    assert.deepStrictEqual(
      events.map((e) => e.payload),
      SOURCE.map(([, p]) => p),
    );
    assert.deepStrictEqual(
      events.map((e) => e.capturedAt.getTime()),
      [0, 1, 2, 3, 4].map((o) => at(o).getTime()),
    );
    assert.deepStrictEqual(
      events.map((e) => e.capturedBy),
      [0, 1, 2, 3, 4].map((o) => `writer-${o}`),
    );
    assert.strictEqual(target.storedOffset, 4);
    assert.strictEqual(target.views.Sum.sum, 13);
    assert.strictEqual(target.views.Count.count, 5);
    assert.strictEqual(target.views.Sum.lastCapturedAt, at(4).getTime());
  });

  test("returns a writable stream at the target head", async () => {
    const adapter = seeded();
    const target = await factory.clone(SRC, TGT, adapter, adapter);
    await target.appendEventAdded({ points: 10 });
    await target.store();
    const events = await readEvents(adapter);
    assert.strictEqual(events.length, 6);
    assert.strictEqual(events[5].streamCursor.offset, 5);
  });

  test("ignores source snapshots", async () => {
    const adapter = seeded();
    const sourceSum = new EvDbViewAddress(new EvDbStreamAddress("S", SRC), "Sum");
    adapter.seedSnapshot(sourceSum, 3, { sum: 999, lastCapturedAt: 0 });
    const target = await factory.clone(SRC, TGT, adapter, adapter);
    assert.strictEqual(target.views.Sum.sum, 13);
  });

  test("source starting at offset 1 gives target offsets from 0", async () => {
    const adapter = seeded(1);
    await factory.clone(SRC, TGT, adapter, adapter);
    const events = await readEvents(adapter);
    assert.deepStrictEqual(
      events.map((e) => e.streamCursor.offset),
      [0, 1, 2, 3, 4],
    );
  });

  test("offsetLimit is inclusive", async () => {
    const adapter = seeded();
    const target = await factory.clone(SRC, TGT, adapter, adapter, { offsetLimit: 2 });
    assert.strictEqual((await readEvents(adapter)).length, 3);
    assert.strictEqual(target.views.Sum.sum, 6);
  });

  test("offsetLimit 0 copies only the first event", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, { offsetLimit: 0 });
    assert.strictEqual((await readEvents(adapter)).length, 1);
  });

  test("offsetLimit above the head is capped", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, { offsetLimit: 99 });
    assert.strictEqual((await readEvents(adapter)).length, 5);
  });

  test("offsetLimit 135 copies past the first page, in batches", async () => {
    const adapter = new RecordingBatchAdapter();
    adapter.seedEvents(Array.from({ length: 140 }, (_, i) => ev(i, "Added", { points: 1 })));
    const target = await factory.clone(SRC, TGT, adapter, adapter, { offsetLimit: 135 });
    assert.deepStrictEqual(
      (await readEvents(adapter)).map((e) => e.streamCursor.offset),
      Array.from({ length: 136 }, (_, i) => i),
    );
    // Default pageSize 100: page 1 is offsets 0..99, page 2 is offsets 100..135.
    assert.deepStrictEqual(adapter.batchSizes, [100, 36]);
    assert.strictEqual(target.views.Count.count, 136);
    assert.strictEqual(target.views.Sum.sum, 136);
    assert.strictEqual(target.storedOffset, 135);
  });

  test("events appended to the source during the clone are not copied", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, {
      pageSize: 2,
      projectEvent: (e) => {
        if (e.metadata.streamCursor.offset === 0) {
          adapter.seedEvents([ev(5, "Added", { points: 100 })]);
        }
        return e;
      },
    });
    assert.strictEqual((await readEvents(adapter)).length, 5);
  });

  test("pages: 5 events with pageSize 2", async () => {
    const adapter = seeded();
    const target = await factory.clone(SRC, TGT, adapter, adapter, { pageSize: 2 });
    assert.deepStrictEqual(
      (await readEvents(adapter)).map((e) => e.streamCursor.offset),
      [0, 1, 2, 3, 4],
    );
    assert.strictEqual(target.views.Sum.sum, 13);
  });

  test("projectEvent can change the payload", async () => {
    const adapter = seeded();
    const target = await factory.clone(SRC, TGT, adapter, adapter, {
      projectEvent: (e) =>
        e.eventType === "Added"
          ? { eventType: "Added", payload: { points: e.payload.points * 10 } }
          : e,
    });
    assert.strictEqual(target.views.Sum.sum, 130);
  });

  test("projectEvent can change the event type", async () => {
    const adapter = seeded();
    const target = await factory.clone(SRC, TGT, adapter, adapter, {
      projectEvent: (e) =>
        e.eventType === "Added"
          ? { eventType: "AddedV2", payload: { amount: e.payload.points } }
          : e,
    });
    assert.deepStrictEqual(
      (await readEvents(adapter)).map((e) => e.eventType),
      ["AddedV2", "AddedV2", "Doubled", "AddedV2", "AddedV2"],
    );
    assert.strictEqual(target.views.Sum.sum, 13);
  });

  test("projectEvent can drop events; target offsets stay compact", async () => {
    const adapter = seeded();
    const target = await factory.clone(SRC, TGT, adapter, adapter, {
      projectEvent: (e) => (e.eventType === "Doubled" ? undefined : e),
    });
    assert.deepStrictEqual(
      (await readEvents(adapter)).map((e) => e.streamCursor.offset),
      [0, 1, 2, 3],
    );
    assert.strictEqual(target.views.Sum.sum, 10);
    assert.strictEqual(target.views.Count.count, 4);
  });

  test("a page where every event is dropped", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, {
      pageSize: 1,
      projectEvent: (e) => (e.eventType === "Doubled" ? undefined : e),
    });
    assert.deepStrictEqual(
      (await readEvents(adapter)).map((e) => e.streamCursor.offset),
      [0, 1, 2, 3],
    );
  });

  test("projectEvent can override capturedAt and capturedBy", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, {
      projectEvent: (e) => ({ ...e, capturedAt: new Date(0), capturedBy: "redacted" }),
    });
    const events = await readEvents(adapter);
    assert.strictEqual(events.length, 5);
    assert.ok(events.every((e) => e.capturedBy === "redacted"));
    assert.ok(events.every((e) => e.capturedAt.getTime() === 0));
  });

  test("by default no messages are stored and the producer is not called", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter);
    assert.strictEqual(adapter.storedMessages.length, 0);
    assert.strictEqual(producerCalls, 0);
  });

  test("identity projectMessage stores the produced messages for the target", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, { projectMessage: (m) => m });
    assert.strictEqual(producerCalls, 4);
    assert.strictEqual(adapter.storedMessages.length, 4);
    assert.ok(adapter.storedMessages.every((m) => m.streamCursor.streamId === TGT));
    const first = adapter.storedMessages[0].payload;
    assert.ok(first !== undefined);
    assert.deepStrictEqual(first["views"], {
      Sum: { sum: 1, lastCapturedAt: at(0).getTime() },
      Count: { count: 1 },
    });
  });

  test("projectMessage can reroute with withChannel", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, {
      projectMessage: (m) => m.withChannel(`sandbox.${m.channel}`),
    });
    assert.strictEqual(adapter.storedMessages.length, 4);
    assert.ok(adapter.storedMessages.every((m) => m.channel === "sandbox.points"));
  });

  test("projectMessage can drop some messages", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, {
      projectMessage: (m) => (m.streamCursor.offset < 2 ? m : undefined),
    });
    assert.strictEqual(adapter.storedMessages.length, 2);
  });

  test("stored messages carry their event's trace context even when projectMessage replaces it", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, {
      projectMessage: (m) =>
        m.withTraceparent("00-33333333333333333333333333333333-4444444444444444-01", ""),
    });
    const events = await readEvents(adapter);
    assert.strictEqual(adapter.storedMessages.length, 4);
    for (const m of adapter.storedMessages) {
      const event = events.find((e) => e.streamCursor.offset === m.streamCursor.offset);
      assert.ok(event !== undefined);
      assert.ok(event.traceparent !== undefined);
      assert.strictEqual(m.traceparent, event.traceparent);
    }
  });

  test("cloned events carry the clone span's trace context, not the source's", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter);
    const events = await readEvents(adapter);
    for (const e of events) {
      assert.ok(e.traceparent !== undefined);
      assert.notStrictEqual(e.traceparent, SOURCE_TRACEPARENT);
      assert.match(e.traceparent, /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
    }
  });

  test("without a snapshot adapter the target has no views", async () => {
    const adapter = seeded();
    const target = await factory.clone(SRC, TGT, adapter);
    assert.strictEqual((await readEvents(adapter)).length, 5);
    assert.deepStrictEqual(Object.keys(target.getViews()), []);
  });

  test("empty source returns an empty target", async () => {
    const adapter = new InMemoryStorageAdapter();
    const target = await factory.clone(SRC, TGT, adapter, adapter);
    assert.strictEqual(target.storedOffset, -1);
    assert.strictEqual(target.views.Sum.sum, 0);
    assert.strictEqual((await readEvents(adapter)).length, 0);
  });

  test("a non-empty target is rejected before anything is written", async () => {
    const adapter = seeded();
    adapter.seedEvents([ev(0, "Added", { points: 9 }, TGT)]);
    await assert.rejects(
      factory.clone(SRC, TGT, adapter, adapter),
      (err: unknown) =>
        err instanceof EvDbCloneError &&
        err.lastSourceOffset === -1 &&
        err.targetStoredOffset === 0 &&
        err.sourceStreamId === SRC &&
        err.targetStreamId === TGT,
    );
    assert.strictEqual((await readEvents(adapter)).length, 1);
  });

  test("source equal to target is a RangeError", async () => {
    const adapter = seeded();
    await assert.rejects(factory.clone(SRC, SRC, adapter, adapter), RangeError);
  });

  test("invalid offsetLimit or pageSize is a RangeError", async () => {
    const adapter = seeded();
    await assert.rejects(
      factory.clone(SRC, TGT, adapter, adapter, { offsetLimit: -1 }),
      RangeError,
    );
    await assert.rejects(
      factory.clone(SRC, TGT, adapter, adapter, { offsetLimit: 1.5 }),
      RangeError,
    );
    await assert.rejects(factory.clone(SRC, TGT, adapter, adapter, { pageSize: 0 }), RangeError);
  });

  test("a store failure on page 2 reports page 1's progress and keeps page 1", async () => {
    const adapter = new FailOnSecondStore();
    adapter.seedEvents(SOURCE.map(([t, p], i) => ev(i, t, p)));
    await assert.rejects(
      factory.clone(SRC, TGT, adapter, adapter, { pageSize: 2 }),
      (err: unknown) =>
        err instanceof EvDbCloneError &&
        err.lastSourceOffset === 1 &&
        err.targetStoredOffset === 1 &&
        err.cause instanceof Error &&
        err.cause.message === "boom",
    );
    assert.strictEqual((await readEvents(adapter)).length, 2);
  });

  test("a store never exceeds 100 items (events + messages), even inside one page", async () => {
    const adapter = new RecordingBatchAdapter();
    adapter.seedEvents(Array.from({ length: 60 }, (_, i) => ev(i, "Added", { points: 1 })));
    const target = await factory.clone(SRC, TGT, adapter, adapter, {
      projectMessage: (m) => m,
    });
    assert.ok(adapter.batchSizes.every((size) => size <= 100));
    assert.strictEqual(
      adapter.batchSizes.reduce((sum, size) => sum + size, 0),
      120,
    );
    assert.strictEqual((await readEvents(adapter)).length, 60);
    assert.strictEqual(adapter.storedMessages.length, 60);
    assert.strictEqual(target.views.Count.count, 60);
  });

  test("a store stays within 100 items when events add more than one item each", async () => {
    const adapter = new RecordingBatchAdapter();
    adapter.seedEvents(Array.from({ length: 40 }, (_, i) => ev(i, "Added", { points: 1 })));
    await twoMessagesFactory.clone(SRC, TGT, adapter, adapter, { projectMessage: (m) => m });
    // 3 items per event: 33 events fill 99 items, the 34th event would make 102.
    assert.deepStrictEqual(adapter.batchSizes, [99, 21]);
    assert.strictEqual((await readEvents(adapter)).length, 40);
    assert.strictEqual(adapter.storedMessages.length, 80);
  });

  test("a store failure on the second flush inside one page reports the first flush's progress", async () => {
    const adapter = new FailOnSecondStore();
    adapter.seedEvents(Array.from({ length: 60 }, (_, i) => ev(i, "Added", { points: 1 })));
    await assert.rejects(
      factory.clone(SRC, TGT, adapter, adapter, { projectMessage: (m) => m }),
      (err: unknown) =>
        err instanceof EvDbCloneError &&
        err.lastSourceOffset === 49 &&
        err.targetStoredOffset === 49 &&
        err.cause instanceof Error &&
        err.cause.message === "boom",
    );
    assert.strictEqual((await readEvents(adapter)).length, 50);
  });

  test("a snapshot failure after the page's events were stored reports that page's progress", async () => {
    const adapter = new FailOnFirstSnapshot();
    adapter.seedEvents(SOURCE.map(([t, p], i) => ev(i, t, p)));
    await assert.rejects(
      factory.clone(SRC, TGT, adapter, adapter, { pageSize: 2 }),
      (err: unknown) =>
        err instanceof EvDbCloneError &&
        err.lastSourceOffset === 1 &&
        err.targetStoredOffset === 1 &&
        err.cause instanceof Error &&
        err.cause.message === "snapshot boom",
    );
    assert.strictEqual((await readEvents(adapter)).length, 2);
  });

  test("a throwing projection is wrapped with its cause", async () => {
    const adapter = seeded();
    const failure = new Error("bad projection");
    await assert.rejects(
      factory.clone(SRC, TGT, adapter, adapter, {
        pageSize: 2,
        projectEvent: (e) => {
          if (e.metadata.streamCursor.offset === 3) throw failure;
          return e;
        },
      }),
      (err: unknown) =>
        err instanceof EvDbCloneError &&
        err.cause === failure &&
        err.lastSourceOffset === 1 &&
        err.targetStoredOffset === 1,
    );
  });

  test("producer error is wrapped", async () => {
    const adapter = seeded();
    producerShouldThrow = true;
    await assert.rejects(
      factory.clone(SRC, TGT, adapter, adapter, { projectMessage: (m) => m }),
      (err: unknown) =>
        err instanceof EvDbCloneError &&
        err.lastSourceOffset === -1 &&
        err.targetStoredOffset === -1 &&
        err.cause instanceof Error &&
        err.cause.message === "producer failure",
    );
  });

  test("a throwing projectMessage is wrapped", async () => {
    const adapter = seeded();
    await assert.rejects(
      factory.clone(SRC, TGT, adapter, adapter, {
        projectMessage: () => {
          throw new Error("message projection failure");
        },
      }),
      (err: unknown) =>
        err instanceof EvDbCloneError &&
        err.lastSourceOffset === -1 &&
        err.targetStoredOffset === -1 &&
        err.cause instanceof Error &&
        err.cause.message === "message projection failure",
    );
  });

  test("projection results are type-checked against the event map", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, {
      // @ts-expect-error payload does not match eventType "Added"
      projectEvent: () => ({ eventType: "Added", payload: { amount: 1 } }),
    });
  });
});
