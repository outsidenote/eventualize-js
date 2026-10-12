import { test, describe } from "node:test";
import * as assert from "node:assert";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";
import EvDbStream from "./EvDbStream.js";
import { createViewFactory } from "../factories/EvDbViewFactory.js";
import InMemoryStorageAdapter from "./InMemoryStorageAdapter.test-support.js";
import type { EvDbView } from "../view/EvDbView.js";

type Events = { Added: { points: number } };
type SumState = {
  sum: number;
  lastCapturedAt: number;
};

const sumView = createViewFactory<SumState, Events>({
  viewName: "Sum",
  streamType: "S",
  defaultState: { sum: 0, lastCapturedAt: 0 },
  handlers: {
    Added: (s, e, m) => ({ sum: s.sum + e.points, lastCapturedAt: m.capturedAt.getTime() }),
  },
});

const producer = (event: EvDbEvent): EvDbMessage[] => [
  EvDbMessage.createFromMetadata(event, "Added Notification", { n: 1 }),
];

class TestStream extends EvDbStream {
  constructor(adapter: InMemoryStorageAdapter) {
    const views: EvDbView<unknown>[] = [sumView.create("s-1", adapter) as EvDbView<unknown>];
    super("S", views, adapter, "s-1", -1, producer);
  }
  replay(e: EvDbEvent): ReadonlyArray<EvDbMessage> {
    return this.applyEvent(e);
  }
  add(points: number): IEvDbEventMetadata {
    const payload: IEvDbPayloadData = { points };
    return this.appendEvent("Added", payload);
  }
  get sum(): number {
    return (this.getViews()["Sum"] as EvDbView<SumState>).state.sum;
  }
  get lastCapturedAt(): number {
    return (this.getViews()["Sum"] as EvDbView<SumState>).state.lastCapturedAt;
  }
}

const storedEvent = (offset: number, points: number, capturedAt: Date): EvDbEvent =>
  new EvDbEvent(
    "Added",
    new EvDbStreamCursor("S", "s-1", offset),
    { points },
    capturedAt,
    "original-writer",
    new Date(),
    "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
    "",
  );

describe("EvDbStream.applyEvent", () => {
  test("applies a stored event to views using its original metadata", () => {
    const stream = new TestStream(new InMemoryStorageAdapter());
    const capturedAt = new Date("2020-01-01T00:00:00Z");
    stream.replay(storedEvent(0, 5, capturedAt));
    assert.strictEqual(stream.sum, 5);
    assert.strictEqual(stream.lastCapturedAt, capturedAt.getTime());
  });

  test("returns produced messages stamped with the event trace context", () => {
    const stream = new TestStream(new InMemoryStorageAdapter());
    const messages = stream.replay(storedEvent(0, 5, new Date()));
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].messageType, "Added Notification");
    assert.strictEqual(
      messages[0].traceparent,
      "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
    );
  });

  test("does not add to pending events or pending messages", () => {
    const stream = new TestStream(new InMemoryStorageAdapter());
    stream.replay(storedEvent(0, 5, new Date()));
    assert.strictEqual(stream.countOfPendingEvents, 0);
    assert.strictEqual(stream.getMessages().length, 0);
  });

  test("appendEvent behaviour is unchanged", () => {
    const stream = new TestStream(new InMemoryStorageAdapter());
    const meta = stream.add(7);
    assert.strictEqual(meta.streamCursor.offset, 0);
    assert.strictEqual(stream.sum, 7);
    assert.strictEqual(stream.countOfPendingEvents, 1);
    assert.strictEqual(stream.getMessages().length, 1);
  });
});
