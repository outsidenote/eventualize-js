# OpenTelemetry Integration Guide

eventualize-js is OTEL-native. The library self-instruments internally—you only
need to configure an OTEL SDK at application startup, and spans appear automatically.

When no OTEL SDK is registered, all instrumentation is a no-op with zero overhead
(handled by `@opentelemetry/api`'s built-in no-op tracer).

---

## Final User Experience — Setup (Once at App Startup)

This is the complete setup. No library API changes are required.

### 1. Install OTEL packages

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node \
            @opentelemetry/exporter-trace-otlp-http \
            @opentelemetry/resources
```

### 2. Configure OTEL SDK at your application entry point

```typescript
// instrumentation.ts  ← run this before anything else (e.g., via --require)
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { eventualizeInstrumentation } from "@eventualize/core/otel";

const sdk = new NodeSDK({
  serviceName: "my-app",
  resource: new Resource({
    "service.name": "my-app",
    "service.version": "1.0.0",
    ...eventualizeInstrumentation().resourceAttributes, // optional
  }),
  traceExporter: new OTLPTraceExporter({
    url: "http://localhost:4318/v1/traces",
  }),
});

sdk.start();
```

### 3. Use eventualize-js as usual — zero API changes

```typescript
const factory = new EvDbStreamFactory({
  eventTypes: [...],
  viewNames: [...],
  // No instrumentation parameter. Library self-instruments.
});

const stream = await factory.getAsync("user-123", "UserStream");
await stream.appendEventUserRegistered({ email: "user@example.com" });
// Spans created automatically and exported to your OTEL backend.
```

---

## Library Tracers

eventualize-js uses these tracer names. Use them for custom sampling rules or
to filter spans in your OTEL backend.

| Tracer Name | Source |
|-------------|--------|
| `@eventualize/core` | Stream factory and stream operations |
| `@eventualize/relational-adapter` | Relational (Prisma) storage adapter |
| `@eventualize/dynamodb-adapter` | DynamoDB storage adapter |
| `@eventualize/mysql-adapter` | MySQL-specific adapter |
| `@eventualize/postgres-adapter` | Postgres-specific adapter |

Use `eventualizeInstrumentation().tracerNames` to get this list programmatically:

```typescript
import { eventualizeInstrumentation } from "@eventualize/core/otel";

const { tracerNames } = eventualizeInstrumentation();
// ["@eventualize/core", "@eventualize/relational-adapter", ...]
```

---

## Span Hierarchy

A typical write operation produces this span tree:

```
[your code]
└── eventualize.stream.get              (@eventualize/core)
    └── eventualize.adapter.query.stream (@eventualize/relational-adapter)
└── eventualize.stream.append           (@eventualize/core)
└── eventualize.stream.store            (@eventualize/core)
    └── eventualize.adapter.store       (@eventualize/relational-adapter)
```

Messages stored in the outbox carry a `traceparent` field populated from the
active span at `appendEvent` time.

---

## Adding Custom Spans (Optional)

### Callback-based with automatic lifecycle (recommended)

```typescript
import { withSpan, getCoreTracer } from "@eventualize/core/otel";

const result = await withSpan(
  getCoreTracer(),
  "my.custom.work",
  async (span) => {
    span.setAttribute("custom.key", "value");
    return await doWork();
  },
);
// Status OK on success, ERROR + exception recorded on throw — automatically.
```

### TypeScript `using` keyword for manual control

```typescript
import { startScopedSpan, getCoreTracer } from "@eventualize/core/otel";
import { SpanStatusCode } from "@opentelemetry/api";

async function processOrder(orderId: string) {
  using scope = startScopedSpan(getCoreTracer(), "order.process", { orderId });

  try {
    const order = await fetchOrder(orderId);
    scope.span.setAttribute("total", order.total);
    const result = await processPayment(order);
    scope.span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    scope.span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
    scope.span.recordException(err as Error);
    throw err;
  }
  // span.end() called automatically when scope exits
}
```

> **Note:** `startScopedSpan` just ends the span on disposal. Error state is your
> responsibility. If you want automatic error detection, use `withSpan` instead.

---

## Message Queue Propagation (Outbox Pattern)

When messages are stored, their `traceparent` field is automatically populated
from the current span context. Use it to propagate trace context through queues.

### pgBoss / Queue Producer

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

Or read directly from the stored `EvDbMessage`:

```typescript
await queue.send("topic", payload, {
  headers: {
    traceparent: message.traceparent,
    tracestate: message.tracestate,
  },
});
```

### Kafka Consumer — Continue the Upstream Trace

```typescript
import { propagation, context } from "@opentelemetry/api";

const carrier = {
  traceparent: msg.headers?.traceparent?.toString(),
  tracestate: msg.headers?.tracestate?.toString(),
};

const parentContext = propagation.extract(context.active(), carrier);

await context.with(parentContext, async () => {
  // All operations here appear as children of the upstream trace
  await processMessage(msg);
});
```

### Kafka Consumer — Link to Upstream (New Root Trace)

Use this when you want a new root trace that *references* the upstream:

```typescript
import { propagation, context, trace } from "@opentelemetry/api";

const carrier = { traceparent: msg.headers.traceparent.toString() };
const upstreamCtx = propagation.extract(context.active(), carrier);
const upstreamSpanCtx = trace.getSpan(upstreamCtx)?.spanContext();

const span = tracer.startSpan("process.message", {
  links: upstreamSpanCtx ? [{ context: upstreamSpanCtx }] : [],
});
```

---

## Disabling Tracing

Don't register an OTEL SDK. `trace.getTracer()` returns a no-op tracer
automatically, and the library has zero overhead.
