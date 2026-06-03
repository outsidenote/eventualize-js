var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
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
        const { eventualizeInstrumentation, EVDB_TRACER_NAMES } = await import("./tracers.ts");
        const info = eventualizeInstrumentation();
        assert.ok(Array.isArray(info.tracerNames));
        assert.deepStrictEqual(info.tracerNames, Object.values(EVDB_TRACER_NAMES));
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
        await assert.rejects(() => withSpan(tracer, "test.err", async () => { throw err; }), err);
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
        await withSpan(tracer, "test.attrs", async () => { }, { "custom.key": "value" });
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
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const scope = __addDisposableResource(env_1, startScopedSpan(tracer, "test.scoped"), false);
                scope.span.setAttribute("foo", "bar");
            }
            catch (e_1) {
                env_1.error = e_1;
                env_1.hasError = true;
            }
            finally {
                __disposeResources(env_1);
            }
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
            const env_2 = { stack: [], error: void 0, hasError: false };
            try {
                const scope = __addDisposableResource(env_2, startScopedSpan(tracer, "test.attr", { "init.key": "init" }), false);
                scope.span.setAttribute("runtime.key", "runtime");
            }
            catch (e_2) {
                env_2.error = e_2;
                env_2.hasError = true;
            }
            finally {
                __disposeResources(env_2);
            }
        }
        const spans = exporter.getFinishedSpans();
        assert.strictEqual(spans[0].attributes["init.key"], "init");
        assert.strictEqual(spans[0].attributes["runtime.key"], "runtime");
    });
});
//# sourceMappingURL=otel.test.js.map