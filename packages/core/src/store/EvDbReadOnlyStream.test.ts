import { test, describe } from "node:test";
import * as assert from "node:assert";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import { EvDbReadOnlyStream } from "./EvDbReadOnlyStream.js";
import type { IEvDbReplayTarget } from "./EvDbReadOnlyStream.js";
import InMemoryStorageAdapter from "./InMemoryStorageAdapter.test-support.js";

type Views = {
  Sum: { sum: number };
};

const address = new EvDbStreamAddress("S", "s-1");

const ev = (offset: number, points: number): EvDbEvent =>
  new EvDbEvent(
    "Added",
    new EvDbStreamCursor(address, offset),
    { points },
    new Date(),
    "test",
    new Date(),
  );

/** Folds `points` into a sum and emits one message per event. */
class SumTarget implements IEvDbReplayTarget<Views> {
  private sum = 0;
  public applied: number[] = [];
  get views(): Readonly<Views> {
    return { Sum: { sum: this.sum } };
  }
  replayEvent(e: EvDbEvent): ReadonlyArray<EvDbMessage> {
    const points = e.payload["points"];
    this.sum += typeof points === "number" ? points : 0;
    this.applied.push(e.streamCursor.offset);
    return [EvDbMessage.createFromMetadata(e, "Added", { at: e.streamCursor.offset })];
  }
}

const seeded = (count: number): InMemoryStorageAdapter => {
  const adapter = new InMemoryStorageAdapter();
  adapter.seedEvents(Array.from({ length: count }, (_, i) => ev(i, i + 1)));
  return adapter;
};

const open = (adapter: InMemoryStorageAdapter, target: SumTarget, offset: number, pageSize = 2) =>
  EvDbReadOnlyStream.open<Views>({
    target,
    streamStorageAdapter: adapter,
    streamAddress: address,
    fromOffset: 0,
    offset,
    pageSize,
  });

describe("EvDbReadOnlyStream", () => {
  test("positions on the target offset with views folded up to it", async () => {
    const target = new SumTarget();
    const s = await open(seeded(6), target, 3);
    assert.strictEqual(s.event.streamCursor.offset, 3);
    assert.deepStrictEqual(s.views, { Sum: { sum: 1 + 2 + 3 + 4 } });
    assert.deepStrictEqual(target.applied, [0, 1, 2, 3]);
    assert.strictEqual(s.messages.length, 1);
    assert.strictEqual(s.isHead, false);
  });

  test("forward walks every offset once across page boundaries", async () => {
    const target = new SumTarget();
    const s = await open(seeded(7), target, 0, 2);
    const seen = [s.event.streamCursor.offset];
    while (!s.isHead) {
      await s.forward();
      seen.push(s.event.streamCursor.offset);
    }
    assert.deepStrictEqual(seen, [0, 1, 2, 3, 4, 5, 6]);
    assert.deepStrictEqual(target.applied, [0, 1, 2, 3, 4, 5, 6]);
  });

  test("forward returns the same instance", async () => {
    const s = await open(seeded(3), new SumTarget(), 0);
    const returned = await s.forward();
    assert.strictEqual(returned, s);
  });

  test("forward(n) moves n events and keeps messages of the last one only", async () => {
    const s = await open(seeded(6), new SumTarget(), 0);
    await s.forward(3);
    assert.strictEqual(s.event.streamCursor.offset, 3);
    assert.strictEqual(s.messages.length, 1);
    assert.strictEqual(s.messages[0].streamCursor.offset, 3);
  });

  test("forward(n) past the head stops at the last event", async () => {
    const s = await open(seeded(4), new SumTarget(), 1);
    await s.forward(10);
    assert.strictEqual(s.event.streamCursor.offset, 3);
    assert.strictEqual(s.isHead, true);
  });

  test("isHead is true on the last event and forward there is a no-op", async () => {
    const target = new SumTarget();
    const s = await open(seeded(3), target, 2);
    assert.strictEqual(s.isHead, true);
    await s.forward();
    assert.strictEqual(s.event.streamCursor.offset, 2);
    assert.deepStrictEqual(target.applied, [0, 1, 2]);
  });

  test("isHead is false when the target is the last event of a page", async () => {
    const s = await open(seeded(5), new SumTarget(), 1, 2);
    assert.strictEqual(s.isHead, false);
  });

  test("forward at the head picks up events stored later", async () => {
    const adapter = seeded(2);
    const s = await open(adapter, new SumTarget(), 1);
    assert.strictEqual(s.isHead, true);
    adapter.seedEvents([ev(2, 3)]);
    await s.forward();
    assert.strictEqual(s.event.streamCursor.offset, 2);
  });

  test("throws RangeError when the target offset is past the head", async () => {
    await assert.rejects(open(seeded(3), new SumTarget(), 9), RangeError);
  });

  test("throws RangeError on an empty stream", async () => {
    await assert.rejects(open(new InMemoryStorageAdapter(), new SumTarget(), 0), RangeError);
  });

  test("throws RangeError when the target offset falls in a gap", async () => {
    const adapter = new InMemoryStorageAdapter();
    adapter.seedEvents([ev(1, 1), ev(2, 2)]); // no offset 0
    await assert.rejects(open(adapter, new SumTarget(), 0), RangeError);
  });

  test("a throwing replayEvent leaves the event buffered so a retry re-applies it", async () => {
    const target = new SumTarget();
    let failOnceAt: number | undefined = 2;
    const replay = target.replayEvent.bind(target);
    target.replayEvent = (e: EvDbEvent): ReadonlyArray<EvDbMessage> => {
      if (e.streamCursor.offset === failOnceAt) {
        failOnceAt = undefined;
        throw new Error("view handler failed");
      }
      return replay(e);
    };
    const s = await open(seeded(5), target, 1);
    await assert.rejects(s.forward(), /view handler failed/);
    assert.strictEqual(s.event.streamCursor.offset, 1);
    assert.deepStrictEqual(target.applied, [0, 1]);
    await s.forward();
    assert.strictEqual(s.event.streamCursor.offset, 2);
    assert.deepStrictEqual(target.applied, [0, 1, 2]);
  });

  test("forward rejects steps that are not positive integers", async () => {
    const s = await open(seeded(3), new SumTarget(), 0);
    await assert.rejects(s.forward(0), RangeError);
    await assert.rejects(s.forward(-1), RangeError);
    await assert.rejects(s.forward(1.5), RangeError);
  });

  test("has no write members at runtime", async () => {
    const s = await open(seeded(2), new SumTarget(), 0);
    const members = s as unknown as Record<string, unknown>;
    assert.strictEqual(members["store"], undefined);
    assert.strictEqual(members["appendToOutbox"], undefined);
    assert.strictEqual(members["appendEvent"], undefined);
  });
});
