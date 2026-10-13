# Stream Replay Part 2 (`clone`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `factory.clone(streamId, targetStreamId, adapters, options?)`, which copies a stream (up to an offset) into a new, empty stream of the same type, with optional event and message projections.

**Architecture:** Split `EvDbStream` internals into reusable building blocks (`buildEvent`, `applyToViews`, `produceMessages`). The factory gains a third internal stream class, `CloneStream`, whose `appendCloned` composes those blocks: it keeps the source metadata and calls the producer only when a `projectMessage` is given. `clone()` reads source pages through a shared `fetchPage`, stores the target after each page, wraps failures in `EvDbCloneError`, and returns a fresh `factory.get()` of the target.

**Tech Stack:** TypeScript 6 (NodeNext ESM), pnpm workspace, `node:test` via `tsx`, OpenTelemetry API, Prisma / DynamoDB adapters (integration only).

**Spec:** `docs/superpowers/specs/2026-10-12-stream-clone-design.md` (builds on `docs/superpowers/specs/2026-10-12-stream-replay-goto-offset-design.md`)

## Global Constraints

- Package manager: `pnpm` only.
- Do **not** run `git commit` or any git command that changes history, refs or the index. Leave changes in the working tree.
- After every task: `pnpm build 2>&1 | grep "error TS" | wc -l` → `0`; `pnpm exec eslint . 2>&1 | grep -c " error "` → `0`.
- Prettier-clean every `.ts` file you touch: `pnpm exec prettier --check <file>` (fix with `--write` on those files only). Do not reformat untouched files; 66 untouched files already fail prettier.
- Type safety: no `any`, no non-null `!` in production code, no new `unknown` escape hatches. Allowed exceptions (and only these): (a) the existing `as unknown as typeof this.XStreamClass` idiom for the dynamic stream classes; (b) the two storage-boundary casts in `EvDbStreamFactory.ts` named `toCloneSourceEvent` / `toPayloadData` (Task 2); (c) `EvDbCloneError.cause: unknown`.
- Imports: `import type` for type-only imports; relative imports end with `.js`.
- Default values: `pageSize` 100; `projectEvent` = copy as is; `projectMessage` = drop all and **do not call the producer**.
- Target offsets start at `0` (`lastStreamOffset` `-1`).
- Span name `eventualize.stream.clone`; attributes `eventualize.stream.type`, `eventualize.stream.id` (source), `eventualize.clone.target_id`, `eventualize.clone.offset_limit` (only when set).
- Core unit tests: `node --import tsx --test packages/core/src/**/*.test.ts` (no Docker).
- Typecheck test files: `pnpm exec tsc -p packages/core/tsconfig.test.json --noEmit --composite false --incremental false` (a pre-existing TS6059 in `EvDbView.ts` is known; new files must have zero errors and every `@ts-expect-error` must be used).
- Integration tests import the built `dist/`: run `pnpm build` before them. Run only `apps/sample-app/src/tests/integration.test.ts`, in the background, and wait for the `ℹ fail` summary line (the process can linger minutes after it). Before treating a hang or failure as a code bug, check `docker info` and `ps aux | grep "node --test"` for foreign CPU-heavy processes.

## Review Focus

1. **Source snapshots must be ignored** — clone folds target views from the copied events only; a source snapshot (possibly stale or from another schema) must not leak into the target. (Task 2 test: "ignores source snapshots".)
2. **`create()`-based source starting at offset 1** — the first source page starts at offset 0 but the first event is 1; target offsets must still start at 0. (Task 2 test: "source starting at offset 1".)
3. **`offsetLimit: 0`** — copies exactly the event at offset 0, no more. (Task 2 test: "offsetLimit 0 copies only the first event".)
4. **A page where every event is dropped** — no `store()` for that page, the clone continues, offsets stay compact. (Task 2 test: "a page where every event is dropped".)
5. **A throwing producer** (e.g. current producer code on an old event shape) — must surface as `EvDbCloneError` with `cause`, not a raw error. (Task 2 test: "producer error is wrapped".)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/core/src/store/EvDbStream.ts` | Modify | add `buildEvent`, `applyToViews`, `produceMessages`; re-express `appendEvent` / `applyEvent` |
| `packages/core/src/store/fetchPage.ts` | Create | shared page reader (moved from `EvDbReadOnlyStream.ts`) |
| `packages/core/src/store/EvDbReadOnlyStream.ts` | Modify | import `fetchPage` |
| `packages/types/src/messages/EvDbMessage.ts` | Modify | `withChannel(channel)` |
| `packages/core/src/store/EvDbCloneError.ts` | Create | clone failure with progress |
| `packages/core/src/factories/EvDbCloneTypes.ts` | Create | `EvDbCloneOptions`, `EvDbCloneSourceEvent`, `EvDbCloneEventResult`, `EvDbCloneMessageProjection` |
| `packages/core/src/factories/EvDbStreamFactory.ts` | Modify | `CloneStream` class, `clone()` |
| `packages/core/src/factories/IEvDbStreamFactory.ts` | Modify | `clone` signature |
| `packages/core/src/store/EvDbStream.buildingBlocks.test.ts` | Create | Task 1 tests |
| `packages/core/src/store/fetchPage.test.ts` | Create | Task 1 tests |
| `packages/core/src/store/EvDbMessage.withChannel.test.ts` | Create | Task 1 tests (the types package has no test setup and compiles every `src/**/*.ts` into `dist`, so this test lives in core) |
| `packages/core/src/factories/EvDbStreamFactory.clone.test.ts` | Create | Task 2 tests |
| `apps/sample-app/src/tests/integration.test.ts` | Modify | Task 3 tests |
| `packages/README.md`, `.changeset/stream-clone.md` | Modify / Create | docs |

---

### Task 1: Building blocks — `EvDbStream` split, shared `fetchPage`, `EvDbMessage.withChannel`

**Files:**
- Modify: `packages/core/src/store/EvDbStream.ts`
- Create: `packages/core/src/store/fetchPage.ts`
- Modify: `packages/core/src/store/EvDbReadOnlyStream.ts`
- Modify: `packages/types/src/messages/EvDbMessage.ts`
- Test: `packages/core/src/store/EvDbStream.buildingBlocks.test.ts`, `packages/core/src/store/fetchPage.test.ts`, `packages/core/src/store/EvDbMessage.withChannel.test.ts`

**Interfaces:**
- Consumes: `InMemoryStorageAdapter` (default export of `packages/core/src/store/InMemoryStorageAdapter.test-support.ts`: `seedEvents(events)`, `seedSnapshot(viewAddress, offset, state)`, `storedMessages`, `getEventsAsync(cursor, pageSize = 100)`, `getLastOffsetAsync(address)`, `storeStreamAsync(events, messages)`).
- Produces:
  - `EvDbStream.buildEvent(eventType: string, payload: IEvDbPayloadData, capturedAt: Date, capturedBy: string): EvDbEvent` — `protected`; next cursor + active trace context; does not touch pending buffers.
  - `EvDbStream.applyToViews(e: EvDbEvent): void` — `protected`.
  - `EvDbStream.produceMessages(e: EvDbEvent): ReadonlyArray<EvDbMessage>` — `protected`; producer with current view states, stamped with `e`'s trace context.
  - `fetchPage(adapter: IEvDbStorageStreamAdapter, address: EvDbStreamAddress, fromOffset: number, pageSize: number): Promise<EvDbEvent[]>` — named export of `packages/core/src/store/fetchPage.ts`.
  - `EvDbMessage.withChannel(channel: string): EvDbMessage`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/store/EvDbStream.buildingBlocks.test.ts`:

```ts
import { test, describe } from "node:test";
import * as assert from "node:assert";
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";
import EvDbStream from "./EvDbStream.js";
import { createViewFactory } from "../factories/EvDbViewFactory.js";
import InMemoryStorageAdapter from "./InMemoryStorageAdapter.test-support.js";
import type { EvDbView } from "../view/EvDbView.js";

type Events = { Added: { points: number } };
type SumState = { sum: number };

const sumView = createViewFactory<SumState, Events>({
  viewName: "Sum",
  streamType: "S",
  defaultState: { sum: 0 },
  handlers: { Added: (s, e) => ({ sum: s.sum + e.points }) },
});

class TestStream extends EvDbStream {
  public producerCalls = 0;
  public lastSeenSum = -1;

  constructor() {
    const adapter = new InMemoryStorageAdapter();
    const views: EvDbView<unknown>[] = [sumView.create("s-1", adapter) as EvDbView<unknown>];
    super("S", views, adapter, "s-1", -1, (event, viewStates) => {
      this.producerCalls++;
      const sum = viewStates["Sum"];
      this.lastSeenSum =
        typeof sum === "object" && sum !== null && "sum" in sum && typeof sum.sum === "number"
          ? sum.sum
          : -1;
      return [EvDbMessage.createFromMetadata(event, "Added", { n: 1 })];
    });
  }
  build(points: number, capturedAt: Date, capturedBy: string): EvDbEvent {
    const payload: IEvDbPayloadData = { points };
    return this.buildEvent("Added", payload, capturedAt, capturedBy);
  }
  views(e: EvDbEvent): void {
    this.applyToViews(e);
  }
  produce(e: EvDbEvent): ReadonlyArray<EvDbMessage> {
    return this.produceMessages(e);
  }
  get sum(): number {
    return (this.getViews()["Sum"] as EvDbView<SumState>).state.sum;
  }
}

describe("EvDbStream building blocks", () => {
  test("buildEvent uses the next offset and the given capturedAt/capturedBy", () => {
    const stream = new TestStream();
    const at = new Date("2020-01-01T00:00:00Z");
    const e = stream.build(5, at, "someone");
    assert.strictEqual(e.streamCursor.offset, 0);
    assert.strictEqual(e.capturedAt.getTime(), at.getTime());
    assert.strictEqual(e.capturedBy, "someone");
    assert.deepStrictEqual(e.payload, { points: 5 });
  });

  test("buildEvent does not add to pending events or apply views", () => {
    const stream = new TestStream();
    stream.build(5, new Date(), "x");
    assert.strictEqual(stream.countOfPendingEvents, 0);
    assert.strictEqual(stream.sum, 0);
  });

  test("applyToViews updates views without calling the producer", () => {
    const stream = new TestStream();
    stream.views(stream.build(5, new Date(), "x"));
    assert.strictEqual(stream.sum, 5);
    assert.strictEqual(stream.producerCalls, 0);
    assert.strictEqual(stream.getMessages().length, 0);
  });

  test("produceMessages runs the producer with the current view states", () => {
    const stream = new TestStream();
    const e = stream.build(5, new Date(), "x");
    stream.views(e);
    const messages = stream.produce(e);
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(stream.producerCalls, 1);
    assert.strictEqual(stream.lastSeenSum, 5);
    assert.strictEqual(stream.getMessages().length, 0);
  });
});
```

Create `packages/core/src/store/fetchPage.test.ts`:

```ts
import { test, describe } from "node:test";
import * as assert from "node:assert";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import { fetchPage } from "./fetchPage.js";
import InMemoryStorageAdapter from "./InMemoryStorageAdapter.test-support.js";

const address = new EvDbStreamAddress("S", "s-1");

/** Counts how many adapter iterators were closed (their `finally` ran). */
class ClosingTracker extends InMemoryStorageAdapter {
  public closed = 0;
  override async *getEventsAsync(
    cursor: EvDbStreamCursor,
    pageSize?: number,
  ): AsyncGenerator<EvDbEvent, void, undefined> {
    try {
      yield* super.getEventsAsync(cursor, pageSize);
    } finally {
      this.closed++;
    }
  }
}

const seeded = (count: number): ClosingTracker => {
  const adapter = new ClosingTracker();
  adapter.seedEvents(
    Array.from(
      { length: count },
      (_, i) => new EvDbEvent("Added", new EvDbStreamCursor(address, i), { points: i }),
    ),
  );
  return adapter;
};

describe("fetchPage", () => {
  test("returns at most pageSize events from fromOffset", async () => {
    const page = await fetchPage(seeded(10), address, 2, 3);
    assert.deepStrictEqual(
      page.map((e) => e.streamCursor.offset),
      [2, 3, 4],
    );
  });

  test("closes the adapter iterator after a full page", async () => {
    const adapter = seeded(10);
    await fetchPage(adapter, address, 0, 3);
    assert.strictEqual(adapter.closed, 1);
  });

  test("returns an empty page past the head", async () => {
    const adapter = seeded(2);
    const page = await fetchPage(adapter, address, 5, 3);
    assert.deepStrictEqual(page, []);
    assert.strictEqual(adapter.closed, 1);
  });
});
```

Create `packages/core/src/store/EvDbMessage.withChannel.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test packages/core/src/store/EvDbStream.buildingBlocks.test.ts packages/core/src/store/fetchPage.test.ts packages/core/src/store/EvDbMessage.withChannel.test.ts`
Expected: FAIL — `this.buildEvent is not a function`, `Cannot find module './fetchPage.js'`, `original.withChannel is not a function`.

- [ ] **Step 3: Split `EvDbStream`**

In `packages/core/src/store/EvDbStream.ts`, replace the body of the `try` block of `appendEvent` with:

```ts
      const e = this.buildEvent(eventType, payload, new Date(), capturedBy);
      this._pendingEvents = [...this._pendingEvents, e];
      const producedMessages = this.applyEvent(e);
      this._pendingMessages = [...this._pendingMessages, ...producedMessages];

      return e;
```

Replace the whole `applyEvent` method (JSDoc included) with these four methods:

```ts
  /**
   * Builds the next event of this stream: the next cursor and the active trace
   * context. It does not add the event to the pending events and does not apply
   * it to the views.
   *
   * `appendEvent` passes `new Date()`; clone passes the source event's values.
   */
  protected buildEvent(
    eventType: string,
    payload: IEvDbPayloadData,
    capturedAt: Date,
    capturedBy: string,
  ): EvDbEvent {
    const cursor = this.getNextCursor(this._pendingEvents);
    const { traceparent, tracestate } = this.captureTraceparent();
    return new EvDbEvent(
      eventType,
      cursor,
      payload,
      capturedAt,
      capturedBy,
      undefined,
      traceparent,
      tracestate,
    );
  }

  /**
   * Applies an event to every view and derives its outbox messages, without
   * adding anything to the pending buffers.
   *
   * `appendEvent` uses this for new events. Replay uses it for events loaded
   * from storage, so view handlers see the stored metadata (cursor,
   * `capturedAt`, `capturedBy`, trace context) instead of new values.
   *
   * @param e - The event to apply.
   * @returns The messages produced for `e`, stamped with `e`'s trace context.
   */
  protected applyEvent(e: EvDbEvent): ReadonlyArray<EvDbMessage> {
    this.applyToViews(e);
    return this.produceMessages(e);
  }

  /** Applies an event to every view. Does not produce messages. */
  protected applyToViews(e: EvDbEvent): void {
    for (const view of Object.values(this._views)) {
      view.applyEvent(e);
    }
  }

  /**
   * Runs the messages producer for `e` with the current view states and stamps
   * the messages with `e`'s trace context. Does not touch the pending buffers.
   */
  protected produceMessages(e: EvDbEvent): ReadonlyArray<EvDbMessage> {
    const viewsStates = Object.fromEntries(
      Object.entries(this._views).map(([k, v]) => {
        return [k, (v as EvDbView<unknown>).state];
      }),
    );
    return this.messagesProducer(e, viewsStates).map((m) =>
      e.traceparent ? m.withTraceparent(e.traceparent, e.tracestate) : m,
    );
  }
```

(`appendEvent` already sets `capturedBy = capturedBy ?? EvDbStream.DEFAULT_CAPTURE_BY` before the `try`, so `capturedBy` is a `string` when passed to `buildEvent`. If TypeScript still sees `string | null | undefined`, introduce `const by: string = capturedBy ?? EvDbStream.DEFAULT_CAPTURE_BY;` and pass `by`.)

- [ ] **Step 4: Move `fetchPage` to its own module**

Create `packages/core/src/store/fetchPage.ts`:

```ts
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";

/**
 * Fetches up to `pageSize` events starting at `fromOffset`, then closes the
 * adapter iterator so no adapter span or query stays open between calls.
 * Shared by replay (`EvDbReadOnlyStream`) and `clone`.
 */
export async function fetchPage(
  adapter: IEvDbStorageStreamAdapter,
  address: EvDbStreamAddress,
  fromOffset: number,
  pageSize: number,
): Promise<EvDbEvent[]> {
  const page: EvDbEvent[] = [];
  for await (const e of adapter.getEventsAsync(
    new EvDbStreamCursor(address, fromOffset),
    pageSize,
  )) {
    page.push(e);
    if (page.length >= pageSize) break;
  }
  return page;
}
```

In `packages/core/src/store/EvDbReadOnlyStream.ts`: delete the local `fetchPage` function and its JSDoc, add `import { fetchPage } from "./fetchPage.js";`, and remove the `EvDbStreamCursor` import if it is no longer used in that file.

- [ ] **Step 5: Add `EvDbMessage.withChannel`**

In `packages/types/src/messages/EvDbMessage.ts`, add after `withTraceparent`:

```ts
  /**
   * Returns a copy of this message on another channel. All other fields are kept.
   * Use it to reroute messages, e.g. in a clone `projectMessage`.
   */
  public withChannel(channel: string): EvDbMessage {
    return new EvDbMessage(
      this.id,
      this.eventType,
      channel,
      this.shardName,
      this.messageType,
      this.serializeType,
      this.capturedAt,
      this.capturedBy,
      this.streamCursor,
      this.payload,
      this.storedAt,
      this.traceparent,
      this.tracestate,
    );
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --import tsx --test packages/core/src/**/*.test.ts`
Expected: PASS — all existing core tests (45) plus the 8 new ones.

- [ ] **Step 7: Build, lint, prettier, test typecheck** (see Global Constraints; expect `0` / `0`).

- [ ] **Step 8: Do not commit.**

---

### Task 2: `factory.clone`

**Files:**
- Create: `packages/core/src/store/EvDbCloneError.ts`
- Create: `packages/core/src/factories/EvDbCloneTypes.ts`
- Modify: `packages/core/src/factories/EvDbStreamFactory.ts`
- Modify: `packages/core/src/factories/IEvDbStreamFactory.ts`
- Test: `packages/core/src/factories/EvDbStreamFactory.clone.test.ts`

**Interfaces:**
- Consumes (Task 1): `buildEvent`, `applyToViews`, `produceMessages` (protected on `EvDbStream`); `fetchPage` from `../store/fetchPage.js`; `EvDbMessage.withChannel`.
- Produces:
  - `EvDbStreamFactory.clone(streamId: string, targetStreamId: string, streamStorageAdapter: IEvDbStorageStreamAdapter, snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter, options?: EvDbCloneOptions<TEventMap>): Promise<StreamWithEventMethods<TEventMap, TViews>>` (also on `IEvDbStreamFactory`).
  - `EvDbCloneError` (default export of `packages/core/src/store/EvDbCloneError.ts`) with `sourceStreamId`, `targetStreamId`, `lastSourceOffset`, `targetStoredOffset`, `cause`.
  - Types (named exports of `packages/core/src/factories/EvDbCloneTypes.ts`): `EvDbCloneOptions<TEventMap>`, `EvDbCloneSourceEvent<TEventMap>`, `EvDbCloneEventResult<TEventMap>`, `EvDbCloneMessageProjection`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/factories/EvDbStreamFactory.clone.test.ts`:

```ts
import { test, describe, before, after, beforeEach } from "node:test";
import * as assert from "node:assert";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";
import { EvDbStreamFactory } from "./EvDbStreamFactory.js";
import { createViewFactory } from "./EvDbViewFactory.js";
import type { ViewFactory } from "./EvDbViewFactory.js";
import EvDbCloneError from "../store/EvDbCloneError.js";
import InMemoryStorageAdapter from "../store/InMemoryStorageAdapter.test-support.js";

type Events = {
  Added: { points: number };
  Doubled: { factor: number };
  AddedV2: { amount: number };
};
type Views = {
  Sum: { sum: number; lastCapturedAt: number };
  Count: { count: number };
};

let producerCalls = 0;
let producerShouldThrow = false;

const factory = new EvDbStreamFactory<Events, "S", Views>({
  streamType: "S",
  viewNames: ["Sum", "Count"],
  viewFactories: [
    createViewFactory<Views["Sum"], Events>({
      viewName: "Sum",
      streamType: "S",
      defaultState: { sum: 0, lastCapturedAt: 0 },
      handlers: {
        Added: (s, e, m) => ({ sum: s.sum + e.points, lastCapturedAt: m.capturedAt.getTime() }),
        AddedV2: (s, e, m) => ({ sum: s.sum + e.amount, lastCapturedAt: m.capturedAt.getTime() }),
        Doubled: (s, e, m) => ({ sum: s.sum * e.factor, lastCapturedAt: m.capturedAt.getTime() }),
      },
    }) as unknown as ViewFactory<unknown, Events>,
    createViewFactory<Views["Count"], Events>({
      viewName: "Count",
      streamType: "S",
      defaultState: { count: 0 },
      handlers: {
        Added: (s) => ({ count: s.count + 1 }),
        AddedV2: (s) => ({ count: s.count + 1 }),
        Doubled: (s) => ({ count: s.count + 1 }),
      },
    }) as unknown as ViewFactory<unknown, Events>,
  ],
  eventTypes: [
    {
      eventName: "Added",
      eventMessagesProducer: (event, views) => {
        producerCalls++;
        if (producerShouldThrow) throw new Error("producer failure");
        return [EvDbMessage.createFromMetadata(event, "Added", { views }, "points")];
      },
    },
    { eventName: "Doubled" },
    { eventName: "AddedV2" },
  ],
});

const SRC = "src";
const TGT = "tgt";
const at = (offset: number): Date => new Date(Date.UTC(2020, 0, 1, 0, 0, offset));
const SOURCE_TRACEPARENT = "00-11111111111111111111111111111111-2222222222222222-01";

const ev = (
  offset: number,
  eventType: string,
  payload: IEvDbPayloadData,
  streamId: string = SRC,
): EvDbEvent =>
  new EvDbEvent(
    eventType,
    new EvDbStreamCursor("S", streamId, offset),
    payload,
    at(offset),
    `writer-${offset}`,
    new Date(),
    SOURCE_TRACEPARENT,
    "",
  );

// Sum after each offset: 1, 3, 6, 9, 13
const SOURCE: ReadonlyArray<[string, IEvDbPayloadData]> = [
  ["Added", { points: 1 }],
  ["Added", { points: 2 }],
  ["Doubled", { factor: 2 }],
  ["Added", { points: 3 }],
  ["Added", { points: 4 }],
];

const seeded = (firstOffset = 0): InMemoryStorageAdapter => {
  const adapter = new InMemoryStorageAdapter();
  adapter.seedEvents(SOURCE.map(([t, p], i) => ev(firstOffset + i, t, p)));
  return adapter;
};

const readEvents = async (
  adapter: InMemoryStorageAdapter,
  streamId: string = TGT,
): Promise<EvDbEvent[]> => {
  const out: EvDbEvent[] = [];
  for await (const e of adapter.getEventsAsync(new EvDbStreamCursor("S", streamId, 0))) {
    out.push(e);
  }
  return out;
};

/** Fails the second storeStreamAsync call. */
class FailOnSecondStore extends InMemoryStorageAdapter {
  private storeCalls = 0;
  override async storeStreamAsync(
    events: ReadonlyArray<EvDbEvent>,
    messages: ReadonlyArray<EvDbMessage>,
  ) {
    this.storeCalls++;
    if (this.storeCalls === 2) throw new Error("boom");
    return super.storeStreamAsync(events, messages);
  }
}

const provider = new NodeTracerProvider();
before(() => provider.register());
after(() => provider.shutdown());

describe("EvDbStreamFactory.clone", () => {
  beforeEach(() => {
    producerCalls = 0;
    producerShouldThrow = false;
  });

  test("copies events as is, keeping type, payload, capturedAt and capturedBy", async () => {
    const adapter = seeded();
    const target = await factory.clone(SRC, TGT, adapter, adapter);
    const events = await readEvents(adapter);
    assert.deepStrictEqual(
      events.map((e) => e.streamCursor.offset),
      [0, 1, 2, 3, 4],
    );
    assert.deepStrictEqual(
      events.map((e) => e.eventType),
      SOURCE.map(([t]) => t),
    );
    assert.deepStrictEqual(
      events.map((e) => e.payload),
      SOURCE.map(([, p]) => p),
    );
    assert.deepStrictEqual(
      events.map((e) => e.capturedAt.getTime()),
      [0, 1, 2, 3, 4].map((o) => at(o).getTime()),
    );
    assert.deepStrictEqual(
      events.map((e) => e.capturedBy),
      [0, 1, 2, 3, 4].map((o) => `writer-${o}`),
    );
    assert.strictEqual(target.storedOffset, 4);
    assert.strictEqual(target.views.Sum.sum, 13);
    assert.strictEqual(target.views.Count.count, 5);
    assert.strictEqual(target.views.Sum.lastCapturedAt, at(4).getTime());
  });

  test("returns a writable stream at the target head", async () => {
    const adapter = seeded();
    const target = await factory.clone(SRC, TGT, adapter, adapter);
    await target.appendEventAdded({ points: 10 });
    await target.store();
    const events = await readEvents(adapter);
    assert.strictEqual(events.length, 6);
    assert.strictEqual(events[5].streamCursor.offset, 5);
  });

  test("ignores source snapshots", async () => {
    const adapter = seeded();
    const sourceSum = new EvDbViewAddress(new EvDbStreamAddress("S", SRC), "Sum");
    adapter.seedSnapshot(sourceSum, 3, { sum: 999, lastCapturedAt: 0 });
    const target = await factory.clone(SRC, TGT, adapter, adapter);
    assert.strictEqual(target.views.Sum.sum, 13);
  });

  test("source starting at offset 1 gives target offsets from 0", async () => {
    const adapter = seeded(1);
    await factory.clone(SRC, TGT, adapter, adapter);
    const events = await readEvents(adapter);
    assert.deepStrictEqual(
      events.map((e) => e.streamCursor.offset),
      [0, 1, 2, 3, 4],
    );
  });

  test("offsetLimit is inclusive", async () => {
    const adapter = seeded();
    const target = await factory.clone(SRC, TGT, adapter, adapter, { offsetLimit: 2 });
    assert.strictEqual((await readEvents(adapter)).length, 3);
    assert.strictEqual(target.views.Sum.sum, 6);
  });

  test("offsetLimit 0 copies only the first event", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, { offsetLimit: 0 });
    assert.strictEqual((await readEvents(adapter)).length, 1);
  });

  test("offsetLimit above the head is capped", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, { offsetLimit: 99 });
    assert.strictEqual((await readEvents(adapter)).length, 5);
  });

  test("events appended to the source during the clone are not copied", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, {
      pageSize: 2,
      projectEvent: (e) => {
        if (e.metadata.streamCursor.offset === 0) {
          adapter.seedEvents([ev(5, "Added", { points: 100 })]);
        }
        return e;
      },
    });
    assert.strictEqual((await readEvents(adapter)).length, 5);
  });

  test("pages: 5 events with pageSize 2", async () => {
    const adapter = seeded();
    const target = await factory.clone(SRC, TGT, adapter, adapter, { pageSize: 2 });
    assert.deepStrictEqual(
      (await readEvents(adapter)).map((e) => e.streamCursor.offset),
      [0, 1, 2, 3, 4],
    );
    assert.strictEqual(target.views.Sum.sum, 13);
  });

  test("projectEvent can change the payload", async () => {
    const adapter = seeded();
    const target = await factory.clone(SRC, TGT, adapter, adapter, {
      projectEvent: (e) =>
        e.eventType === "Added"
          ? { eventType: "Added", payload: { points: e.payload.points * 10 } }
          : e,
    });
    assert.strictEqual(target.views.Sum.sum, 130);
  });

  test("projectEvent can change the event type", async () => {
    const adapter = seeded();
    const target = await factory.clone(SRC, TGT, adapter, adapter, {
      projectEvent: (e) =>
        e.eventType === "Added"
          ? { eventType: "AddedV2", payload: { amount: e.payload.points } }
          : e,
    });
    assert.deepStrictEqual(
      (await readEvents(adapter)).map((e) => e.eventType),
      ["AddedV2", "AddedV2", "Doubled", "AddedV2", "AddedV2"],
    );
    assert.strictEqual(target.views.Sum.sum, 13);
  });

  test("projectEvent can drop events; target offsets stay compact", async () => {
    const adapter = seeded();
    const target = await factory.clone(SRC, TGT, adapter, adapter, {
      projectEvent: (e) => (e.eventType === "Doubled" ? undefined : e),
    });
    assert.deepStrictEqual(
      (await readEvents(adapter)).map((e) => e.streamCursor.offset),
      [0, 1, 2, 3],
    );
    assert.strictEqual(target.views.Sum.sum, 10);
    assert.strictEqual(target.views.Count.count, 4);
  });

  test("a page where every event is dropped", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, {
      pageSize: 1,
      projectEvent: (e) => (e.eventType === "Doubled" ? undefined : e),
    });
    assert.deepStrictEqual(
      (await readEvents(adapter)).map((e) => e.streamCursor.offset),
      [0, 1, 2, 3],
    );
  });

  test("projectEvent can override capturedAt and capturedBy", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, {
      projectEvent: (e) => ({ ...e, capturedAt: new Date(0), capturedBy: "redacted" }),
    });
    const events = await readEvents(adapter);
    assert.ok(events.every((e) => e.capturedBy === "redacted"));
    assert.ok(events.every((e) => e.capturedAt.getTime() === 0));
  });

  test("by default no messages are stored and the producer is not called", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter);
    assert.strictEqual(adapter.storedMessages.length, 0);
    assert.strictEqual(producerCalls, 0);
  });

  test("identity projectMessage stores the produced messages for the target", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, { projectMessage: (m) => m });
    assert.strictEqual(producerCalls, 4);
    assert.strictEqual(adapter.storedMessages.length, 4);
    assert.ok(adapter.storedMessages.every((m) => m.streamCursor.streamId === TGT));
    const first = adapter.storedMessages[0].payload;
    assert.ok(first !== undefined);
    assert.deepStrictEqual(first["views"], {
      Sum: { sum: 1, lastCapturedAt: at(0).getTime() },
      Count: { count: 1 },
    });
  });

  test("projectMessage can reroute with withChannel", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, {
      projectMessage: (m) => m.withChannel(`sandbox.${m.channel}`),
    });
    assert.ok(adapter.storedMessages.every((m) => m.channel === "sandbox.points"));
  });

  test("projectMessage can drop some messages", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, {
      projectMessage: (m) => (m.streamCursor.offset < 2 ? m : undefined),
    });
    assert.strictEqual(adapter.storedMessages.length, 2);
  });

  test("cloned events carry the clone span's trace context, not the source's", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter);
    const events = await readEvents(adapter);
    for (const e of events) {
      assert.ok(e.traceparent !== undefined);
      assert.notStrictEqual(e.traceparent, SOURCE_TRACEPARENT);
      assert.match(e.traceparent, /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
    }
  });

  test("without a snapshot adapter the target has no views", async () => {
    const adapter = seeded();
    const target = await factory.clone(SRC, TGT, adapter);
    assert.strictEqual((await readEvents(adapter)).length, 5);
    assert.deepStrictEqual(Object.keys(target.getViews()), []);
  });

  test("empty source returns an empty target", async () => {
    const adapter = new InMemoryStorageAdapter();
    const target = await factory.clone(SRC, TGT, adapter, adapter);
    assert.strictEqual(target.storedOffset, -1);
    assert.strictEqual(target.views.Sum.sum, 0);
    assert.strictEqual((await readEvents(adapter)).length, 0);
  });

  test("a non-empty target is rejected before anything is written", async () => {
    const adapter = seeded();
    adapter.seedEvents([ev(0, "Added", { points: 9 }, TGT)]);
    await assert.rejects(
      factory.clone(SRC, TGT, adapter, adapter),
      (err: unknown) =>
        err instanceof EvDbCloneError &&
        err.lastSourceOffset === -1 &&
        err.targetStoredOffset === 0 &&
        err.sourceStreamId === SRC &&
        err.targetStreamId === TGT,
    );
    assert.strictEqual((await readEvents(adapter)).length, 1);
  });

  test("source equal to target is a RangeError", async () => {
    const adapter = seeded();
    await assert.rejects(factory.clone(SRC, SRC, adapter, adapter), RangeError);
  });

  test("invalid offsetLimit or pageSize is a RangeError", async () => {
    const adapter = seeded();
    await assert.rejects(
      factory.clone(SRC, TGT, adapter, adapter, { offsetLimit: -1 }),
      RangeError,
    );
    await assert.rejects(
      factory.clone(SRC, TGT, adapter, adapter, { offsetLimit: 1.5 }),
      RangeError,
    );
    await assert.rejects(factory.clone(SRC, TGT, adapter, adapter, { pageSize: 0 }), RangeError);
  });

  test("a store failure on page 2 reports page 1's progress and keeps page 1", async () => {
    const adapter = new FailOnSecondStore();
    adapter.seedEvents(SOURCE.map(([t, p], i) => ev(i, t, p)));
    await assert.rejects(
      factory.clone(SRC, TGT, adapter, adapter, { pageSize: 2 }),
      (err: unknown) =>
        err instanceof EvDbCloneError &&
        err.lastSourceOffset === 1 &&
        err.targetStoredOffset === 1 &&
        err.cause instanceof Error &&
        err.cause.message === "boom",
    );
    assert.strictEqual((await readEvents(adapter)).length, 2);
  });

  test("a throwing projection is wrapped with its cause", async () => {
    const adapter = seeded();
    const failure = new Error("bad projection");
    await assert.rejects(
      factory.clone(SRC, TGT, adapter, adapter, {
        pageSize: 2,
        projectEvent: (e) => {
          if (e.metadata.streamCursor.offset === 3) throw failure;
          return e;
        },
      }),
      (err: unknown) =>
        err instanceof EvDbCloneError &&
        err.cause === failure &&
        err.lastSourceOffset === 1 &&
        err.targetStoredOffset === 1,
    );
  });

  test("producer error is wrapped", async () => {
    const adapter = seeded();
    producerShouldThrow = true;
    await assert.rejects(
      factory.clone(SRC, TGT, adapter, adapter, { projectMessage: (m) => m }),
      (err: unknown) =>
        err instanceof EvDbCloneError &&
        err.cause instanceof Error &&
        err.cause.message === "producer failure",
    );
  });

  test("a throwing projectMessage is wrapped", async () => {
    const adapter = seeded();
    await assert.rejects(
      factory.clone(SRC, TGT, adapter, adapter, {
        projectMessage: () => {
          throw new Error("message projection failure");
        },
      }),
      (err: unknown) =>
        err instanceof EvDbCloneError &&
        err.cause instanceof Error &&
        err.cause.message === "message projection failure",
    );
  });

  test("projection results are type-checked against the event map", async () => {
    const adapter = seeded();
    await factory.clone(SRC, TGT, adapter, adapter, {
      // @ts-expect-error payload does not match eventType "Added"
      projectEvent: () => ({ eventType: "Added", payload: { amount: 1 } }),
    });
  });
});
```

Notes for the implementer:
- `producerShouldThrow` makes the shared factory's producer throw; it is reset in `beforeEach`.
- If `override` on the `FailOnSecondStore` / `ClosingTracker` methods is rejected by the compiler settings, drop the keyword.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test packages/core/src/factories/EvDbStreamFactory.clone.test.ts`
Expected: FAIL — `Cannot find module '../store/EvDbCloneError.js'`.

- [ ] **Step 3: Create `EvDbCloneError`**

Create `packages/core/src/store/EvDbCloneError.ts`:

```ts
export interface EvDbCloneErrorDetails {
  readonly sourceStreamId: string;
  readonly targetStreamId: string;
  readonly lastSourceOffset: number;
  readonly targetStoredOffset: number;
  readonly cause?: unknown;
}

/**
 * Thrown by `factory.clone(...)`.
 *
 * Either the target stream was not empty (nothing was written), or the copy
 * failed part-way. Pages stored before the failure stay in the target; use
 * `lastSourceOffset` to decide how to continue (e.g. clone again into a new
 * target id).
 */
export default class EvDbCloneError extends Error {
  readonly sourceStreamId: string;
  readonly targetStreamId: string;
  /** Last source offset whose page was stored; -1 when nothing was stored. */
  readonly lastSourceOffset: number;
  /** `storedOffset` of the target when the error happened; -1 when nothing was stored. */
  readonly targetStoredOffset: number;
  /**
   * The original error. `unknown` because anything can be thrown; the project
   * targets ES2020, whose lib has no `ErrorOptions`.
   */
  readonly cause: unknown;

  constructor(message: string, details: EvDbCloneErrorDetails) {
    super(message);
    this.name = "EvDbCloneError";
    this.sourceStreamId = details.sourceStreamId;
    this.targetStreamId = details.targetStreamId;
    this.lastSourceOffset = details.lastSourceOffset;
    this.targetStoredOffset = details.targetStoredOffset;
    this.cause = details.cause;
  }
}
```

- [ ] **Step 4: Create the clone types**

Create `packages/core/src/factories/EvDbCloneTypes.ts`:

```ts
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";

/** Projection input. `switch (e.eventType)` narrows `payload`. */
export type EvDbCloneSourceEvent<TEventMap extends Record<string, object>> = {
  [K in keyof TEventMap & string]: {
    readonly eventType: K;
    readonly payload: Readonly<TEventMap[K]>;
    readonly metadata: IEvDbEventMetadata;
  };
}[keyof TEventMap & string];

/** Projection output. The metadata fields are optional overrides. */
export type EvDbCloneEventResult<TEventMap extends Record<string, object>> = {
  [K in keyof TEventMap & string]: {
    eventType: K;
    payload: TEventMap[K];
    /** Default: the source event's `capturedAt`. */
    capturedAt?: Date;
    /** Default: the source event's `capturedBy`. */
    capturedBy?: string;
  };
}[keyof TEventMap & string];

/** Maps a produced message, or returns `undefined` to drop it. */
export type EvDbCloneMessageProjection = (m: EvDbMessage) => EvDbMessage | undefined;

export interface EvDbCloneOptions<TEventMap extends Record<string, object>> {
  /** Last source offset to copy (inclusive). Default: the source head, read once at start. */
  offsetLimit?: number;
  /** Source events read per page. Default 100. */
  pageSize?: number;
  /** Maps a source event to a target event, or `undefined` to drop it. Default: copy as is. */
  projectEvent?: (
    e: EvDbCloneSourceEvent<TEventMap>,
  ) => EvDbCloneEventResult<TEventMap> | undefined;
  /**
   * Maps a produced message, or `undefined` to drop it.
   * Default: drop all messages, and the producer is not called.
   */
  projectMessage?: EvDbCloneMessageProjection;
}
```

- [ ] **Step 5: Add `CloneStream` and `clone()` to the factory**

In `packages/core/src/factories/EvDbStreamFactory.ts`:

Add imports:

```ts
import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";
import type StreamStoreAffected from "@eventualize/types/stream/StreamStoreAffected";
import { fetchPage } from "../store/fetchPage.js";
import EvDbCloneError from "../store/EvDbCloneError.js";
import type {
  EvDbCloneEventResult,
  EvDbCloneMessageProjection,
  EvDbCloneOptions,
  EvDbCloneSourceEvent,
} from "./EvDbCloneTypes.js";
```

Add module-level declarations after `StreamCtorArgs`:

```ts
/** The internal clone stream, as seen by `clone()`. */
interface IEvDbCloneTarget {
  readonly storedOffset: number;
  readonly countOfPendingEvents: number;
  appendCloned(
    eventType: string,
    payload: IEvDbPayloadData,
    capturedAt: Date,
    capturedBy: string,
    projectMessage: EvDbCloneMessageProjection | undefined,
  ): void;
  store(): Promise<StreamStoreAffected>;
}

/**
 * Storage boundary: stored events are untyped (`eventType: string`,
 * `payload: IEvDbPayloadData`). A factory only stores event types from its
 * TEventMap, so presenting them as the typed union is sound for streams
 * written through this factory — the same boundary cast as
 * `StreamFactoryBuilder.withMessages`.
 */
function toCloneSourceEvent<TEventMap extends Record<string, object>>(
  e: EvDbEvent,
): EvDbCloneSourceEvent<TEventMap> {
  return { eventType: e.eventType, payload: e.payload, metadata: e } as unknown as EvDbCloneSourceEvent<TEventMap>;
}

/** Storage boundary: a typed payload object is stored as untyped payload data. */
function toPayloadData<TEventMap extends Record<string, object>>(
  r: EvDbCloneEventResult<TEventMap>,
): IEvDbPayloadData {
  return r.payload as unknown as IEvDbPayloadData;
}
```

(Try `return r.payload;` without the cast first; keep the cast only if TypeScript rejects it.)

Add a field and initialise it in the constructor:

```ts
  private CloneStreamClass: new (...args: StreamCtorArgs) => IEvDbCloneTarget;
```

```ts
    this.CloneStreamClass = classes.clone;
```

In `createDynamicStreamClasses`, after `class ReplayStream`, add:

```ts
    /** Internal stream used by clone: appends copied events with given metadata. */
    class CloneStream extends DynamicStream {
      appendCloned(
        eventType: string,
        payload: IEvDbPayloadData,
        capturedAt: Date,
        capturedBy: string,
        projectMessage: EvDbCloneMessageProjection | undefined,
      ): void {
        const e = this.buildEvent(eventType, payload, capturedAt, capturedBy);
        this._pendingEvents = [...this._pendingEvents, e];
        this.applyToViews(e);
        if (!projectMessage) return;
        const kept = this.produceMessages(e).flatMap((m) => {
          const projected = projectMessage(m);
          return projected === undefined ? [] : [projected];
        });
        this._pendingMessages = [...this._pendingMessages, ...kept];
      }
    }
```

and extend the returned object:

```ts
    return {
      stream: DynamicStream as unknown as typeof this.DynamicStreamClass,
      replay: ReplayStream as unknown as typeof this.ReplayStreamClass,
      clone: CloneStream as unknown as typeof this.CloneStreamClass,
    };
```

Update the JSDoc of `createDynamicStreamClasses` to mention the clone class.

Add `clone` after `goToOffset`:

```ts
  /**
   * Copies a stream, up to `options.offsetLimit` (inclusive), into a new,
   * empty stream of the same type.
   *
   * Events are read in pages and stored after each page. `projectEvent` can
   * change or drop events (default: copy as is, keeping `capturedAt` and
   * `capturedBy`). `projectMessage` can change or drop produced outbox
   * messages (default: drop all, and the producer is not called).
   *
   * @returns The target as a normal writable stream at its head.
   * @throws RangeError for invalid arguments.
   * @throws EvDbCloneError when the target is not empty, or when the copy fails
   *   part-way (pages stored before the failure stay in the target).
   */
  public async clone(
    streamId: string,
    targetStreamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
    options: EvDbCloneOptions<TEventMap> = {},
  ): Promise<StreamWithEventMethods<TEventMap, TViews>> {
    const { offsetLimit, pageSize = 100, projectEvent, projectMessage } = options;

    return withSpan(getCoreTracer(), "eventualize.stream.clone", async (span) => {
      span.setAttribute("eventualize.stream.type", this.config.streamType);
      span.setAttribute("eventualize.stream.id", streamId);
      span.setAttribute("eventualize.clone.target_id", targetStreamId);
      if (offsetLimit !== undefined) {
        span.setAttribute("eventualize.clone.offset_limit", offsetLimit);
      }

      if (streamId === targetStreamId) {
        throw new RangeError(`Cannot clone stream ${streamId} into itself`);
      }
      if (offsetLimit !== undefined && (!Number.isInteger(offsetLimit) || offsetLimit < 0)) {
        throw new RangeError(`offsetLimit must be a non-negative integer, got ${offsetLimit}`);
      }
      if (!Number.isInteger(pageSize) || pageSize < 1) {
        throw new RangeError(`pageSize must be a positive integer, got ${pageSize}`);
      }

      const streamType = this.config.streamType;
      const sourceAddress = new EvDbStreamAddress(streamType, streamId);
      const targetAddress = new EvDbStreamAddress(streamType, targetStreamId);

      const targetLastOffset = await streamStorageAdapter.getLastOffsetAsync(targetAddress);
      if (targetLastOffset !== -1) {
        throw new EvDbCloneError(
          `Clone target ${streamType}/${targetStreamId} is not empty (last offset ${targetLastOffset})`,
          {
            sourceStreamId: streamId,
            targetStreamId,
            lastSourceOffset: -1,
            targetStoredOffset: targetLastOffset,
          },
        );
      }

      const sourceHead = await streamStorageAdapter.getLastOffsetAsync(sourceAddress);
      const limit = offsetLimit === undefined ? sourceHead : Math.min(offsetLimit, sourceHead);

      const views = snapshotStorageAdapter
        ? this.createViews(targetStreamId, snapshotStorageAdapter)
        : [];
      const target = new this.CloneStreamClass(
        streamType,
        views,
        streamStorageAdapter,
        targetStreamId,
        -1,
      );

      let nextOffset = 0;
      let lastSourceOffset = -1;
      try {
        while (nextOffset <= limit) {
          const page = await fetchPage(streamStorageAdapter, sourceAddress, nextOffset, pageSize);
          if (page.length === 0) break;

          let pageLastOffset = lastSourceOffset;
          for (const e of page) {
            if (e.streamCursor.offset > limit) break;
            pageLastOffset = e.streamCursor.offset;

            if (!projectEvent) {
              target.appendCloned(e.eventType, e.payload, e.capturedAt, e.capturedBy, projectMessage);
              continue;
            }
            const projected = projectEvent(toCloneSourceEvent<TEventMap>(e));
            if (projected === undefined) continue;
            target.appendCloned(
              projected.eventType,
              toPayloadData<TEventMap>(projected),
              projected.capturedAt ?? e.capturedAt,
              projected.capturedBy ?? e.capturedBy,
              projectMessage,
            );
          }

          if (target.countOfPendingEvents > 0) await target.store();
          lastSourceOffset = pageLastOffset;
          nextOffset = page[page.length - 1].streamCursor.offset + 1;
        }
      } catch (cause) {
        throw new EvDbCloneError(
          `Clone of ${streamType}/${streamId} into ${targetStreamId} failed after source offset ${lastSourceOffset}`,
          {
            sourceStreamId: streamId,
            targetStreamId,
            lastSourceOffset,
            targetStoredOffset: target.storedOffset,
            cause,
          },
        );
      }

      return this.get(targetStreamId, streamStorageAdapter, snapshotStorageAdapter);
    });
  }
```

Notes:
- `this.createViews(streamId, snapshotAdapter)` already exists (private) and creates empty views (`create()` semantics) — it never reads source snapshots.
- Validation runs inside the span on purpose (same as `goToOffset`).

- [ ] **Step 6: Add `clone` to `IEvDbStreamFactory`**

In `packages/core/src/factories/IEvDbStreamFactory.ts` add:

```ts
import type { EvDbCloneOptions } from "./EvDbCloneTypes.js";
```

```ts
  clone(
    streamId: string,
    targetStreamId: string,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
    options?: EvDbCloneOptions<TEventMap>,
  ): Promise<StreamWithEventMethods<TEventMap, TViews>>;
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --import tsx --test packages/core/src/**/*.test.ts`
Expected: PASS (all core tests, including 29 new clone tests).

Run the test typecheck from Global Constraints. Expected: no errors in the new files; the `@ts-expect-error` line is used.

- [ ] **Step 8: Build, lint, prettier** (expect `0` / `0`).

- [ ] **Step 9: Do not commit.**

---

### Task 3: Integration tests on real databases, docs, changeset

**Files:**
- Modify: `apps/sample-app/src/tests/integration.test.ts`
- Modify: `packages/README.md`
- Create: `.changeset/stream-clone.md`

**Interfaces:**
- Consumes: `PointsStreamFactory.clone(...)`, `EvDbCloneError` (`@eventualize/core/store/EvDbCloneError`) from Task 2; the `"pointsPaging"` stream created by the existing sub-test "Paging: stream with two stored batches" (offsets 1..22; `PointsMultiplied` at offsets 5 and 16).

Expected values for `offsetLimit: 15` with `PointsMultiplied` dropped: 14 events (source offsets 1..15 except 5), target offsets 0..13, `Sum` = 210, `Count` = 14.

- [ ] **Step 1: Write the integration tests**

In `apps/sample-app/src/tests/integration.test.ts`, add the import:

```ts
import EvDbCloneError from "@eventualize/core/store/EvDbCloneError";
```

Add these sub-tests directly after the existing `"Replay: offset 0 does not exist for create()-based streams"` sub-test (inside the same per-database callback):

```ts
        await t.test("Clone: offsetLimit 15, dropping PointsMultiplied", async () => {
          const target = await PointsStreamFactory.clone(
            "pointsPaging",
            "pointsPagingClone",
            testData.storageAdapter!,
            testData.storageAdapter!,
            {
              offsetLimit: 15,
              projectEvent: (e) => (e.eventType === "PointsMultiplied" ? undefined : e),
            },
          );
          assert.strictEqual(target.views.Sum.sum, 210);
          assert.strictEqual(target.views.Count.count, 14);

          const source: EvDbEvent[] = [];
          for await (const e of testData.storageAdapter!.getEventsAsync(
            new EvDbStreamCursor("PointsStream", "pointsPaging", 0),
          )) {
            if (e.streamCursor.offset <= 15 && e.eventType !== "PointsMultiplied") source.push(e);
          }
          const cloned: EvDbEvent[] = [];
          for await (const e of testData.storageAdapter!.getEventsAsync(
            new EvDbStreamCursor("PointsStream", "pointsPagingClone", 0),
          )) {
            cloned.push(e);
          }
          assert.deepStrictEqual(
            cloned.map((e) => e.streamCursor.offset),
            Array.from({ length: 14 }, (_, i) => i),
          );
          assert.deepStrictEqual(
            cloned.map((e) => e.eventType),
            source.map((e) => e.eventType),
          );
          assert.deepStrictEqual(
            cloned.map((e) => e.capturedAt.getTime()),
            source.map((e) => e.capturedAt.getTime()),
          );
        });

        await t.test("Clone: a non-empty target throws EvDbCloneError", async () => {
          await assert.rejects(
            PointsStreamFactory.clone(
              "pointsPaging",
              "pointsPagingClone",
              testData.storageAdapter!,
              testData.storageAdapter!,
            ),
            EvDbCloneError,
          );
        });
```

(`EvDbEvent` and `EvDbStreamCursor` are already imported in this file; check and add `import type EvDbEvent ...` / `EvDbStreamCursor` only if missing.)

- [ ] **Step 2: Run the integration tests**

Run `pnpm build`, then the integration file per Global Constraints.
Expected: all sub-tests pass on Postgres, MySQL and DynamoDB (previous 45 pass / 1 skip, plus 2 new per DB).

- [ ] **Step 3: Document the API**

In `packages/README.md`, add after the "Replay: inspect a stream at a past offset" section:

````markdown
## Replay: clone a stream

`clone` copies a stream, up to an offset, into a new **empty** stream of the
same type. Use it to fix or redact data, to make a sandbox copy, or to migrate
old event shapes.

```ts
const copy = await PointsStreamFactory.clone("points-1", "points-1-copy", storageAdapter, snapshotAdapter, {
  offsetLimit: 15, // optional, inclusive; default: the source head
  projectEvent: (e) => (e.eventType === "PointsMultiplied" ? undefined : e), // change or drop events
  projectMessage: (m) => m.withChannel(`sandbox.${m.channel}`), // optional; default: no messages
});
```

- Copied events keep their `capturedAt` and `capturedBy` unless `projectEvent` overrides them.
- By default the clone writes no outbox messages (the producer is not called).
- The target must be empty. A failure throws `EvDbCloneError` with `lastSourceOffset`
  and `targetStoredOffset`; pages stored before the failure stay in the target.
````

- [ ] **Step 4: Add the changeset**

Create `.changeset/stream-clone.md`:

```markdown
---
"@eventualize/types": minor
"@eventualize/core": minor
---

Stream replay, part 2: `factory.clone(...)`.

- New `factory.clone(streamId, targetStreamId, streamAdapter, snapshotAdapter?, options?)` copies a stream (up to `offsetLimit`) into a new, empty stream of the same type. `projectEvent` can change or drop events and override `capturedAt`/`capturedBy`; `projectMessage` can change or drop produced outbox messages. By default events are copied as is and no messages are produced.
- New `EvDbCloneError` reports how far a failed clone got.
- New `EvDbMessage.withChannel(channel)`.
- `IEvDbStreamFactory` gains a required `clone` member. This affects custom implementations of the interface.
```

- [ ] **Step 5: Full verification**

- `pnpm build 2>&1 | grep "error TS" | wc -l` → `0`
- `pnpm exec eslint . 2>&1 | grep -c " error "` → `0`
- `node --import tsx --test packages/core/src/**/*.test.ts` → all pass
- integration file → all pass (Step 2)
- prettier clean on every touched `.ts` file

- [ ] **Step 6: Do not commit.**
