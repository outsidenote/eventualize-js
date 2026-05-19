import { test, describe, before, after, beforeEach } from "node:test";
import * as assert from "node:assert";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { SpanStatusCode } from "@opentelemetry/api";

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

describe("eventualizeInstrumentation", () => {
  test("returns all tracer names and resource attributes", async () => {
    const { eventualizeInstrumentation, EVDB_TRACER_NAMES } = await import(
      "./tracers.ts"
    );
    const info = eventualizeInstrumentation();
    assert.ok(Array.isArray(info.tracerNames));
    assert.deepStrictEqual(
      info.tracerNames,
      Object.values(EVDB_TRACER_NAMES),
    );
    assert.strictEqual(info.resourceAttributes["eventualize.sdk.language"], "typescript");
    assert.ok(info.resourceAttributes["eventualize.sdk.version"]);
  });
});

describe("withSpan", () => {
  test("sets OK status on success", async () => {
    const { withSpan } = await import("./withSpan.ts");
    const { getCoreTracer } = await import("./tracers.ts");
    const tracer = getCoreTracer();

    await withSpan(tracer, "test.ok", async () => "result");

    const spans = exporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].name, "test.ok");
    assert.strictEqual(spans[0].status.code, SpanStatusCode.OK);
  });

  test("sets ERROR status and records exception on throw", async () => {
    const { withSpan } = await import("./withSpan.ts");
    const { getCoreTracer } = await import("./tracers.ts");
    const tracer = getCoreTracer();

    const err = new Error("oops");
    await assert.rejects(
      () => withSpan(tracer, "test.err", async () => { throw err; }),
      err,
    );

    const spans = exporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
    assert.strictEqual(spans[0].status.message, "oops");
    assert.ok(spans[0].events.some((e) => e.name === "exception"));
  });

  test("always calls span.end()", async () => {
    const { withSpan } = await import("./withSpan.ts");
    const { getCoreTracer } = await import("./tracers.ts");
    const tracer = getCoreTracer();

    await withSpan(tracer, "test.end", async () => "done");

    const spans = exporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.ok(spans[0].endTime[0] > 0, "span should have ended");
  });

  test("passes attributes to span", async () => {
    const { withSpan } = await import("./withSpan.ts");
    const { getCoreTracer } = await import("./tracers.ts");
    const tracer = getCoreTracer();

    await withSpan(tracer, "test.attrs", async () => {}, { "custom.key": "value" });

    const spans = exporter.getFinishedSpans();
    assert.strictEqual(spans[0].attributes["custom.key"], "value");
  });
});

describe("startScopedSpan", () => {
  test("calls span.end() when scope exits via Symbol.dispose", async () => {
    const { startScopedSpan } = await import("./startScopedSpan.ts");
    const { getCoreTracer } = await import("./tracers.ts");
    const tracer = getCoreTracer();

    {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      using scope = startScopedSpan(tracer, "test.scoped");
      scope.span.setAttribute("foo", "bar");
    }

    const spans = exporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].name, "test.scoped");
    assert.ok(spans[0].endTime[0] > 0, "span should have ended");
  });

  test("span attributes set before dispose are visible in finished span", async () => {
    const { startScopedSpan } = await import("./startScopedSpan.ts");
    const { getCoreTracer } = await import("./tracers.ts");
    const tracer = getCoreTracer();

    {
      using scope = startScopedSpan(tracer, "test.attr", { "init.key": "init" });
      scope.span.setAttribute("runtime.key", "runtime");
    }

    const spans = exporter.getFinishedSpans();
    assert.strictEqual(spans[0].attributes["init.key"], "init");
    assert.strictEqual(spans[0].attributes["runtime.key"], "runtime");
  });
});
