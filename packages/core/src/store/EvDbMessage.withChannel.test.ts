import { test, describe } from "node:test";
import * as assert from "node:assert";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";

describe("EvDbMessage.withChannel", () => {
  test("returns a copy on the new channel and keeps every other field", () => {
    const original = EvDbMessage.create(
      new EvDbStreamCursor("S", "s-1", 3),
      "Added",
      "Note",
      { a: 1 },
      "points",
      "shard-1",
      "id-1",
      "json",
      new Date(1000),
      "writer",
      "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      "k=v",
    );
    const copy = original.withChannel("sandbox.points");

    assert.notStrictEqual(copy, original);
    assert.strictEqual(copy.channel, "sandbox.points");
    assert.strictEqual(original.channel, "points");
    assert.strictEqual(copy.id, original.id);
    assert.strictEqual(copy.eventType, original.eventType);
    assert.strictEqual(copy.shardName, original.shardName);
    assert.strictEqual(copy.messageType, original.messageType);
    assert.strictEqual(copy.serializeType, original.serializeType);
    assert.strictEqual(copy.capturedAt, original.capturedAt);
    assert.strictEqual(copy.capturedBy, original.capturedBy);
    assert.strictEqual(copy.streamCursor, original.streamCursor);
    assert.strictEqual(copy.payload, original.payload);
    assert.strictEqual(copy.storedAt, original.storedAt);
    assert.strictEqual(copy.traceparent, original.traceparent);
    assert.strictEqual(copy.tracestate, original.tracestate);
  });
});
