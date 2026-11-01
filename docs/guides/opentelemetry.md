# OpenTelemetry Integration Guide

eventualize-js is OTEL-native. The library self-instruments internally—you only
need to configure an OTEL SDK at application startup, and spans appear automatically.

When no OTEL SDK is registered, all instrumentation is a no-op with zero overhead
(handled by `@opentelemetry/api`'s built-in no-op tracer).

---

## Setup (once, at app startup)

You configure an OTEL SDK. The library needs no extra options. To choose which
spans a stream factory produces, see
[Choose which spans to produce](#choose-which-spans-to-produce).

### 1. Install OTEL packages

```bash
pnpm add @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-proto
```

`@opentelemetry/api` is listed as an optional peer dependency, but
`@eventualize/types` and `@eventualize/core` import it. Install it in every app
that uses eventualize-js.

### 2. Start the SDK before any other import

```typescript
// otel.ts — import this file first, before anything else
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";

const sdk = new NodeSDK({
  serviceName: "my-app",
  traceExporter: new OTLPTraceExporter({ url: "http://localhost:4318/v1/traces" }),
});

sdk.start();
```

```typescript
// index.ts
import "./otel.js"; // must be the first import
```

To tag your resource with the library version, spread
`eventualizeInstrumentation().resourceAttributes` (from `@eventualize/core/otel`)
into your resource attributes.

A full working setup (traces, metrics, logs) is in
[`apps/otel-sample-app/src/otel.ts`](../../apps/otel-sample-app/src/otel.ts).

### 3. Use eventualize-js as usual

```typescript
const stream = await FundsStreamFactory.get("account-1", storageAdapter, storageAdapter);
await stream.appendEventFundsDeposited({ amount: 100 });
await stream.store();
// Spans are created automatically and exported to your OTEL backend.
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

With all spans on, a typical write operation produces this span tree. By
default, the spans marked `(off)` are not produced:

```
[your code]
└── eventualize.stream.get              (@eventualize/core)
    └── eventualize.adapter.query.stream (@eventualize/relational-adapter)  (off)
└── eventualize.stream.append           (@eventualize/core)                (off)
└── eventualize.stream.store            (@eventualize/core)
    └── eventualize.adapter.store       (@eventualize/relational-adapter)  (off)
```

When a span is off, the spans inside it attach to the nearest span that is on,
or to your span. Spans from other instrumentation (for example `pg` or the AWS
SDK) are not affected.

Messages stored in the outbox carry a `traceparent` field populated from the
active span at `appendEvent` time.

Adapter spans carry the `eventualize.adapter.kind` attribute: `postgres`,
`mysql`, `dynamodb`, or `relational`. The Prisma adapter reports the `kind`
you pass to its constructor, and `relational` when you pass none:

```typescript
const storage = new EvDbPrismaStorageAdapter(client, { kind: "postgres" });
```

---

## Choose which spans to produce

Each stream factory decides which eventualize spans its streams produce. Use
this to balance detail against noise. Call `.withTelemetry()` before `.build()`:

```typescript
const FundsStreamFactory = new StreamFactoryBuilder("FundsStream")
  .withEvent("FundsDeposited")
  .asType<FundsDeposited>()
  .withView("Balance", { balance: 0 }, balanceHandlers)
  .withTelemetry({
    spans: {
      "eventualize.stream.append": true, // turn on (default off)
      "eventualize.adapter.*": true, // all adapter spans on
      "eventualize.stream.goToOffset": false, // turn off (default on)
    },
  })
  .build();
```

Without `.withTelemetry()`, the factory uses `EVDB_DEFAULT_SPANS`:

| Span | Default |
|------|---------|
| `eventualize.stream.get` | on |
| `eventualize.stream.store` | on |
| `eventualize.stream.goToOffset` | on |
| `eventualize.stream.clone` | on |
| `eventualize.stream.append` | off (one span per event) |
| `eventualize.adapter.store` | off |
| `eventualize.adapter.query.stream` | off |

Rules:

- A key is a span name, a group (`"eventualize.stream.*"`, `"eventualize.adapter.*"`),
  or `"*"` for all spans. Keys are typed, so a misspelled name is a compile error.
- Spans that no key matches keep their default.
- When several keys match a span, the most specific wins: span name, then group,
  then `"*"`. For example, `{ "*": false, "eventualize.stream.store": true }`
  produces only the store span.
- The policy also covers the adapter spans. Core passes it to the storage
  adapter in the OpenTelemetry context, so you do not configure the adapter.
  An adapter that you call directly, outside a stream, uses the defaults.
- The policy does not change trace propagation: events and outbox messages
  still store the `traceparent` of the active span.

The types and the defaults are exported from `@eventualize/core/otel`:

```typescript
import { EVDB_DEFAULT_SPANS, type EvDbTelemetryOptions } from "@eventualize/core/otel";
```

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

A tested helper that does this for pg-boss and Kafka consumers of the outbox is in
[Outbox delivery → Tracing in the consumer](outbox.md#tracing-in-the-consumer-span-links).

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
