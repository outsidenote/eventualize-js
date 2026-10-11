import { test, describe, before, after, beforeEach } from "node:test";
import * as assert from "node:assert";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { SpanStatusCode, context, propagation, trace } from "@opentelemetry/api";

import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import StreamStoreAffected from "@eventualize/types/stream/StreamStoreAffected";

import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";

// Custom storage adapter that captures events and messages for inspection
class RecordingStorageAdapter implements IEvDbStorageStreamAdapter {
  public recordedEvents: EvDbEvent[] = [];
  public recordedMessages: EvDbMessage[] = [];

  async storeStreamAsync(
    events: ReadonlyArray<EvDbEvent>,
    messages: ReadonlyArray<EvDbMessage>,
  ): Promise<StreamStoreAffected> {
    this.recordedEvents = [...events];
    this.recordedMessages = [...messages];
    return new StreamStoreAffected(events.length, undefined);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  getEventsAsync(_streamCursor: any): AsyncGenerator<any, void, undefined> {
    throw new Error("Method not implemented.");
  }
  getLastOffsetAsync(_address: any): Promise<number> {
    throw new Error("Method not implemented.");
  }
  getFromOutbox(_filter: any, _options?: any): Promise<AsyncIterable<EvDbMessage>> {
    throw new Error("Method not implemented.");
  }
  getFromOutboxAsync(
    _shard: any,
    _filter: any,
    _options?: any,
    _cancellation?: any,
  ): AsyncIterable<EvDbMessage> {
    throw new Error("Method not implemented.");
  }
  getRecordsFromOutboxAsync(
    _filter?: any,
    _options?: any,
    _cancellation?: any,
  ): AsyncIterable<EvDbMessage> {
    throw new Error("Method not implemented.");
  }
  subscribeToMessageAsync(_handler: any, _filter?: any, _options?: any): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getSnapshotAsync(_viewAddress: any, _signal?: any): Promise<any> {
    throw new Error("Method not implemented.");
  }
  storeSnapshotAsync(_snapshotData: any, _signal?: any): Promise<void> {
    throw new Error("Method not implemented.");
  }
}

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

before(() => {
  provider.register();
});

after(() => {
  provider.shutdown();
});

beforeEach(() => {
  exporter.reset();
});

describe("otel_flow_test", () => {
  test("event and message capture traceparent from current active span", async () => {
    const tracer = trace.getTracer("test-tracer");

    // Create a parent span with a specific name
    const parentSpan = tracer.startSpan("parent-span-ctx");

    try {
      // Create an event INSIDE the parent span context - it should capture from THIS span
      const event = context.with(trace.setSpan(context.active(), parentSpan), () => {
        const cursor = new EvDbStreamCursor("test-stream", "stream-1", 1);
        return new EvDbEvent("TestEvent", cursor, { key: "value" }, new Date(), "test-captured");
      });

      // The event should have a valid traceparent
      assert.ok(event.traceparent, "Event should have traceparent");

      // Verify the traceparent is in valid W3C format
      assert.ok(
        event.traceparent.match(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/),
        "traceparent should be valid W3C format",
      );

      // Similarly for message inside same span
      const message = context.with(trace.setSpan(context.active(), parentSpan), () => {
        const cursor = new EvDbStreamCursor("test-stream", "stream-1", 1);
        return EvDbMessage.create(cursor, "TestMessage", "TestMessage", { key: "value" });
      });

      assert.ok(message.traceparent, "Message should have traceparent");
      assert.ok(
        message.traceparent.match(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/),
        "traceparent should be valid W3C format",
      );
    } finally {
      parentSpan.setStatus({ code: SpanStatusCode.OK });
      parentSpan.end();
    }
  });

  test("event stores trace context when persisted via storage adapter", async () => {
    const tracer = trace.getTracer("test-tracer");
    const storageAdapter = new RecordingStorageAdapter();

    let capturedTP: string | undefined;
    let capturedTS: string | undefined;

    // Create a span and capture its carrier
    const span = tracer.startSpan("event-persistence-test");
    context.with(trace.setSpan(context.active(), span), () => {
      const carrier: Record<string, string> = {};
      propagation.inject(context.active(), carrier);
      capturedTP = carrier["traceparent"];
      capturedTS = carrier["tracestate"];
    });

    // Now create event and message WITHIN the same context - they should capture the same trace context
    context.with(trace.setSpan(context.active(), span), () => {
      const cursor = new EvDbStreamCursor("funds-stream", "acc-1", 1);
      const event = new EvDbEvent(
        "FundsDeposited",
        cursor,
        { accountId: "acc-1", amount: 100, currency: "USD" },
        new Date(),
        "test",
      );

      const message = EvDbMessage.create(cursor, "FundsDeposited", "funds-deposited-notice", {
        accountId: "acc-1",
        amount: 100,
        currency: "USD",
      });

      // Store via adapter
      storageAdapter.storeStreamAsync([event], [message]);
    });

    // Verify the events and messages in the adapter have the captured trace context
    assert.strictEqual(storageAdapter.recordedEvents.length, 1);
    assert.strictEqual(storageAdapter.recordedEvents[0].traceparent, capturedTP);
    if (storageAdapter.recordedEvents[0].tracestate !== undefined) {
      assert.strictEqual(storageAdapter.recordedEvents[0].tracestate, capturedTS);
    }

    assert.strictEqual(storageAdapter.recordedMessages.length, 1);
    assert.strictEqual(storageAdapter.recordedMessages[0].traceparent, capturedTP);
    if (storageAdapter.recordedMessages[0].tracestate !== undefined) {
      assert.strictEqual(storageAdapter.recordedMessages[0].tracestate, capturedTS);
    }
  });

  test("message created with withTraceparent captures context when params omitted", async () => {
    const tracer = trace.getTracer("test-tracer");
    let carrierTP: string | undefined;
    let carrierTS: string | undefined;

    const span = tracer.startSpan("withTraceparent-test");
    context.with(trace.setSpan(context.active(), span), () => {
      const carrier: Record<string, string> = {};
      propagation.inject(context.active(), carrier);
      carrierTP = carrier["traceparent"];
      carrierTS = carrier["tracestate"];
    });

    // Create a base message
    context.with(trace.setSpan(context.active(), span), () => {
      const cursor = new EvDbStreamCursor("test-stream", "stream-1", 1);
      const message = EvDbMessage.create(cursor, "TestEvent", "TestMessage", {});

      // Create a new message with withTraceparent (no args - should capture from current span)
      const updatedMessage = message.withTraceparent();
      assert.strictEqual(updatedMessage.traceparent, carrierTP);
      if (carrierTS !== undefined) {
        assert.strictEqual(updatedMessage.tracestate, carrierTS);
      }
    });
  });

  test("multiple events created in same context capture same trace context", async () => {
    const tracer = trace.getTracer("test-tracer");
    let carrierTP: string | undefined;
    let carrierTS: string | undefined;

    const span = tracer.startSpan("multiple-events-test");
    context.with(trace.setSpan(context.active(), span), () => {
      const carrier: Record<string, string> = {};
      propagation.inject(context.active(), carrier);
      carrierTP = carrier["traceparent"];
      carrierTS = carrier["tracestate"];
    });

    // Create multiple events within the same context
    const events: EvDbEvent[] = [];
    context.with(trace.setSpan(context.active(), span), () => {
      for (let i = 1; i <= 3; i++) {
        const cursor = new EvDbStreamCursor("funds-stream", "acc-1", i);
        events.push(new EvDbEvent(`Event${i}`, cursor, {}, new Date(), "test"));
      }
    });

    // All should have the same trace context from the original span
    assert.strictEqual(events.length, 3);
    for (const event of events) {
      assert.strictEqual(event.traceparent, carrierTP);
      if (carrierTS !== undefined) {
        assert.strictEqual(event.tracestate, carrierTS);
      }
    }
  });

  test("manual trace propagation via withTraceparent works correctly", async () => {
    const tracer = trace.getTracer("test-tracer");
    let carrierTP: string | undefined;
    let carrierTS: string | undefined;

    const span = tracer.startSpan("manual-propagation-test");
    context.with(trace.setSpan(context.active(), span), () => {
      const carrier: Record<string, string> = {};
      propagation.inject(context.active(), carrier);
      carrierTP = carrier["traceparent"];
      carrierTS = carrier["tracestate"];
    });

    // Create event with explicit trace context from carrier within the span
    let event: EvDbEvent | undefined;
    context.with(trace.setSpan(context.active(), span), () => {
      const cursor = new EvDbStreamCursor("funds-stream", "acc-1", 1);
      event = new EvDbEvent(
        "FundsDeposited",
        cursor,
        { accountId: "acc-1", amount: 50, currency: "USD" },
        new Date(),
        "test",
        undefined,
        carrierTP,
        carrierTS,
      );
    });

    assert.ok(event, "Event should be defined");
    assert.strictEqual(event.traceparent, carrierTP);
    if (carrierTS !== undefined) {
      assert.strictEqual(event.tracestate, carrierTS);
    }

    // Message created from event metadata should capture context
    let message: EvDbMessage | undefined;
    context.with(trace.setSpan(context.active(), span), () => {
      message = EvDbMessage.createFromMetadata(event!, "funds-deposited-notice", {
        accountId: "acc-1",
        amount: 50,
        currency: "USD",
      });
    });

    assert.ok(message, "Message should be defined");
    assert.strictEqual(message.traceparent, carrierTP);
    if (carrierTS !== undefined) {
      assert.strictEqual(message.tracestate, carrierTS);
    }
  });
});
