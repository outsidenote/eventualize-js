# OpenTelemetry Native Integration Plan (v3 — Self-Instrumented)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make eventualize-js a self-instrumenting OTEL-native library. Library internally calls `trace.getTracer()` per package; users configure OTEL SDK once at app startup and spans appear automatically with no changes to library API surface.

**Architecture:**
1. Each package creates its own internal tracer via `trace.getTracer("@eventualize/<package>")`
2. Internal `withSpan(tracer, name, fn, attrs)` helper handles try/finally + status + recordException + end
3. `startScopedSpan` provides TS `using` support — KISS, ends span on disposal; error handling is caller's responsibility
4. `EvDbMessage` gets optional `traceparent`/`tracestate` fields populated automatically via `propagation.inject`
5. Factory, stream, and all 4 adapters wrap operations with `withSpan`
6. `eventualizeInstrumentation()` info helper exposes tracer names and resource attributes
7. **No `instrumentation` parameter anywhere in public API**

**Tech Stack:**
- `@opentelemetry/api` ^1.7.0 (optional peer dependency)
- TypeScript 6+ (`using` keyword, compiled down for ES2020 target)
- W3C Trace Context via OTEL's `propagation` API

**Reference Documents:**
- PRD: `docs/OTEL_PRD.md`
- API Design: `docs/OTEL_API_DESIGN.md`

---

## Pre-Flight Checks

- [ ] **Record baseline counts**

```bash
cd /Users/bnaya/Documents/Code/Open\ Sources/EvDb\ Family/eventualize-js
pnpm build 2>&1 | grep "error TS" | wc -l    # Record this number
pnpm exec eslint . 2>&1 | grep -c " error "  # Record this number
```

All subsequent steps must not exceed these baselines.

---

## Phase 1: Foundation — Dependency & Message Field

### Task 1: Add @opentelemetry/api Peer Dependency

**Files:**
- Modify: `packages/core/package.json`

- [ ] **Step 1: Inspect current package.json**

```bash
cat /Users/bnaya/Documents/Code/Open\ Sources/EvDb\ Family/eventualize-js/packages/core/package.json
```

- [ ] **Step 2: Add OTEL API as optional peer dependency**

Edit `packages/core/package.json` and add (merge with existing):

```json
"peerDependencies": {
  "@opentelemetry/api": "^1.7.0"
},
"peerDependenciesMeta": {
  "@opentelemetry/api": {
    "optional": true
  }
},
"devDependencies": {
  "@opentelemetry/api": "^1.7.0",
  "@opentelemetry/sdk-trace-base": "^1.20.0",
  "@opentelemetry/sdk-trace-node": "^1.20.0"
}
```

- [ ] **Step 3: Install**

```bash
cd /Users/bnaya/Documents/Code/Open\ Sources/EvDb\ Family/eventualize-js
pnpm install
```

- [ ] **Step 4: Restore symlinks (per CLAUDE.md)**

```bash
BASE=$(pwd)
ln -sfn "$BASE/packages/types" "$BASE/packages/core/node_modules/@eventualize/types"
ln -sfn "$BASE/packages/types" "$BASE/packages/adapters/relational-storage-adapter/node_modules/@eventualize/types"
ln -sfn "$BASE/packages/types" "$BASE/packages/adapters/dynamodb-storage-adapter/node_modules/@eventualize/types"
```

- [ ] **Step 5: Verify build is clean**

```bash
pnpm build 2>&1 | grep "error TS" | wc -l
```

Expected: Same as baseline

- [ ] **Step 6: Commit**

```bash
git add packages/core/package.json pnpm-lock.yaml
git commit -m "chore(core): add @opentelemetry/api as optional peer dependency"
```

---

### Task 2: Extend EvDbMessage with traceparent / tracestate

**Files:**
- Modify: `packages/types/src/messages/EvDbMessage.ts`

- [ ] **Step 1: Replace EvDbMessage with updated version**

Open `packages/types/src/messages/EvDbMessage.ts` and replace with:

```typescript
import type IEvDbEventMetadata from "../events/IEvDbEventMetadata.js";
import type EvDbStreamCursor from "../stream/EvDbStreamCursor.js";
import type { IEvDbPayloadData } from "../events/IEvDbPayloadData.js";

export default class EvDbMessage {
  public static readonly Empty: EvDbMessage = EvDbMessage.create(
    {} as EvDbStreamCursor,
    "",
    "",
    undefined,
  );

  private constructor(
    public readonly id: string,
    public readonly eventType: string,
    public readonly channel: string,
    public readonly shardName: string,
    public readonly messageType: string,
    public readonly serializeType: string,
    public readonly capturedAt: Date,
    public readonly capturedBy: string,
    public readonly streamCursor: EvDbStreamCursor,
    public readonly payload: IEvDbPayloadData | undefined,
    public readonly storedAt?: Date,
    public readonly traceparent?: string,
    public readonly tracestate?: string,
  ) { }

  public static create(
    streamCursor: EvDbStreamCursor,
    eventType: string,
    messageType: string,
    payload: IEvDbPayloadData | undefined,
    channel: string = "default",
    shardName: string = "default",
    messageId: string = crypto.randomUUID(),
    serializeType: string = "json",
    capturedAt: Date = new Date(),
    capturedBy: string = "",
    traceparent?: string,
    tracestate?: string,
  ): EvDbMessage {
    return new EvDbMessage(
      messageId,
      eventType,
      channel,
      shardName,
      messageType,
      serializeType,
      capturedAt,
      capturedBy,
      streamCursor,
      payload,
      undefined,
      traceparent,
      tracestate,
    );
  }

  public static createFromMetadata(
    metadata: IEvDbEventMetadata,
    messageType: string,
    payload: IEvDbPayloadData,
    channel: string = "default",
    shardName: string = "default",
    messageId: string = crypto.randomUUID(),
    serializeType: string = "json",
    traceparent?: string,
    tracestate?: string,
  ): EvDbMessage {
    return new EvDbMessage(
      messageId,
      metadata.eventType,
      channel,
      shardName,
      messageType,
      serializeType,
      metadata.capturedAt,
      metadata.capturedBy,
      metadata.streamCursor,
      payload,
      undefined,
      traceparent,
      tracestate,
    );
  }
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm build 2>&1 | grep "error TS" | wc -l
```

Expected: Same as baseline

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/messages/EvDbMessage.ts
git commit -m "feat(types): add optional traceparent and tracestate to EvDbMessage"
```

---

## Phase 2: Core OTEL Module

### Task 3: Create `tracers.ts` Module

**Files:**
- Create: `packages/core/src/otel/tracers.ts`

- [ ] **Step 1: Get current version from package.json**

```bash
grep '"version"' /Users/bnaya/Documents/Code/Open\ Sources/EvDb\ Family/eventualize-js/packages/core/package.json | head -1
```

Note: We'll hardcode for now; release tooling can update if needed.

- [ ] **Step 2: Create tracers.ts**

Create `packages/core/src/otel/tracers.ts`:

```typescript
import { trace } from "@opentelemetry/api";
import type { Tracer } from "@opentelemetry/api";

const EVDB_VERSION = "4.0.0"; // Update via release tooling

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
 * Use when configuring your OTEL SDK to apply resource attributes
 * or to filter spans by tracer name.
 *
 * @example
 * const evdb = eventualizeInstrumentation();
 * const sdk = new NodeSDK({
 *   resource: new Resource({ ...evdb.resourceAttributes }),
 * });
 */
export function eventualizeInstrumentation(): {
  tracerNames: string[];
  resourceAttributes: Record<string, string>;
} {
  return {
    tracerNames: Object.values(EVDB_TRACER_NAMES),
    resourceAttributes: {
      "eventualize.sdk.version": EVDB_VERSION,
      "eventualize.sdk.language": "typescript",
    },
  };
}

/**
 * Get the tracer used by `@eventualize/core`.
 * Returns OTEL's no-op tracer when no provider is registered.
 */
export function getCoreTracer(): Tracer {
  return trace.getTracer(EVDB_TRACER_NAMES.CORE, EVDB_VERSION);
}
```

- [ ] **Step 3: Build and verify**

```bash
pnpm build 2>&1 | grep "error TS" | wc -l
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/otel/tracers.ts
git commit -m "feat(core): add OTEL tracer factory and instrumentation info helper"
```

---

### Task 4: Create `withSpan` Helper

**Files:**
- Create: `packages/core/src/otel/withSpan.ts`

- [ ] **Step 1: Create withSpan.ts**

```typescript
import { SpanStatusCode } from "@opentelemetry/api";
import type { Span, Tracer, Attributes } from "@opentelemetry/api";

/**
 * Execute a function within an OTEL span with automatic lifecycle.
 *
 * Automatically:
 *   - Sets status OK on success
 *   - Sets status ERROR and records the exception on throw
 *   - Calls span.end() in all cases
 *
 * @example
 * await withSpan(tracer, "user.create", async (span) => {
 *   span.setAttribute("dataSize", data.length);
 *   return await createUser(data);
 * }, { userId });
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
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err?.message,
      });
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

- [ ] **Step 2: Build and verify**

```bash
pnpm build 2>&1 | grep "error TS" | wc -l
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/otel/withSpan.ts
git commit -m "feat(core): add withSpan helper with automatic lifecycle management"
```

---

### Task 5: Create `startScopedSpan` Helper

**Files:**
- Create: `packages/core/src/otel/startScopedSpan.ts`

- [ ] **Step 1: Create startScopedSpan.ts**

```typescript
import type { Span, Tracer, Attributes } from "@opentelemetry/api";

/**
 * A disposable span for use with TypeScript's `using` keyword.
 *
 * Ends the span when the scope exits. Error state management is the
 * caller's responsibility — use withSpan() for automatic OK/ERROR handling.
 */
export interface IDisposableSpan {
  readonly span: Span;
  /** Auto-called by TS `using`. Ends the span. */
  [Symbol.dispose](): void;
}

/**
 * Start a scoped span for use with TypeScript's `using` declaration.
 *
 * @example
 * async function processOrder(orderId: string) {
 *   using scope = startScopedSpan(tracer, "order.process", { orderId });
 *   const order = await fetchOrder(orderId);
 *   scope.span.setAttribute("total", order.total);
 *   return await processPayment(order);
 *   // span.end() called automatically when scope exits
 * }
 */
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

- [ ] **Step 2: Build and verify**

```bash
pnpm build 2>&1 | grep "error TS" | wc -l
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/otel/startScopedSpan.ts
git commit -m "feat(core): add startScopedSpan helper for TS using keyword"
```

---

### Task 6: Create OTEL Barrel Export

**Files:**
- Create: `packages/core/src/otel/index.ts`

- [ ] **Step 1: Create index.ts**

```typescript
// Public API (constants + info helper)
export {
  EVDB_TRACER_NAMES,
  eventualizeInstrumentation,
  getCoreTracer,
} from "./tracers.js";

// Optional utilities for user code
export { withSpan } from "./withSpan.js";
export { startScopedSpan, type IDisposableSpan } from "./startScopedSpan.js";

// Re-export common OTEL types for convenience
export {
  trace,
  context,
  propagation,
  SpanStatusCode,
  SpanKind,
} from "@opentelemetry/api";

export type {
  Span,
  Tracer,
  Attributes,
  SpanContext,
  Context,
} from "@opentelemetry/api";
```

- [ ] **Step 2: Verify exports are reachable from package consumers**

Open `packages/core/package.json` and add to `exports`:

```json
"./otel": {
  "types": "./dist/otel/index.d.ts",
  "import": "./dist/otel/index.js"
}
```

(Adjust to match the package's existing `exports` style.)

- [ ] **Step 3: Build and verify**

```bash
pnpm build 2>&1 | grep "error TS" | wc -l
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/otel/index.ts packages/core/package.json
git commit -m "feat(core): expose OTEL module via @eventualize/core/otel"
```

---

### Task 7: Unit Tests for OTEL Helpers

**Files:**
- Create: `packages/core/src/otel/otel.test.ts`

- [ ] **Step 1: Create test file**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { SpanStatusCode } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
  EVDB_TRACER_NAMES,
  eventualizeInstrumentation,
  getCoreTracer,
} from "./tracers.js";
import { withSpan } from "./withSpan.js";
import { startScopedSpan } from "./startScopedSpan.js";

describe("OTEL helpers", () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeAll(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    provider.register();
  });

  afterAll(async () => {
    await provider.shutdown();
  });

  beforeEach(() => {
    exporter.reset();
  });

  describe("eventualizeInstrumentation", () => {
    it("returns all tracer names", () => {
      const evdb = eventualizeInstrumentation();
      expect(evdb.tracerNames).toContain(EVDB_TRACER_NAMES.CORE);
      expect(evdb.tracerNames).toContain(EVDB_TRACER_NAMES.ADAPTER_RELATIONAL);
      expect(evdb.tracerNames.length).toBe(5);
    });

    it("returns resource attributes", () => {
      const evdb = eventualizeInstrumentation();
      expect(evdb.resourceAttributes["eventualize.sdk.version"]).toBeTruthy();
      expect(evdb.resourceAttributes["eventualize.sdk.language"]).toBe(
        "typescript",
      );
    });
  });

  describe("withSpan", () => {
    it("creates span, sets OK status, ends span on success", async () => {
      const result = await withSpan(
        getCoreTracer(),
        "test.success",
        async () => "ok",
        { attr1: "value1" },
      );

      expect(result).toBe("ok");
      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe("test.success");
      expect(spans[0].status.code).toBe(SpanStatusCode.OK);
      expect(spans[0].attributes.attr1).toBe("value1");
    });

    it("sets ERROR status and records exception on throw", async () => {
      await expect(
        withSpan(getCoreTracer(), "test.error", async () => {
          throw new Error("test failure");
        }),
      ).rejects.toThrow("test failure");

      const spans = exporter.getFinishedSpans();
      expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
      expect(spans[0].status.message).toBe("test failure");
      expect(spans[0].events.length).toBeGreaterThan(0);
    });

    it("provides span to callback for dynamic attributes", async () => {
      await withSpan(getCoreTracer(), "test.dynamic", async (span) => {
        span.setAttribute("dynamic.key", "dynamic.value");
      });

      const spans = exporter.getFinishedSpans();
      expect(spans[0].attributes["dynamic.key"]).toBe("dynamic.value");
    });
  });

  describe("startScopedSpan", () => {
    it("marks OK when end() is called before dispose", () => {
      {
        using scope = startScopedSpan(getCoreTracer(), "test.scoped.ok", {
          x: 1,
        });
        scope.span.setAttribute("y", 2);
        scope.end();
      }

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe("test.scoped.ok");
      expect(spans[0].status.code).toBe(SpanStatusCode.OK);
      expect(spans[0].attributes.x).toBe(1);
      expect(spans[0].attributes.y).toBe(2);
    });

    it("marks ERROR when disposed without end()", () => {
      {
        using scope = startScopedSpan(getCoreTracer(), "test.scoped.error");
        scope.span.setAttribute("a", 1);
        // No scope.end() — simulates exception path
      }

      const spans = exporter.getFinishedSpans();
      expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
      expect(spans[0].status.message).toContain("without successful completion");
    });

    it("marks ERROR if exception thrown before end()", () => {
      expect(() => {
        using scope = startScopedSpan(getCoreTracer(), "test.scoped.throw");
        scope.span.setAttribute("attempted", true);
        throw new Error("simulated failure");
      }).toThrow("simulated failure");

      const spans = exporter.getFinishedSpans();
      expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
      expect(spans[0].attributes.attempted).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/bnaya/Documents/Code/Open\ Sources/EvDb\ Family/eventualize-js/packages/core
pnpm test src/otel/otel.test.ts
```

Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/otel/otel.test.ts
git commit -m "test(core): add unit tests for OTEL helpers"
```

---

## Phase 3: Library Self-Instrumentation

### Task 8: Instrument EvDbStreamFactory

**Files:**
- Modify: `packages/core/src/factories/EvDbStreamFactory.ts`

- [ ] **Step 1: Inspect current factory**

```bash
head -120 /Users/bnaya/Documents/Code/Open\ Sources/EvDb\ Family/eventualize-js/packages/core/src/factories/EvDbStreamFactory.ts
```

- [ ] **Step 2: Identify the main public methods to wrap**

Find the methods that:
- Create / load streams (e.g., `getAsync`, `createAsync`)
- These are the user-facing operations

Search:

```bash
grep -n "public\|async \|export" /Users/bnaya/Documents/Code/Open\ Sources/EvDb\ Family/eventualize-js/packages/core/src/factories/EvDbStreamFactory.ts | head -20
```

- [ ] **Step 3: Add imports and wrap main method**

Add to imports at the top:

```typescript
import { getCoreTracer } from "../otel/tracers.js";
import { withSpan } from "../otel/withSpan.js";
```

For each public async method, wrap the body. Example for `getAsync`:

```typescript
async getAsync(
  streamId: string,
  streamType: TStreamType,
): Promise<StreamWithEventMethods<TEventMap, TViews>> {
  return withSpan(
    getCoreTracer(),
    "eventualize.stream.get",
    async (span) => {
      span.setAttribute("eventualize.stream.id", streamId);
      span.setAttribute("eventualize.stream.type", streamType);

      // ... existing getAsync body ...
    },
  );
}
```

(Preserve all existing logic; only wrap the body.)

- [ ] **Step 4: Build and verify**

```bash
pnpm build 2>&1 | grep "error TS" | wc -l
pnpm exec eslint packages/core/src/factories/ 2>&1 | grep -c " error "
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/factories/EvDbStreamFactory.ts
git commit -m "feat(core): instrument EvDbStreamFactory with OTEL spans"
```

---

### Task 9: Instrument EvDbStream & Capture Traceparent in Messages

**Files:**
- Modify: `packages/core/src/store/EvDbStream.ts`

- [ ] **Step 1: Inspect EvDbStream**

```bash
grep -n "appendEvent\|EvDbMessage.create\|public\|async " /Users/bnaya/Documents/Code/Open\ Sources/EvDb\ Family/eventualize-js/packages/core/src/store/EvDbStream.ts | head -30
```

- [ ] **Step 2: Add imports**

```typescript
import { propagation, context } from "@opentelemetry/api";
import { getCoreTracer } from "../otel/tracers.js";
import { withSpan } from "../otel/withSpan.js";
```

- [ ] **Step 3: Add a private helper to extract traceparent**

Add as a private method on the stream class:

```typescript
private getTraceContext(): { traceparent?: string; tracestate?: string } {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return {
    traceparent: carrier["traceparent"],
    tracestate: carrier["tracestate"],
  };
}
```

- [ ] **Step 4: Wrap main append/save method with withSpan**

Example for the main append method:

```typescript
async appendEvent(eventType: string, eventData: object): Promise<void> {
  return withSpan(
    getCoreTracer(),
    "eventualize.stream.append",
    async (span) => {
      span.setAttribute("eventualize.stream.id", this.streamId);
      span.setAttribute("eventualize.stream.type", this.streamType);
      span.setAttribute("eventualize.event.type", eventType);

      // ... existing appendEvent body ...
    },
  );
}
```

- [ ] **Step 5: Pass traceparent when creating messages**

Find all `EvDbMessage.create()` and `EvDbMessage.createFromMetadata()` calls in this file and add traceparent at the end:

```typescript
const { traceparent, tracestate } = this.getTraceContext();

const message = EvDbMessage.create(
  streamCursor,
  eventType,
  messageType,
  payload,
  channel,
  shardName,
  messageId,
  serializeType,
  capturedAt,
  capturedBy,
  traceparent,
  tracestate,
);
```

(And similarly for `createFromMetadata`.)

- [ ] **Step 6: Build and verify**

```bash
pnpm build 2>&1 | grep "error TS" | wc -l
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/store/EvDbStream.ts
git commit -m "feat(core): instrument EvDbStream and capture traceparent in messages"
```

---

## Phase 4: Adapter Self-Instrumentation

### Task 10: Create Adapter Tracer Helpers in Core

**Files:**
- Modify: `packages/core/src/otel/tracers.ts` (add adapter tracer factories)

Even though each adapter has its own package, we centralize the tracer factories in core so the adapters import them from `@eventualize/core/otel`.

- [ ] **Step 1: Add adapter tracer accessors to tracers.ts**

Append to `packages/core/src/otel/tracers.ts`:

```typescript
export function getRelationalAdapterTracer(): Tracer {
  return trace.getTracer(EVDB_TRACER_NAMES.ADAPTER_RELATIONAL, EVDB_VERSION);
}

export function getDynamoDbAdapterTracer(): Tracer {
  return trace.getTracer(EVDB_TRACER_NAMES.ADAPTER_DYNAMODB, EVDB_VERSION);
}

export function getMySqlAdapterTracer(): Tracer {
  return trace.getTracer(EVDB_TRACER_NAMES.ADAPTER_MYSQL, EVDB_VERSION);
}

export function getPostgresAdapterTracer(): Tracer {
  return trace.getTracer(EVDB_TRACER_NAMES.ADAPTER_POSTGRES, EVDB_VERSION);
}
```

- [ ] **Step 2: Update otel/index.ts to export the new accessors**

Add to `packages/core/src/otel/index.ts`:

```typescript
export {
  EVDB_TRACER_NAMES,
  eventualizeInstrumentation,
  getCoreTracer,
  getRelationalAdapterTracer,
  getDynamoDbAdapterTracer,
  getMySqlAdapterTracer,
  getPostgresAdapterTracer,
} from "./tracers.js";
```

- [ ] **Step 3: Build and verify**

```bash
pnpm build 2>&1 | grep "error TS" | wc -l
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/otel/
git commit -m "feat(core): add per-adapter tracer factories"
```

---

### Task 11: Instrument Relational Storage Adapter

**Files:**
- Modify: `packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts`

- [ ] **Step 1: Inspect adapter methods**

```bash
grep -n "public\|async \|export class" /Users/bnaya/Documents/Code/Open\ Sources/EvDb\ Family/eventualize-js/packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts | head -20
```

- [ ] **Step 2: Add imports**

```typescript
import { withSpan, getRelationalAdapterTracer } from "@eventualize/core/otel";
```

- [ ] **Step 3: Wrap each public async method with withSpan**

For `storeAsync` (or equivalent):

```typescript
async storeAsync(messages: EvDbMessage[]): Promise<void> {
  return withSpan(
    getRelationalAdapterTracer(),
    "eventualize.adapter.store",
    async (span) => {
      span.setAttribute("eventualize.adapter.kind", "relational");
      span.setAttribute("eventualize.message.count", messages.length);
      // ... existing body ...
    },
  );
}
```

For query methods:

```typescript
async getStreamMessages(streamId: string, ...): Promise<EvDbMessage[]> {
  return withSpan(
    getRelationalAdapterTracer(),
    "eventualize.adapter.query.stream",
    async (span) => {
      span.setAttribute("eventualize.adapter.kind", "relational");
      span.setAttribute("eventualize.stream.id", streamId);
      // ... existing body ...
    },
  );
}
```

For snapshot methods:

```typescript
async getSnapshot(streamId: string, ...): Promise<...> {
  return withSpan(
    getRelationalAdapterTracer(),
    "eventualize.adapter.snapshot.read",
    async (span) => {
      span.setAttribute("eventualize.adapter.kind", "relational");
      span.setAttribute("eventualize.stream.id", streamId);
      // ... existing body ...
    },
  );
}
```

Repeat for all public async methods.

- [ ] **Step 4: Build and verify**

```bash
pnpm build 2>&1 | grep "error TS" | wc -l
```

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/relational-storage-adapter/src/
git commit -m "feat(relational-adapter): instrument with OTEL spans"
```

---

### Task 12: Instrument DynamoDB Storage Adapter

**Files:**
- Modify: `packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapter.ts`

- [ ] **Step 1: Apply same pattern as Task 11**

Use `getDynamoDbAdapterTracer()` and span attribute `kind: "dynamodb"`.

- [ ] **Step 2: Build and verify**

```bash
pnpm build 2>&1 | grep "error TS" | wc -l
```

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/dynamodb-storage-adapter/
git commit -m "feat(dynamodb-adapter): instrument with OTEL spans"
```

---

### Task 13: Instrument MySQL Storage Adapter

**Files:**
- Modify: `packages/adapters/mysql-storage-adapter/src/*.ts`

- [ ] **Step 1: Apply same pattern as Task 11**

Use `getMySqlAdapterTracer()` and span attribute `kind: "mysql"`.

- [ ] **Step 2: Build and verify**

```bash
pnpm build 2>&1 | grep "error TS" | wc -l
```

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/mysql-storage-adapter/
git commit -m "feat(mysql-adapter): instrument with OTEL spans"
```

---

### Task 14: Instrument PostgreSQL Storage Adapter

**Files:**
- Modify: `packages/adapters/postgres-storage-adapter/src/*.ts`

- [ ] **Step 1: Apply same pattern as Task 11**

Use `getPostgresAdapterTracer()` and span attribute `kind: "postgres"`.

- [ ] **Step 2: Build and verify**

```bash
pnpm build 2>&1 | grep "error TS" | wc -l
```

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/postgres-storage-adapter/
git commit -m "feat(postgres-adapter): instrument with OTEL spans"
```

---

## Phase 5: Documentation

### Task 15: Write OTEL Integration Guide

**Files:**
- Create: `docs/OTEL_INTEGRATION.md`

- [ ] **Step 1: Create the guide**

```markdown
# OpenTelemetry Integration Guide

eventualize-js is OTEL-native. The library self-instruments internally—you only
need to configure an OTEL SDK at application startup, and spans appear automatically.

When no OTEL SDK is registered, all instrumentation is a no-op with zero overhead
(handled by `@opentelemetry/api`'s built-in no-op tracer).

---

## Final User Experience — Setup (Once at App Startup)

This is the complete setup. No library API changes are required.

### 1. Install OTEL packages

\`\`\`bash
npm install @opentelemetry/api @opentelemetry/sdk-node \
            @opentelemetry/exporter-trace-otlp-http \
            @opentelemetry/resources
\`\`\`

### 2. Configure OTEL SDK at your application entry point

\`\`\`typescript
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
\`\`\`

### 3. Use eventualize-js as usual — zero API changes

\`\`\`typescript
const factory = new EvDbStreamFactory({
  eventTypes: [...],
  viewNames: [...],
  // No instrumentation parameter. Library self-instruments.
});

const stream = await factory.getAsync("user-123", "UserStream");
await stream.appendEventUserRegistered({ email: "user@example.com" });
// Spans created automatically and exported to your OTEL backend.
\`\`\`

---

## Quick Start

See [Final User Experience](#final-user-experience--setup-once-at-app-startup) above.

## Library Tracers

eventualize-js uses these tracer names:

- `@eventualize/core` — Stream factory and stream operations
- `@eventualize/relational-adapter`
- `@eventualize/dynamodb-adapter`
- `@eventualize/mysql-adapter`
- `@eventualize/postgres-adapter`

Use `eventualizeInstrumentation().tracerNames` to get this list programmatically.

## Adding Custom Spans (Optional)

If you want to add your own spans under the Eventualize tracer:

\`\`\`typescript
import { withSpan, getCoreTracer } from "@eventualize/core/otel";

// withSpan: automatic OK/ERROR lifecycle management
const result = await withSpan(
  getCoreTracer(),
  "my.custom.work",
  async (span) => {
    span.setAttribute("custom.key", "value");
    return await doWork();
  },
);
\`\`\`

Or use the TypeScript \`using\` keyword for manual span control:

\`\`\`typescript
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
\`\`\`

> **Note:** `startScopedSpan` just ends the span on disposal. Error state is your
> responsibility. If you want automatic error detection, use `withSpan` instead.

## Message Queue Propagation

When messages are stored, their \`traceparent\` field is automatically populated
from the current span context. To propagate the context through queues:

### pgBoss Producer

\`\`\`typescript
import { propagation, context } from "@opentelemetry/api";

const carrier: Record<string, string> = {};
propagation.inject(context.active(), carrier);

await queue.send("topic", payload, {
  headers: {
    traceparent: carrier.traceparent,
    tracestate: carrier.tracestate,
  },
});
\`\`\`

### Kafka Consumer (Parent Context)

Use the upstream trace as the parent for downstream processing:

\`\`\`typescript
import { propagation, context } from "@opentelemetry/api";

const carrier = {
  traceparent: msg.headers?.traceparent?.toString(),
  tracestate: msg.headers?.tracestate?.toString(),
};

const parentContext = propagation.extract(context.active(), carrier);

await context.with(parentContext, async () => {
  // All operations here continue the upstream trace
  await processMessage(msg);
});
\`\`\`

### Kafka Consumer (Linked Span)

If you want a new trace that *links* to the upstream:

\`\`\`typescript
import { propagation, context, trace } from "@opentelemetry/api";

const carrier = { traceparent: msg.headers.traceparent.toString() };
const upstreamCtx = propagation.extract(context.active(), carrier);
const upstreamSpanCtx = trace.getSpan(upstreamCtx)?.spanContext();

const span = tracer.startSpan("process.message", {
  links: upstreamSpanCtx ? [{ context: upstreamSpanCtx }] : [],
});
\`\`\`

## Span Hierarchy

\`\`\`
Application Span (your code)
└── eventualize.stream.get              (@eventualize/core)
    └── eventualize.adapter.query.stream (@eventualize/relational-adapter)
└── eventualize.stream.append           (@eventualize/core)
    ├── eventualize.adapter.store       (@eventualize/relational-adapter)
    └── (message stored with traceparent)
\`\`\`

After queue:

\`\`\`
process.message (parent: traceparent from message)
└── ... your processing ...
\`\`\`

## Disabling Tracing

Don't register an OTEL SDK. \`trace.getTracer()\` returns a no-op tracer
automatically, and the library has zero overhead.
```

- [ ] **Step 2: Commit**

```bash
git add docs/OTEL_INTEGRATION.md
git commit -m "docs: add OTEL integration guide"
```

---

## Phase 6: Final Verification

### Task 16: Full Build, Lint & Test

- [ ] **Step 1: Run full build**

```bash
cd /Users/bnaya/Documents/Code/Open\ Sources/EvDb\ Family/eventualize-js
pnpm build 2>&1 | grep "error TS" | wc -l
```

Expected: Same or fewer than baseline

- [ ] **Step 2: Run ESLint**

```bash
pnpm exec eslint . 2>&1 | grep -c " error "
```

Expected: Same or fewer than baseline

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

Expected: All tests pass

- [ ] **Step 4: Verify symlinks (per CLAUDE.md warning)**

```bash
BASE=$(pwd)
ls -la "$BASE/packages/core/node_modules/@eventualize/types"
ls -la "$BASE/apps/sample-app/node_modules/@eventualize/core"
```

If broken, run symlink restoration commands from CLAUDE.md.

- [ ] **Step 5: Manual smoke test (optional)**

Create a quick smoke script `scripts/otel-smoke-test.ts`:

```typescript
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ConsoleSpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";

const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

// Use eventualize-js
// ... (verify spans appear in console)
```

- [ ] **Step 6: Final commit if fixes needed**

```bash
git add -A
git commit -m "chore: final cleanup from OTEL integration"
```

---

## Summary

This plan delivers OTEL-native instrumentation with:

✅ **Self-Instrumenting Library** — Each package internally uses `trace.getTracer()`  
✅ **Zero User API Changes** — No `instrumentation` parameter anywhere  
✅ **Per-Package Tracers** — Granular filtering by component  
✅ **OTEL Standards Everywhere** — `Span`, `Tracer`, `Attributes`, `propagation` API  
✅ **Auto Lifecycle** — `withSpan` handles try/finally + status + recordException + end  
✅ **TS `using` Support** — `startScopedSpan` with error detection via completion flag  
✅ **W3C Trace Context** — Captured via `propagation.inject`, stored on messages  
✅ **Built-In No-Op** — OTEL's default tracer when no provider registered  
✅ **Info Helper** — `eventualizeInstrumentation()` for SDK configuration  
✅ **Backwards Compatible** — All changes additive  

**Removed from earlier designs:**
- ❌ `EvDbInstrumentation` class (library self-instruments)
- ❌ `instrumentation` config parameter (not needed)
- ❌ Custom `IOTelInstrumentation` interface (use OTEL types)
- ❌ Custom `NoOpOTelInstrumentation` class (OTEL handles it)
- ❌ Custom `IOTelContext` type (use `propagation.inject` carrier)
- ❌ Custom `getCurrentSpan()` (use `trace.getActiveSpan()`)

**Net result:** Minimal user impact, idiomatic OTEL, granular per-package tracing.

---

**Next Steps after implementation:**
- Manual E2E testing with Jaeger/OTLP exporter
- Integration tests with real pgBoss / Kafka
- Performance benchmarking (no-op overhead validation)
- Sample app demonstrating full OTEL setup
