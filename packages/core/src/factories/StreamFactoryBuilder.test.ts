import { test, describe } from "node:test";
import * as assert from "node:assert";
import { StreamFactoryBuilder } from "./StreamFactoryBuilder.js";
import { EvDbStoredSnapshotResultRaw } from "@eventualize/types/snapshots/EvDbStoredSnapshotResultRaw";
import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import type EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import type EvDbMessageFilter from "@eventualize/types/messages/EvDbMessageFilter";
import type EvDbContinuousFetchOptions from "@eventualize/types/primitives/EvDbContinuousFetchOptions";
import type { EvDbShardName } from "@eventualize/types/primitives/EvDbShardName";
import type StreamStoreAffected from "@eventualize/types/stream/StreamStoreAffected";
import type { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import type EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

class SnapshotAdapterStub implements IEvDbStorageSnapshotAdapter {
  async getSnapshotAsync(_viewAddress: EvDbViewAddress): Promise<EvDbStoredSnapshotResultRaw> {
    return EvDbStoredSnapshotResultRaw.Empty;
  }
  async storeSnapshotAsync(_data: EvDbStoredSnapshotData): Promise<void> { }
  async close(): Promise<void> { }
}

class StreamAdapterStub implements IEvDbStorageStreamAdapter {
  getEventsAsync(_cursor: EvDbStreamCursor): AsyncGenerator<EvDbEvent, void, undefined> {
    throw new Error("not implemented");
  }
  async getLastOffsetAsync(_address: EvDbStreamAddress): Promise<number> {
    return 0;
  }
  async storeStreamAsync(
    _events: ReadonlyArray<EvDbEvent>,
    _messages: ReadonlyArray<EvDbMessage>,
  ): Promise<StreamStoreAffected> {
    throw new Error("not implemented");
  }
  getFromOutbox(
    _filter: EvDbMessageFilter,
    _options?: EvDbContinuousFetchOptions | null,
  ): Promise<AsyncIterable<EvDbMessage>> {
    throw new Error("not implemented");
  }
  getFromOutboxAsync(
    _shard: EvDbShardName,
    _filter: EvDbMessageFilter,
    _options?: EvDbContinuousFetchOptions | null,
    _cancellation?: AbortSignal,
  ): AsyncIterable<EvDbMessage> {
    throw new Error("not implemented");
  }
  getRecordsFromOutboxAsync(
    _shard: unknown,
    _filter?: unknown,
    _options?: unknown,
    _cancellation?: unknown,
  ): AsyncIterable<EvDbMessage> {
    throw new Error("not implemented");
  }
  subscribeToMessageAsync(
    _handler: unknown,
    _shard: unknown,
    _filter?: unknown,
    _options?: unknown,
  ): Promise<void> {
    throw new Error("not implemented");
  }
  async close(): Promise<void> { }
}

// ---------------------------------------------------------------------------
// Event payload types
// ---------------------------------------------------------------------------

type PointsAdded = { points: number };
type PointsMultiplied = { multiplier: number };

// View state types
type SumState = { sum: number };
type CountState = { count: number };

// ---------------------------------------------------------------------------
// Factory using the new withViews().addView() API
// ---------------------------------------------------------------------------

function makeFactory() {
  return (
    new StreamFactoryBuilder("TestStream")
      .withEvent<PointsAdded>("PointsAdded")
      .withEvent<PointsMultiplied>("PointsMultiplied")
      .withViews()
      .addView(
        "Sum",
        { sum: 0 } satisfies SumState,
        (state: SumState, payload: PointsAdded | PointsMultiplied) => {
          if ("points" in payload) return { sum: state.sum + payload.points };
          if ("multiplier" in payload) return { sum: state.sum * payload.multiplier };
          return state;
        },
      )
      .addView("Count", { count: 0 } satisfies CountState, (state: CountState) => ({
        count: state.count + 1,
      }))
      .withMessages()

      // Two factories for PointsAdded
      .addPointsAdded("PointsAddedSumNotification", (payload, views) => ({
        pointsAdded: payload.points,
        currentSum: views.Sum.sum,
      }))
      .addPointsAdded("PointsAddedCountNotification", (payload, views) =>
        views.Count.count > 0
          ? { pointsAdded: payload.points, currentCount: views.Count.count }
          : undefined,
      )
      // One factory for PointsMultiplied
      .addPointsMultiplied("PointsMultipliedNotification", (payload, views) => ({
        multiplier: payload.multiplier,
        currentSum: views.Sum.sum,
      }))
      .build()
  );
}

function createStream() {
  const factory = makeFactory();
  const snapshotAdapter = new SnapshotAdapterStub();
  const streamAdapter = new StreamAdapterStub();
  return factory.create("stream-1", streamAdapter, snapshotAdapter, 0);
}

// ---------------------------------------------------------------------------
// Tests — new API (withViews / addView / addXxx)
// ---------------------------------------------------------------------------

describe("StreamFactoryBuilder.withViews + withMessages (new API)", () => {
  test("factory returns a payload — one message emitted per factory", () => {
    const stream = createStream();
    stream.appendEventPointsAdded({ points: 10 });

    const messages = stream.getPendingMessages();
    // Two factories for PointsAdded: sum + count (count=1 after first event, not suppressed)
    assert.strictEqual(messages.length, 2);

    const sumMsg = messages.find((m) => m.messageType === "PointsAddedSumNotification");
    assert.ok(sumMsg, "sum notification should be emitted");
    assert.deepStrictEqual(sumMsg!.payload, { pointsAdded: 10, currentSum: 10 });

    const countMsg = messages.find((m) => m.messageType === "PointsAddedCountNotification");
    assert.ok(countMsg, "count notification should be emitted");
    assert.deepStrictEqual(countMsg!.payload, { pointsAdded: 10, currentCount: 1 });
  });

  test("factory returns undefined — message suppressed", () => {
    const stream = createStream();
    stream.appendEventPointsMultiplied({ multiplier: 3 });

    const messages = stream.getPendingMessages();
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0]!.messageType, "PointsMultipliedNotification");
  });

  test("multiple factories for same event all fire independently", () => {
    const stream = createStream();
    stream.appendEventPointsAdded({ points: 5 });

    const messages = stream.getPendingMessages();
    const types = messages.map((m) => m.messageType);
    assert.ok(types.includes("PointsAddedSumNotification"));
    assert.ok(types.includes("PointsAddedCountNotification"));
  });

  test("multiple factories for different events each fire only for their event", () => {
    const stream = createStream();
    stream.appendEventPointsAdded({ points: 7 });
    stream.appendEventPointsMultiplied({ multiplier: 2 });

    const messages = stream.getPendingMessages();
    const sumMsgs = messages.filter((m) => m.messageType === "PointsAddedSumNotification");
    const multMsgs = messages.filter((m) => m.messageType === "PointsMultipliedNotification");
    assert.strictEqual(sumMsgs.length, 1);
    assert.strictEqual(multMsgs.length, 1);
    assert.deepStrictEqual(multMsgs[0]!.payload, { multiplier: 2, currentSum: 14 });
  });

  test("messages are accumulated across multiple appendEvent calls", () => {
    const stream = createStream();
    stream.appendEventPointsAdded({ points: 1 });
    stream.appendEventPointsAdded({ points: 2 });

    const messages = stream.getPendingMessages();
    // Each PointsAdded produces 2 messages → total 4
    assert.strictEqual(messages.length, 4);
  });
});

// ---------------------------------------------------------------------------
// Tests — withMessages() called directly from EventBuilder (no views)
// ---------------------------------------------------------------------------

describe("StreamFactoryBuilder — withMessages() without views", () => {
  test("messages fire without any views registered", () => {
    const factory = new StreamFactoryBuilder("NoViewStream")
      .withEvent<PointsAdded>("PointsAdded")
      .withMessages()
      .addPointsAdded("SimpleNotification", (payload) => ({
        pts: (payload as PointsAdded).points,
      }))
      .build();

    const stream = factory.create("s1", new StreamAdapterStub(), new SnapshotAdapterStub(), 0);
    stream.appendEventPointsAdded({ points: 42 });

    const messages = stream.getPendingMessages();
    assert.strictEqual(messages.length, 1);
    assert.deepStrictEqual(messages[0]!.payload, { pts: 42 });
  });
});

// ---------------------------------------------------------------------------
// Tests — build() directly without messages
// ---------------------------------------------------------------------------

describe("StreamFactoryBuilder — build() without withMessages()", () => {
  test("stream works with no outbox factories", () => {
    const factory = new StreamFactoryBuilder("MinimalStream")
      .withEvent<PointsAdded>("PointsAdded")
      .withViews()
      .addView("Sum", { sum: 0 }, (state: SumState, payload: PointsAdded) => ({
        sum: state.sum + payload.points,
      }))
      .build();

    const stream = factory.create("s1", new StreamAdapterStub(), new SnapshotAdapterStub(), 0);
    stream.appendEventPointsAdded({ points: 5 });

    assert.strictEqual(stream.getPendingMessages().length, 0);
  });
});

// ---------------------------------------------------------------------------
// Tests — addView with builder-callback (per-event fluent API)
// ---------------------------------------------------------------------------

describe("StreamFactoryBuilder — addView with builder callback", () => {
  test("per-event handlers fire for their event and ignore others", () => {
    const factory = new StreamFactoryBuilder("TestStream")
      .withEvent<PointsAdded>("PointsAdded")
      .withEvent<PointsMultiplied>("PointsMultiplied")
      .withViews()
      .addViewBuilder("Sum", { sum: 0 } satisfies SumState, (b) =>
        b
          .fromPointsAdded((state: SumState, payload: PointsAdded) => ({
            sum: state.sum + payload.points,
          }))
          .fromPointsMultiplied((state: SumState, payload: PointsMultiplied) => ({
            sum: state.sum * payload.multiplier,
          })),
      )
      .build();

    const stream = factory.create("s1", new StreamAdapterStub(), new SnapshotAdapterStub(), 0);
    stream.appendEventPointsAdded({ points: 10 });
    stream.appendEventPointsMultiplied({ multiplier: 3 });

    assert.deepStrictEqual(stream.views.Sum, { sum: 30 });
  });

  test("unregistered events leave state unchanged", () => {
    const factory = new StreamFactoryBuilder("TestStream")
      .withEvent<PointsAdded>("PointsAdded")
      .withEvent<PointsMultiplied>("PointsMultiplied")
      .withViews()
      .addViewBuilder("Sum", { sum: 0 } satisfies SumState, (b) =>
        b.fromPointsAdded((state: SumState, payload: PointsAdded) => ({
          sum: state.sum + payload.points,
        })),
      )
      .build();

    const stream = factory.create("s1", new StreamAdapterStub(), new SnapshotAdapterStub(), 0);
    stream.appendEventPointsAdded({ points: 5 });
    stream.appendEventPointsMultiplied({ multiplier: 100 }); // no handler — state unchanged

    assert.deepStrictEqual(stream.views.Sum, { sum: 5 });
  });
});
