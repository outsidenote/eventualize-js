# OpenTelemetry Integration — Product Requirements Document

**Status:** Draft v3 (Self-Instrumented)
**Version:** 3.0
**Date:** 2026-05-19
**Author:** bnaya@liquidity.com

---

## Executive Summary

Make eventualize-js a first-class OpenTelemetry (OTEL) native library that **self-instruments** internally—users configure OTEL once at process startup and library spans appear automatically, with no API changes to the library's public surface.

**Key Principles:**
1. **Self-instrumenting library** — Internal `trace.getTracer("@eventualize/...")` calls; no user wiring required.
2. **Zero API surface change** — `EvDbStreamFactory` and adapters keep their existing constructors. No `instrumentation` parameter anywhere.
3. **OTEL standards everywhere** — Use `Span`, `Tracer`, `Attributes`, `propagation.inject/extract` directly.
4. **Built-in no-op** — When no OTEL provider is registered, `trace.getTracer()` returns OTEL's built-in no-op. No custom no-op class needed.
5. **TypeScript-native scope** — `using` keyword + error detection via `Symbol.dispose`.

---

## Problem Statement

### Current State
- eventualize-js has no distributed tracing support
- Users must manually instrument event sourcing operations with verbose try/finally blocks
- Trace context is lost when events pass through message queues (pgBoss, Kafka)
- Adapter operations (database reads/writes) are invisible to observability systems

### Impact
- Latency issues are hard to diagnose
- Message queue failures cannot be traced back to originating streams
- Multi-service architectures have broken trace chains across event boundaries

---

## Goals & Success Criteria

### Primary Goals

1. **Auto-Instrumentation** — All major eventualize-js operations create spans automatically when OTEL SDK is configured.
2. **Zero User API Changes** — No new constructor parameters, no `instrumentation` config field anywhere.
3. **Trace Propagation** — `traceparent` field on `EvDbMessage` populated automatically.
4. **Per-Package Tracers** — Each adapter gets its own tracer for granular filtering.
5. **Standards Compliance** — W3C Trace Context via OTEL's standard `propagation` API.
6. **Auto Lifecycle** — Internal `withSpan` helper handles try/finally + status + recordException + end.

### Success Criteria

- [ ] User configures OTEL SDK once at app startup → spans appear automatically
- [ ] No `instrumentation` parameter exists on `EvDbStreamFactory` config
- [ ] No `instrumentation` parameter exists on any storage adapter constructor
- [ ] `EVDB_TRACER_NAMES` constant lists all library tracer names
- [ ] `eventualizeInstrumentation()` helper returns `{ tracerNames, resourceAttributes }`
- [ ] `withSpan()` and `startScopedSpan()` exported for optional user use
- [ ] StreamFactory.getAsync() creates `eventualize.stream.get` span under `@eventualize/core` tracer
- [ ] EvDbStream.appendEvent() creates `eventualize.stream.append` span and populates traceparent on messages
- [ ] Each adapter creates `eventualize.adapter.store` / `.query` spans under its own tracer
- [ ] `startScopedSpan` ends span on disposal; error state is caller's responsibility
- [ ] All existing tests pass without modification
- [ ] Build and lint counts unchanged from baseline

---

## API Design (Reference)

For full details, see [`OTEL_API_DESIGN.md`](./OTEL_API_DESIGN.md).

### Public API Surface

```typescript
// @eventualize/core/otel

// Info constant
export const EVDB_TRACER_NAMES: {
  CORE: "@eventualize/core",
  ADAPTER_RELATIONAL: "@eventualize/relational-adapter",
  ADAPTER_DYNAMODB: "@eventualize/dynamodb-adapter",
  ADAPTER_MYSQL: "@eventualize/mysql-adapter",
  ADAPTER_POSTGRES: "@eventualize/postgres-adapter",
};

// Setup helper (info only)
export function eventualizeInstrumentation(): {
  tracerNames: string[];
  resourceAttributes: Record<string, string>;
};

// Optional utilities for user code
export function withSpan<T>(
  tracer: Tracer,
  spanName: string,
  fn: (span: Span) => T | Promise<T>,
  attributes?: Attributes,
): Promise<T>;

export function startScopedSpan(
  tracer: Tracer,
  spanName: string,
  attributes?: Attributes,
): IDisposableSpan;

export interface IDisposableSpan {
  readonly span: Span;
  [Symbol.dispose](): void;
}

// Tracer accessor
export function getCoreTracer(): Tracer;
```

### Usage Examples

```typescript
// === APP STARTUP (one time) ===
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { eventualizeInstrumentation } from "@eventualize/core/otel";

const sdk = new NodeSDK({
  serviceName: "my-app",
  resource: new Resource({
    "service.name": "my-app",
    ...eventualizeInstrumentation().resourceAttributes,
  }),
  traceExporter: new OTLPTraceExporter({ url: "http://otel:4318/v1/traces" }),
});
sdk.start();

// === LIBRARY USAGE (zero changes from pre-OTEL code) ===
const factory = new EvDbStreamFactory({
  eventTypes: [...],
  viewNames: [...],
});

const stream = await factory.getAsync("user-123", "UserStream");
await stream.appendEventUserRegistered({ email: "user@example.com" });
// Spans automatically created and exported.

// === OPTIONAL: Add custom spans under Eventualize tracer ===
import { withSpan, getCoreTracer } from "@eventualize/core/otel";

await withSpan(getCoreTracer(), "my.custom.work", async (span) => {
  span.setAttribute("custom.key", "value");
  return await doWork();
});
```

---

## Requirements

### Functional Requirements

#### FR1: Self-Instrumenting Library

- **Requirement:** Library code internally calls `trace.getTracer("@eventualize/...")` for each package; no user-facing instrumentation class.
- **Why:** Idiomatic OTEL JS; matches how `pg`, `@aws-sdk`, etc. instrument themselves.
- **Scope:**
  - `packages/core/src/otel/tracers.ts` exports `getCoreTracer()` and adapter tracer factories
  - Each adapter package internally uses its own tracer
  - No tracer instance is stored on factory/stream/adapter instances
- **Acceptance Criteria:**
  - `tracers.ts` exists with `EVDB_TRACER_NAMES` constant
  - Each factory/stream/adapter method calls `getXxxTracer()` to get its tracer
  - No `instrumentation` parameter anywhere in public constructors or configs

#### FR2: EvDbMessage Trace Context Storage

- **Requirement:** Add optional `traceparent` and `tracestate` fields to `EvDbMessage`
- **Why:** Preserve trace context when messages flow through queues
- **Scope:**
  - Fields are nullable (backwards compatible)
  - Populated automatically by library when message is created within an active span
  - Use `propagation.inject(context.active(), carrier)` to extract W3C format
- **Acceptance Criteria:**
  - `EvDbMessage.create()` accepts optional traceparent/tracestate parameters
  - `EvDbMessage.createFromMetadata()` accepts optional traceparent/tracestate parameters
  - Library code passes traceparent when creating messages within span context

#### FR3: StreamFactory Auto-Instrumentation

- **Requirement:** `EvDbStreamFactory` operations wrapped with `withSpan()` internally
- **Why:** Make stream factory operations visible in traces
- **Scope:**
  - No new configuration parameter required
  - `getAsync()` creates span `eventualize.stream.get` under `@eventualize/core` tracer
  - Attributes: `eventualize.stream.id`, `eventualize.stream.type`
- **Acceptance Criteria:**
  - Factory works without any user configuration changes
  - Spans appear in trace when OTEL SDK is configured
  - No new public API surface area

#### FR4: EvDbStream Auto-Instrumentation + Traceparent Capture

- **Requirement:** `EvDbStream` operations wrapped; messages populated with traceparent
- **Why:** End-to-end tracing from stream operation to message processing
- **Scope:**
  - `appendEvent*` methods wrapped with `withSpan("eventualize.stream.append", ...)`
  - When creating messages, call `propagation.inject(context.active(), carrier)` to capture traceparent
  - Pass traceparent to `EvDbMessage.create/createFromMetadata`
- **Acceptance Criteria:**
  - Messages have `traceparent` populated when in active span
  - `traceparent` is W3C compliant (validated by OTEL's propagation API)
  - `traceparent` is undefined when no span is active

#### FR5: Storage Adapter Auto-Instrumentation (All 4)

- **Requirement:** Each adapter wraps operations with `withSpan` using its own tracer
- **Why:** Granular visibility per storage backend
- **Scope:**
  - Each adapter has its own `tracers.ts` with `getXxxAdapterTracer()`
  - Wrap `storeAsync`, query methods, snapshot methods
  - Span names: `eventualize.adapter.store`, `eventualize.adapter.query.stream`, `eventualize.adapter.query.snapshot`
  - Attributes: `eventualize.adapter.kind`, `eventualize.message.count`, etc.
- **Acceptance Criteria:**
  - All 4 adapters (Relational, DynamoDB, MySQL, Postgres) instrument operations
  - No new constructor parameters
  - Existing tests pass without modification

#### FR6: Optional Setup Helper

- **Requirement:** Provide `eventualizeInstrumentation()` returning metadata
- **Why:** Help users configure SDK with proper resource attributes / tracer names
- **Scope:**
  - Returns `{ tracerNames: string[], resourceAttributes: Record<string, string> }`
  - No samplers, no processors—just info
- **Acceptance Criteria:**
  - Function exported from `@eventualize/core/otel`
  - `tracerNames` lists all 5 library tracers
  - `resourceAttributes` includes SDK version and language

#### FR7: Optional User Utilities

- **Requirement:** Export `withSpan` and `startScopedSpan` for user code
- **Why:** Users can extend instrumentation under Eventualize tracers
- **Scope:**
  - `withSpan(tracer, name, fn, attrs)` — callback with auto-lifecycle
  - `startScopedSpan(tracer, name, attrs)` — TS `using`, KISS: calls `span.end()` on disposal, no error state management
  - Both exported from `@eventualize/core/otel`
- **Acceptance Criteria:**
  - User can call `withSpan(getCoreTracer(), "x", fn)` from their code
  - `startScopedSpan` ends the span when the `using` scope exits; error handling is the caller's responsibility
  - Users who need automatic error detection use `withSpan` instead

#### FR8: Message Queue Integration Guide

- **Requirement:** Document W3C propagation through queues using standard OTEL APIs
- **Why:** End-to-end tracing across service boundaries
- **Scope:**
  - pgBoss: `propagation.inject` example
  - Kafka producer: `propagation.inject` into headers
  - Kafka consumer: `propagation.extract` + `context.with()` to parent
  - Kafka consumer link variant: use extracted context as `links` in `startSpan`
- **Acceptance Criteria:**
  - Guide uses only OTEL standard APIs (no custom helpers)
  - Examples are syntactically correct TypeScript
  - Both "parent context" and "linked span" patterns documented

### Non-Functional Requirements

#### NFR1: Zero User API Changes
- All changes to library are internal
- Existing user code works unchanged after upgrading

#### NFR2: Zero Overhead When OTEL Not Configured
- `trace.getTracer()` returns no-op when no provider registered
- No custom no-op layers; rely entirely on OTEL's built-in

#### NFR3: Standards Compliance
- Use `@opentelemetry/api` types directly (no custom interfaces)
- Use `propagation.inject/extract` for W3C context
- Never parse traceparent strings manually

#### NFR4: Type Safety
- Full TypeScript support, no `any` in public API
- TS 5.2+ `using` keyword (compiled down to try/finally for ES2020 target)

#### NFR5: ESLint & Quality
- All new code passes ESLint
- Comments only where non-obvious
- Build/lint counts unchanged from baseline

---

## Design Decisions

### D1: Library Self-Instruments (Don't Pass Instrumentation Around)

**Decision:** Each module/adapter calls `trace.getTracer()` internally; no user-facing instrumentation object.

**Rationale:**
- OTEL JS auto-discovers tracers (unlike .NET, no `AddSource` needed)
- Matches how `pg`, `@aws-sdk`, `mongoose` instrument themselves
- Zero changes to user API surface
- More granular: each adapter gets its own tracer for filtering

**Alternative Considered:** Pass `EvDbInstrumentation` through factory config.

**Why Not:** Forces every user to know about and create an instrumentation object even when they're not using OTEL.

---

### D2: Per-Package Tracers (Not One Mega-Tracer)

**Decision:** `@eventualize/core`, `@eventualize/relational-adapter`, etc., each have their own tracer.

**Rationale:**
- Granular sampling and filtering
- Easy to identify which library produced a span
- Standard OTEL pattern (e.g., `@opentelemetry/instrumentation-pg`, `@opentelemetry/instrumentation-mongodb`)

---

### D3: Setup Helper Returns Info Only

**Decision:** `eventualizeInstrumentation()` returns `{ tracerNames, resourceAttributes }`. No samplers, no SDK extensions.

**Rationale:**
- User picked option 1 (just expose info)
- Doesn't lock users into a specific sampling strategy
- Easy to extend later if needed
- Composes with any SDK configuration

---

### D4: `startScopedSpan` Is KISS — No Error State Management

**Decision:** `startScopedSpan` only ends the span on `[Symbol.dispose]()`. No `end()` method, no completion flag, no automatic ERROR status.

**Rationale:**
- KISS principle: `startScopedSpan` is the manual-control API — give the user the span, end it when done
- Error handling (setting span status, recording exceptions) is the caller's explicit responsibility
- Users who want automatic error detection and OK/ERROR lifecycle should use `withSpan` instead
- Removes complexity: no completion flag, no double-end guard, no SpanStatusCode import

---

### D5: OTEL Standards Everywhere

**Decision:** No custom interfaces (`IOTelInstrumentation`, `IOTelContext`, `getCurrentSpan()`, etc.).

**Rationale:**
- OTEL types ARE the abstraction
- Less code to maintain
- Less docs to read for users already familiar with OTEL

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│              Application Code                                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ (1) Setup OTEL SDK once at startup                       │  │
│  │ (2) Use eventualize-js normally — no API changes         │  │
│  └─────────────────────────────────────────────────────────┘  │
└────┬──────────────────────────────────────────────────────────┘
     │ (just uses library)
     │
┌────▼──────────────────────────────────────────────────────────┐
│       eventualize-js (self-instrumented)                       │
│                                                                 │
│   packages/core/src/otel/tracers.ts                            │
│     - EVDB_TRACER_NAMES constants                              │
│     - getCoreTracer() = trace.getTracer("@eventualize/core")  │
│     - eventualizeInstrumentation() info helper                 │
│                                                                 │
│   packages/core/src/otel/withSpan.ts                           │
│     - Internal helper used by all library code                 │
│     - Auto-lifecycle: status, exception, end                   │
│                                                                 │
│   packages/core/src/factories/EvDbStreamFactory.ts             │
│     ├── getAsync() → withSpan(getCoreTracer(), ...)            │
│                                                                 │
│   packages/core/src/store/EvDbStream.ts                        │
│     ├── appendEvent() → withSpan(getCoreTracer(), ...)         │
│     └── captures traceparent via propagation.inject()          │
│                                                                 │
│   packages/adapters/*/src/otel/tracers.ts                      │
│     - getXxxAdapterTracer() per adapter                        │
│                                                                 │
│   packages/adapters/*/src/EvDbXxxStorageAdapter.ts             │
│     ├── storeAsync() → withSpan(getXxxAdapterTracer(), ...)   │
│     └── queryAsync() → withSpan(getXxxAdapterTracer(), ...)   │
└────────────────────────────────────────────────────────────────┘
     │
     │ tracers are auto-discovered by OTEL SDK
     │
┌────▼──────────────────────────────────────────────────────────┐
│       OTEL SDK (configured by user)                            │
│       Exports spans to Jaeger/Datadog/OTLP/etc.                │
└────────────────────────────────────────────────────────────────┘
```

---

## Integration Points

### 1. App Startup (Single Required Step)
```typescript
const sdk = new NodeSDK({
  serviceName: "my-app",
  traceExporter: new OTLPTraceExporter({ url: "..." }),
});
sdk.start();
```

### 2. pgBoss Producer (User Code)
```typescript
import { propagation, context } from "@opentelemetry/api";

const carrier: Record<string, string> = {};
propagation.inject(context.active(), carrier);

await queue.send("topic", payload, {
  headers: { traceparent: carrier.traceparent },
});
```

### 3. Kafka Consumer (User Code)
```typescript
import { propagation, context } from "@opentelemetry/api";

const carrier = { traceparent: msg.headers.traceparent.toString() };
const parentContext = propagation.extract(context.active(), carrier);

await context.with(parentContext, async () => {
  await processMessage(msg);
});
```

---

## Migration & Adoption

### Phase 1: Foundation (No User Impact)
- Add `@opentelemetry/api` as optional peer dependency
- Add `packages/core/src/otel/` with tracers, withSpan, startScopedSpan
- Add optional `traceparent`/`tracestate` to `EvDbMessage`

### Phase 2: Instrument Library (Still No User Impact)
- Wrap factory, stream, all 4 adapters with `withSpan`
- Capture traceparent in messages

### Phase 3: Documentation & Examples
- Setup guide with OTLP and Jaeger
- Queue propagation examples (pgBoss, Kafka)

**No breaking changes. No new user APIs are required (only optional ones).**

---

## Testing Strategy

### Unit Tests
- `withSpan` sets OK on success, ERROR on throw, always calls end()
- `startScopedSpan[Symbol.dispose]()` calls span.end()
- `eventualizeInstrumentation()` returns correct tracer names and resource attributes

### Integration Tests (with in-memory exporter)
- Factory creates `eventualize.stream.get` span
- Stream creates `eventualize.stream.append` span and adds traceparent to messages
- Each adapter creates correctly-named spans under its own tracer
- Traceparent in messages matches W3C format

### Manual Tests
- End-to-end Jaeger/OTLP trace shows full span hierarchy
- Messages in queues carry traceparent headers
- Consumer spans link to upstream traces

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| TS 5.2+ `using` not in user's project | Medium | Low | `using` is optional; `withSpan` is primary |
| OTEL API breaking changes | Low | Medium | Pin to `@opentelemetry/api ^1.7.0` |
| Database schema incompatibility | Low | High | traceparent column is nullable |
| User omits span status on `startScopedSpan` | Medium | Low | Spans end without explicit status; users who need auto-lifecycle use `withSpan` |

---

## Success Metrics

### Quality
- Zero TypeScript errors after integration (vs baseline)
- ESLint passes (vs baseline)
- All existing tests pass without modification

### Adoption
- 5-minute time-to-first-trace following the setup guide
- Sample app demonstrates full OTEL integration

### Performance
- No measurable overhead when OTEL not configured
- Acceptable overhead when configured (<5%)

---

## Open Questions

1. **Schema migration:** Provide migration script for traceparent columns?
   - *Decision:* Nullable columns; no migration needed.

2. **Trace context: parent vs link in consumers?**
   - *Decision:* User chooses. Document both patterns.

3. **Snapshot operations: dedicated spans?**
   - *Decision:* Yes, named `eventualize.adapter.snapshot.{read|write}`.

4. **Tracer version: where does it come from?**
   - *Decision:* Read from package.json at build time, or use a hardcoded constant updated by release tooling.

---

## Appendix: Comparison to .NET Idioms

| .NET | OTEL JS | Notes |
|------|---------|-------|
| `ActivitySource("name")` | `trace.getTracer("name")` | Both create named tracers |
| `.AddSource("name")` required | **Auto-discovered** | OTEL JS auto-picks-up all `getTracer` calls |
| `Activity.Current` | `trace.getActiveSpan()` | Same concept |
| `AddOpenTelemetry().AddEventualize()` | `eventualizeInstrumentation()` info helper | Lighter pattern; just metadata |
| `using var activity = ...` | `using span = startScopedSpan(...)` | TS 5.2+ matches the .NET pattern |

---

**Document Control**
- Next Review: 2026-06-19
- Owner: bnaya@liquidity.com
