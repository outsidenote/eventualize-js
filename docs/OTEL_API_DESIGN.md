# OpenTelemetry API Design — Final (v3)

**Goal:** Zero-config OTEL integration. Library self-instruments internally. Users only configure OTEL SDK at process startup—no `instrumentation` parameter, no setup, no plumbing.

---

## Core Principles

1. **Self-instrumenting library** — Each package internally calls `trace.getTracer("@eventualize/...")`. No user wiring required.
2. **Auto-discovery via OTEL** — When user configures OTEL SDK globally, library spans appear automatically (OTEL JS doesn't require `AddSource` like .NET).
3. **Zero-overhead no-op** — When no OTEL SDK is registered, `trace.getTracer()` returns a no-op tracer (built-in behavior).
4. **Hide the boilerplate** — Internal `withSpan` helper handles try/finally + status + recordException + end.
5. **OTEL standards everywhere** — Use `Span`, `Tracer`, `Attributes`, `propagation.inject/extract` directly.

---

## User-Facing API

### Setup (Once, at Process Entry)

```typescript
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { eventualizeInstrumentation } from "@eventualize/core/otel";

const sdk = new NodeSDK({
  serviceName: "my-app",
  resource: new Resource({
    "service.name": "my-app",
    "service.version": "1.0.0",
    ...eventualizeInstrumentation().resourceAttributes, // Optional
  }),
  traceExporter: new OTLPTraceExporter({
    url: "http://localhost:4318/v1/traces",
  }),
});

sdk.start();
```

That's it. From here, all eventualize-js operations are traced.

### Using the Library (Unchanged from Pre-OTEL Code)

```typescript
const factory = new EvDbStreamFactory({
  eventTypes: [...],
  viewNames: [...],
  // No instrumentation parameter.
});

const stream = await factory.getAsync("user-123", "UserStream");
await stream.appendEventUserRegistered({ email: "user@example.com" });
// Spans created automatically under "@eventualize/core" tracer.
```

### Optional Setup Helper

```typescript
import { eventualizeInstrumentation } from "@eventualize/core/otel";

const evdb = eventualizeInstrumentation();

evdb.tracerNames;
// [
//   "@eventualize/core",
//   "@eventualize/relational-adapter",
//   "@eventualize/dynamodb-adapter",
//   "@eventualize/mysql-adapter",
//   "@eventualize/postgres-adapter"
// ]

evdb.resourceAttributes;
// { "eventualize.sdk.version": "4.x.x", "eventualize.sdk.language": "typescript" }
```

Use the tracer names list for:
- Documentation
- Custom samplers that filter Eventualize spans
- Debugging which library produced a span

---

## Public Exports

```typescript
// @eventualize/core/otel
export { EVDB_TRACER_NAMES, eventualizeInstrumentation } from "./tracers.js";

// Optional utilities for users who want to add custom spans under Eventualize tracers
export { withSpan } from "./withSpan.js";
export { startScopedSpan, type IDisposableSpan } from "./startScopedSpan.js";

// Tracer accessors (for advanced users / custom integration)
export { getCoreTracer } from "./tracers.js";
```

Users typically import nothing from `@eventualize/core/otel`. The helpers above are available for users who want to extend the instrumentation.

---

## Internal Library Design

### `tracers.ts` — Named Tracer Factories

```typescript
// packages/core/src/otel/tracers.ts
import { trace } from "@opentelemetry/api";

const EVDB_VERSION = "4.x.x"; // From package.json at build time

/**
 * Tracer names used by eventualize-js packages.
 * Exposed for documentation, custom sampling, and debugging.
 */
export const EVDB_TRACER_NAMES = {
  CORE: "@eventualize/core",
  ADAPTER_RELATIONAL: "@eventualize/relational-adapter",
  ADAPTER_DYNAMODB: "@eventualize/dynamodb-adapter",
  ADAPTER_MYSQL: "@eventualize/mysql-adapter",
  ADAPTER_POSTGRES: "@eventualize/postgres-adapter",
} as const;

/**
 * Returns metadata about Eventualize instrumentation.
 * Used at SDK configuration time.
 */
export function eventualizeInstrumentation() {
  return {
    /** All tracer names used by eventualize-js. */
    tracerNames: Object.values(EVDB_TRACER_NAMES),

    /** Resource attributes to add at SDK configuration. */
    resourceAttributes: {
      "eventualize.sdk.version": EVDB_VERSION,
      "eventualize.sdk.language": "typescript",
    },
  };
}

// === Internal tracer accessors used by library code ===

export function getCoreTracer() {
  return trace.getTracer(EVDB_TRACER_NAMES.CORE, EVDB_VERSION);
}
```

Each adapter package has a similar `tracers.ts` exposing its own tracer accessor:

```typescript
// packages/adapters/relational-storage-adapter/src/otel/tracers.ts
import { trace } from "@opentelemetry/api";
import { EVDB_TRACER_NAMES } from "@eventualize/core/otel";

export function getRelationalAdapterTracer() {
  return trace.getTracer(EVDB_TRACER_NAMES.ADAPTER_RELATIONAL, "4.x.x");
}
```

### `withSpan.ts` — Auto-Lifecycle Wrapper

```typescript
// packages/core/src/otel/withSpan.ts
import { SpanStatusCode } from "@opentelemetry/api";
import type { Span, Tracer, Attributes } from "@opentelemetry/api";

/**
 * Execute a function within an OTEL span with automatic lifecycle:
 *   - Status OK on success
 *   - Status ERROR + recordException on throw
 *   - span.end() always called
 */
export async function withSpan<T>(
  tracer: Tracer,
  spanName: string,
  fn: (span: Span) => T | Promise<T>,
  attributes?: Attributes,
): Promise<T> {
  return tracer.startActiveSpan(spanName, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      const err = error as Error;
      span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message });
      if (err instanceof Error) {
        span.recordException(err);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### `startScopedSpan.ts` — TS `using` Scope

```typescript
// packages/core/src/otel/startScopedSpan.ts
import type { Span, Tracer, Attributes } from "@opentelemetry/api";

/**
 * Scoped span for use with TypeScript's `using` keyword.
 *
 * Calls span.end() automatically when the scope exits.
 * Error handling and span status are the caller's responsibility —
 * use withSpan() if you want automatic error detection.
 */
export interface IDisposableSpan {
  readonly span: Span;
  /** Auto-called by TS `using`. Ends the span. */
  [Symbol.dispose](): void;
}

export function startScopedSpan(
  tracer: Tracer,
  spanName: string,
  attributes?: Attributes,
): IDisposableSpan {
  const span = tracer.startSpan(spanName, { attributes });

  return {
    span,
    [Symbol.dispose]() {
      span.end();
    },
  };
}
```

### Library Code Uses Tracers Directly

```typescript
// packages/core/src/factories/EvDbStreamFactory.ts
import { getCoreTracer } from "../otel/tracers.js";
import { withSpan } from "../otel/withSpan.js";

export class EvDbStreamFactory<...> {
  async getAsync(streamId: string, streamType: TStreamType) {
    return withSpan(
      getCoreTracer(),
      "eventualize.stream.get",
      async (span) => {
        span.setAttribute("eventualize.stream.id", streamId);
        span.setAttribute("eventualize.stream.type", streamType);
        // ... existing logic
      },
    );
  }
}
```

```typescript
// packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts
import { withSpan } from "@eventualize/core/otel";
import { getRelationalAdapterTracer } from "./otel/tracers.js";

export class EvDbPrismaStorageAdapter {
  async storeAsync(messages: EvDbMessage[]) {
    return withSpan(
      getRelationalAdapterTracer(),
      "eventualize.adapter.store",
      async (span) => {
        span.setAttribute("eventualize.adapter.kind", "relational");
        span.setAttribute("eventualize.message.count", messages.length);
        // ... existing store logic
      },
    );
  }
}
```

---

## Trace Context Propagation

Library captures W3C traceparent automatically when creating messages. User code in queue producers/consumers uses standard OTEL `propagation` API.

### Library: Capturing Traceparent in Messages

```typescript
// Inside EvDbStream when creating a message:
import { propagation, context } from "@opentelemetry/api";

function getTraceparent(): { traceparent?: string; tracestate?: string } {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return {
    traceparent: carrier["traceparent"],
    tracestate: carrier["tracestate"],
  };
}

const { traceparent, tracestate } = getTraceparent();
const message = EvDbMessage.create(/*...*/, traceparent, tracestate);
```

### User Code: pgBoss / Kafka Producer

```typescript
import { propagation, context } from "@opentelemetry/api";

const carrier: Record<string, string> = {};
propagation.inject(context.active(), carrier);

await queue.send("topic", payload, {
  headers: {
    traceparent: carrier.traceparent,
    tracestate: carrier.tracestate,
  },
});
```

### User Code: Kafka Consumer (Parent Context)

```typescript
import { propagation, context } from "@opentelemetry/api";

const carrier = {
  traceparent: msg.headers?.traceparent?.toString(),
  tracestate: msg.headers?.tracestate?.toString(),
};

const parentContext = propagation.extract(context.active(), carrier);
await context.with(parentContext, async () => {
  await processMessage(msg);
});
```

---

## API Surface Summary

### Required Imports (Most Users)

**None.** Just configure OTEL SDK at startup. Library self-instruments.

### Optional Imports (Power Users)

```typescript
import {
  EVDB_TRACER_NAMES,           // List of library tracer names
  eventualizeInstrumentation,  // Setup helper (info only)
  withSpan,                    // Add custom spans under Eventualize tracers
  startScopedSpan,             // `using`-based custom spans
  getCoreTracer,               // Direct tracer access
} from "@eventualize/core/otel";
```

---

## Comparison: Earlier Designs → v3

| Aspect | v1/v2 (Helper Class) | v3 (Self-Instrumented) |
|--------|---------------------|------------------------|
| User must create instrumentation? | Yes (`new EvDbInstrumentation()`) | **No** |
| Factory takes `instrumentation` param? | Yes | **No** |
| Each adapter accepts `instrumentation`? | Yes | **No** |
| OTEL SDK setup required for tracing? | Yes | Yes |
| User code changes to enable? | Add 2 lines | **Zero** |
| Tracer names | One: `@eventualize` | Per-package, more granular |
| Code surface | Helper class with 4 methods | Constants + 1 info helper |

---

## What We're NOT Building

| Removed | Reason |
|---------|--------|
| `EvDbInstrumentation` class | Library self-instruments; no class needed |
| `instrumentation` config field | Not required—OTEL auto-discovers tracers |
| Custom `IOTelInstrumentation` interface | OTEL `Tracer` IS the abstraction |
| Custom no-op tracer | OTEL provides one automatically |
| Custom W3C parsing | OTEL `propagation.inject/extract` handles it |
| Wrapper class for tracers | Just use `trace.getTracer(name)` directly |
| `getCurrentSpan()` helper | Standard `trace.getActiveSpan()` works |

---

## Why This Is Better

1. **Idiomatic OTEL** — Matches how `pg`, `@aws-sdk`, `mongoose`, etc. instrument themselves
2. **Zero config friction** — Users don't even need to know we have OTEL until they want traces
3. **Smaller code surface** — One info helper instead of a class hierarchy
4. **Per-package tracers** — Finer-grained filtering ("show me only DynamoDB spans")
5. **No backwards compat concerns** — No new constructor parameters anywhere
6. **TypeScript-native scope** — `startScopedSpan` + TS `using` keyword, span ends automatically on scope exit

---

## Summary

| Pattern | When to Use |
|---------|-------------|
| Just configure OTEL SDK | All users — basic tracing |
| `eventualizeInstrumentation()` | Want resource attributes or tracer name list |
| `withSpan(tracer, name, fn, attrs)` | Adding custom spans (e.g., in event handlers) |
| `using span = startScopedSpan(...)` | Long methods, manual control; you own error state |
| `trace.getActiveSpan()` | Access current span anywhere (OTEL standard) |
