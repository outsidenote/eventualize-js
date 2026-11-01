import { test, describe, before, after, beforeEach } from "node:test";
import * as assert from "node:assert";
import { context, trace } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import type StreamStoreAffected from "@eventualize/types/stream/StreamStoreAffected";
import { isEvDbSpanEnabled } from "@eventualize/types/telemetry/EvDbSpanPolicy";
import DefaultSpansStreamFactory from "./telemetry-test/DefaultSpansStreamFactory.test-support.js";
import VerboseSpansStreamFactory from "./telemetry-test/VerboseSpansStreamFactory.test-support.js";
import SilentSpansStreamFactory from "./telemetry-test/SilentSpansStreamFactory.test-support.js";
import InMemoryStorageAdapter from "../store/InMemoryStorageAdapter.test-support.js";

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });

/** Records, per adapter call, whether the active span policy turns the adapter span on. */
class PolicySpyAdapter extends InMemoryStorageAdapter {
  public storeSpanOn: boolean[] = [];
  public querySpanOn: boolean[] = [];

  override async storeStreamAsync(
    events: ReadonlyArray<EvDbEvent>,
    messages: ReadonlyArray<EvDbMessage>,
  ): Promise<StreamStoreAffected> {
    this.storeSpanOn.push(isEvDbSpanEnabled("eventualize.adapter.store"));
    // A span made inside the adapter shows which span is the active parent.
    trace.getTracer("spy").startSpan("spy.adapter.store").end();
    return super.storeStreamAsync(events, messages);
  }

  override async *getEventsAsync(
    streamCursor: EvDbStreamCursor,
    pageSize?: number,
  ): AsyncGenerator<EvDbEvent, void, undefined> {
    this.querySpanOn.push(isEvDbSpanEnabled("eventualize.adapter.query.stream"));
    yield* super.getEventsAsync(streamCursor, pageSize);
  }
}

/** Runs every traced operation once: create + 2 appends + store, get, goToOffset + forward, clone. */
async function runAllOperations(
  factory: typeof DefaultSpansStreamFactory,
  adapter: PolicySpyAdapter,
): Promise<void> {
  const stream = factory.create("p-1", adapter, adapter);
  await stream.appendEventAdded({ points: 1 });
  await stream.appendEventAdded({ points: 2 });
  await stream.store();
  const fetched = await factory.get("p-1", adapter, adapter);
  assert.strictEqual(fetched.views.Sum.sum, 3);
  const replay = await factory.goToOffset("p-1", 1, adapter, undefined, 1);
  await replay.forward();
  assert.strictEqual(replay.views.Sum.sum, 3);
  await factory.clone("p-1", "p-2", adapter, adapter);
}

const spanNames = (): string[] =>
  exporter
    .getFinishedSpans()
    .map((s) => s.name)
    .filter((n) => n.startsWith("eventualize."));

describe("StreamFactoryBuilder.withTelemetry", () => {
  before(() => {
    provider.register();
  });
  after(async () => {
    await provider.shutdown();
  });
  beforeEach(() => {
    exporter.reset();
  });

  test("Given no telemetry options, When all operations run, Then only the default spans are produced", async () => {
    const adapter = new PolicySpyAdapter();
    await runAllOperations(DefaultSpansStreamFactory, adapter);

    const names = new Set(spanNames());
    assert.deepStrictEqual([...names].sort(), [
      "eventualize.stream.clone",
      "eventualize.stream.get",
      "eventualize.stream.goToOffset",
      "eventualize.stream.store",
    ]);
    assert.ok(adapter.storeSpanOn.length > 0 && adapter.storeSpanOn.every((on) => !on));
    assert.ok(adapter.querySpanOn.length > 0 && adapter.querySpanOn.every((on) => !on));
  });

  test("Given append and adapter spans turned on, When all operations run, Then append spans exist and adapters see the policy", async () => {
    const adapter = new PolicySpyAdapter();
    await runAllOperations(VerboseSpansStreamFactory, adapter);

    assert.strictEqual(spanNames().filter((n) => n === "eventualize.stream.append").length, 2);
    assert.ok(adapter.storeSpanOn.length > 0 && adapter.storeSpanOn.every((on) => on));
    // Includes the query made by forward(), after goToOffset returned.
    assert.ok(adapter.querySpanOn.length >= 4 && adapter.querySpanOn.every((on) => on));
  });

  test("Given all spans turned off, When all operations run, Then no eventualize span is produced", async () => {
    const adapter = new PolicySpyAdapter();
    await runAllOperations(SilentSpansStreamFactory, adapter);
    assert.deepStrictEqual(spanNames(), []);
  });

  test("Given all spans turned off, When store runs, Then inner spans attach to the caller's span", async () => {
    const adapter = new PolicySpyAdapter();
    const stream = SilentSpansStreamFactory.create("p-1", adapter, adapter);
    await stream.appendEventAdded({ points: 1 });

    const parent = trace.getTracer("test").startSpan("caller");
    await context.with(trace.setSpan(context.active(), parent), () => stream.store());
    parent.end();

    const spans = exporter.getFinishedSpans();
    assert.ok(!spans.some((s) => s.name === "eventualize.stream.store"));
    const inner = spans.find((s) => s.name === "spy.adapter.store");
    assert.strictEqual(inner?.parentSpanContext?.spanId, parent.spanContext().spanId);
  });

  test("Given a policy that turns the store span off, When store fails, Then the error still reaches the caller", async () => {
    const adapter = new PolicySpyAdapter();
    adapter.storeStreamAsync = async () => {
      throw new Error("boom");
    };
    const stream = SilentSpansStreamFactory.create("p-1", adapter, adapter);
    await stream.appendEventAdded({ points: 1 });
    await assert.rejects(() => stream.store(), /boom/);
  });
});
