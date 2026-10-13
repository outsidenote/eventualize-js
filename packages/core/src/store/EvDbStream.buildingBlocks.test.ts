import { test, describe } from "node:test";
import * as assert from "node:assert";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";
import EvDbStream from "./EvDbStream.js";
import { createViewFactory } from "../factories/EvDbViewFactory.js";
import InMemoryStorageAdapter from "./InMemoryStorageAdapter.test-support.js";
import type { EvDbView } from "../view/EvDbView.js";

type Events = { Added: { points: number } };
type SumState = { sum: number };

const sumView = createViewFactory<SumState, Events>({
  viewName: "Sum",
  streamType: "S",
  defaultState: { sum: 0 },
  handlers: { Added: (s, e) => ({ sum: s.sum + e.points }) },
});

class TestStream extends EvDbStream {
  public producerCalls = 0;
  public lastSeenSum = -1;

  constructor() {
    const adapter = new InMemoryStorageAdapter();
    const views: EvDbView<unknown>[] = [sumView.create("s-1", adapter) as EvDbView<unknown>];
    super("S", views, adapter, "s-1", -1, (event, viewStates) => {
      this.producerCalls++;
      const sum = viewStates["Sum"];
      this.lastSeenSum =
        typeof sum === "object" && sum !== null && "sum" in sum && typeof sum.sum === "number"
          ? sum.sum
          : -1;
      return [EvDbMessage.createFromMetadata(event, "Added", { n: 1 })];
    });
  }
  build(points: number, capturedAt: Date, capturedBy: string): EvDbEvent {
    const payload: IEvDbPayloadData = { points };
    return this.buildEvent("Added", payload, capturedAt, capturedBy);
  }
  views(e: EvDbEvent): void {
    this.applyToViews(e);
  }
  produce(e: EvDbEvent): ReadonlyArray<EvDbMessage> {
    return this.produceMessages(e);
  }
  get sum(): number {
    return (this.getViews()["Sum"] as EvDbView<SumState>).state.sum;
  }
}

describe("EvDbStream building blocks", () => {
  test("buildEvent uses the next offset and the given capturedAt/capturedBy", () => {
    const stream = new TestStream();
    const at = new Date("2020-01-01T00:00:00Z");
    const e = stream.build(5, at, "someone");
    assert.strictEqual(e.streamCursor.offset, 0);
    assert.strictEqual(e.capturedAt.getTime(), at.getTime());
    assert.strictEqual(e.capturedBy, "someone");
    assert.deepStrictEqual(e.payload, { points: 5 });
  });

  test("buildEvent does not add to pending events or apply views", () => {
    const stream = new TestStream();
    stream.build(5, new Date(), "x");
    assert.strictEqual(stream.countOfPendingEvents, 0);
    assert.strictEqual(stream.sum, 0);
  });

  test("applyToViews updates views without calling the producer", () => {
    const stream = new TestStream();
    stream.views(stream.build(5, new Date(), "x"));
    assert.strictEqual(stream.sum, 5);
    assert.strictEqual(stream.producerCalls, 0);
    assert.strictEqual(stream.getMessages().length, 0);
  });

  test("produceMessages runs the producer with the current view states", () => {
    const stream = new TestStream();
    const e = stream.build(5, new Date(), "x");
    stream.views(e);
    const messages = stream.produce(e);
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(stream.producerCalls, 1);
    assert.strictEqual(stream.lastSeenSum, 5);
    assert.strictEqual(stream.getMessages().length, 0);
  });
});
