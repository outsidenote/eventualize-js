# Stream Replay Part 1 (`goToOffset` + read-only stream) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `factory.goToOffset(...)` that returns a read-only stream positioned on a past event, with `forward(steps)` navigation, `views`, recomputed `messages` and `isHead`.

**Architecture:** Fix paging in the stream adapters and let `getSnapshotAsync` take a `maxOffset`. Split `EvDbStream.appendEvent` so a stored event can be applied to views without creating a new event. The factory builds a hidden replay subclass of its dynamic stream and wraps it in `EvDbReadOnlyStream`, which pages events through `getEventsAsync` and keeps a one-event lookahead.

**Tech Stack:** TypeScript 6 (NodeNext ESM), pnpm workspace, `node:test` via `tsx`, Prisma (Postgres/MySQL), AWS SDK v3 DynamoDB, testcontainers, OpenTelemetry API.

**Spec:** `docs/superpowers/specs/2026-10-12-stream-replay-goto-offset-design.md` (ADR: `docs/adr/0001-replay-forward-only-navigation.md`)

## Global Constraints

- Package manager: `pnpm` only. Never `npm`/`yarn`.
- Do **not** run `git commit`. The repository owner reviews and commits. Leave changes in the working tree.
- After every task: `pnpm build 2>&1 | grep "error TS" | wc -l` must print `0`, and `pnpm exec eslint . 2>&1 | grep -c " error "` must print `0` (baseline is 0/0).
- Type safety: no `any`, no new `unknown` escape hatches, no `!` non-null assertions. The existing `as unknown as` cast idiom for the dynamic stream class constructor is allowed only where the plan shows it.
- Imports: use `import type` for type-only imports (`@typescript-eslint/consistent-type-imports` is an error). Relative imports in `packages/*/src` end with `.js`.
- Prettier: double quotes, semicolons, trailing commas, `printWidth` 100.
- Do not change existing tests' expectations.
- Unit test command for core: `node --import tsx --test packages/core/src/**/*.test.ts` (run from repo root).
- Integration tests need Docker. Before treating an integration failure as a code bug, check for environment problems: Docker daemon down, other heavy `node --test` processes from other repos hogging CPU (`ps aux | grep "node --test"`), port conflicts.

## Review Focus

1. **Snapshot exactly at the target offset** — every view already holds offset N; the stream must still fetch event N so `event` and `messages` are set, and views must not apply N twice. (Task 4 test: "all views have a snapshot at the target offset".)
2. **Adapter that ignores `maxOffset`** — a third-party adapter returns its newest snapshot (> N). Views must still equal a full fold of `0..N`. (Task 4 test: "ignores a snapshot newer than the target".)
3. **Target offset in a gap / before the first event** — streams created with `factory.create()` start at offset 1, so `goToOffset(0)` must throw `RangeError`, not position on offset 1. (Task 4 test: "throws when the offset is not in the stream".)
4. **`forward()` after new events are stored** — a stream at the head must pick up later events instead of staying stuck. (Task 3 test: "forward at the head picks up events stored later".)
5. **Page boundary exactly at the target** — with `pageSize = 2` and target on the last event of a page, `isHead` must be `false` when more events exist. (Task 3 test: "isHead is false when the target is the last event of a page".)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/types/src/adapters/IEvDbStorageStreamAdapter.ts` | Modify | add optional `pageSize` to `getEventsAsync` |
| `packages/types/src/adapters/IEvDbStorageSnapshotAdapter.ts` | Modify | add optional `maxOffset` to `getSnapshotAsync` |
| `packages/types/src/store/IEvDbReadOnlyStream.ts` | Create | public read-only stream interface |
| `packages/adapters/relational-storage-adapter/src/EvDbRelationalStorageAdapterQueries.ts` | Modify | `orderBy`, `take`, snapshot `lte` |
| `packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts` | Modify | paging loop fix, pass `pageSize` / `maxOffset` |
| `packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapterQueries.ts` | Modify | snapshot key condition `<= :max` |
| `packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapter.ts` | Modify | pass `LastEvaluatedKey` + `pageSize`, pass `maxOffset` |
| `packages/core/src/store/EvDbStream.ts` | Modify | split `appendEvent` → `applyEvent` |
| `packages/core/src/store/EvDbReadOnlyStream.ts` | Create | paging, lookahead, `forward()` |
| `packages/core/src/store/EvDbEmptySnapshotAdapter.ts` | Create | no-op snapshot adapter for replay without snapshots |
| `packages/core/src/factories/EvDbViewFactory.ts` | Modify | `get(streamId, adapter, maxOffset?)` with guard |
| `packages/core/src/factories/EvDbStreamFactory.ts` | Modify | replay stream class, `goToOffset` |
| `packages/core/src/factories/IEvDbStreamFactory.ts` | Modify | add `goToOffset` |
| `packages/core/src/store/InMemoryStorageAdapter.test-support.ts` | Create | in-memory adapter for core unit tests |
| `packages/core/tsconfig.json`, `packages/core/tsconfig.test.json` | Modify | exclude/include `*.test-support.ts` |
| `packages/core/src/store/EvDbStream.applyEvent.test.ts` | Create | Task 2 tests |
| `packages/core/src/store/EvDbReadOnlyStream.test.ts` | Create | Task 3 tests |
| `packages/core/src/factories/EvDbStreamFactory.goToOffset.test.ts` | Create | Task 4 tests |
| `apps/sample-app/src/tests/integration.test.ts` | Modify | Task 1 + Task 5 integration tests |
| `packages/README.md` | Modify | usage docs |

---

### Task 1: Adapter paging fixes, `pageSize` and `maxOffset`

**Files:**
- Modify: `packages/types/src/adapters/IEvDbStorageStreamAdapter.ts`
- Modify: `packages/types/src/adapters/IEvDbStorageSnapshotAdapter.ts`
- Modify: `packages/adapters/relational-storage-adapter/src/EvDbRelationalStorageAdapterQueries.ts`
- Modify: `packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts`
- Modify: `packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapterQueries.ts`
- Modify: `packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapter.ts`
- Test: `apps/sample-app/src/tests/integration.test.ts`

**Interfaces:**
- Produces:
  - `IEvDbStorageStreamAdapter.getEventsAsync(streamCursor: EvDbStreamCursor, pageSize?: number): AsyncGenerator<EvDbEvent, void, undefined>` — yields events with `offset >= streamCursor.offset` in ascending offset order, each exactly once, fetching `pageSize` (default 100) rows per query.
  - `IEvDbStorageSnapshotAdapter.getSnapshotAsync(viewAddress: EvDbViewAddress, maxOffset?: number): Promise<EvDbStoredSnapshotResultRaw>` — latest snapshot with `offset <= maxOffset`; `EvDbStoredSnapshotResultRaw.Empty` (offset `-1`) if none.

- [ ] **Step 1: Write the failing integration tests**

In `apps/sample-app/src/tests/integration.test.ts`, add imports at the top (next to the other imports):

```ts
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
```

Then, inside the per-database `test(\`${storeType} execution\`, ...)` callback, add these sub-tests **after** the `"AND: trace context is stored and fetched with events"` test and **before** `t.after(...)`:

```ts
        await t.test("Paging: stream with two stored batches", async () => {
          // Batch 1 → offsets 1..11 (create() starts at offset 1), snapshots at 11.
          const first = Steps.createPointsStream("pointsPaging", testData.storageAdapter!);
          Steps.addPointsEventsToStream(first);
          await first.store();
          // Batch 2 → offsets 12..22, snapshots at 22.
          const second = await PointsStreamFactory.get(
            "pointsPaging",
            testData.storageAdapter!,
            testData.storageAdapter!,
          );
          Steps.addPointsEventsToStream(second);
          await second.store();
          assert.strictEqual(second.storedOffset, 22);
        });

        await t.test("Paging: getEventsAsync with small pageSize yields each event once", async () => {
          const cursor = new EvDbStreamCursor("PointsStream", "pointsPaging", 0);
          const offsets: number[] = [];
          for await (const event of testData.storageAdapter!.getEventsAsync(cursor, 3)) {
            offsets.push(event.streamCursor.offset);
          }
          assert.deepStrictEqual(
            offsets,
            Array.from({ length: 22 }, (_, i) => i + 1),
          );
        });

        await t.test("Paging: getEventsAsync starts at the cursor offset", async () => {
          const cursor = new EvDbStreamCursor("PointsStream", "pointsPaging", 20);
          const offsets: number[] = [];
          for await (const event of testData.storageAdapter!.getEventsAsync(cursor, 3)) {
            offsets.push(event.streamCursor.offset);
          }
          assert.deepStrictEqual(offsets, [20, 21, 22]);
        });

        await t.test("Snapshots: getSnapshotAsync honours maxOffset", async () => {
          const viewAddress = new EvDbViewAddress(
            new EvDbStreamAddress("PointsStream", "pointsPaging"),
            "Sum",
          );
          const latest = await testData.storageAdapter!.getSnapshotAsync(viewAddress);
          assert.strictEqual(latest.offset, 22);

          const atOrBefore15 = await testData.storageAdapter!.getSnapshotAsync(viewAddress, 15);
          assert.strictEqual(atOrBefore15.offset, 11);
          assert.deepStrictEqual(atOrBefore15.state, { sum: 210 });

          const exact = await testData.storageAdapter!.getSnapshotAsync(viewAddress, 11);
          assert.strictEqual(exact.offset, 11);

          const none = await testData.storageAdapter!.getSnapshotAsync(viewAddress, 5);
          assert.strictEqual(none.offset, -1);
        });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm build` — expected: TS errors, because `getEventsAsync` takes 1 argument and `getSnapshotAsync` takes 1 argument on the interfaces. (Fix comes in Step 3; do not commit.)

- [ ] **Step 3: Update the adapter interfaces**

`packages/types/src/adapters/IEvDbStorageStreamAdapter.ts` — replace the `getEventsAsync` declaration and its JSDoc:

```ts
  /**
   * Gets stored events, in ascending offset order, starting at
   * `streamCursor.offset` (inclusive). Each event is yielded exactly once.
   * @param streamCursor - The stream address and the first offset to read.
   * @param pageSize - Rows fetched per storage query (default 100).
   * @returns Async iterable of EvDbEvent
   */
  getEventsAsync(
    streamCursor: EvDbStreamCursor,
    pageSize?: number,
  ): AsyncGenerator<EvDbEvent, void, undefined>;
```

`packages/types/src/adapters/IEvDbStorageSnapshotAdapter.ts` — replace the `getSnapshotAsync` declaration and its JSDoc:

```ts
  /**
   * Gets the latest stored view snapshot or an empty snapshot if none exists.
   * @param viewAddress The view address
   * @param maxOffset Optional upper bound: return the latest snapshot whose
   *                  offset is `<= maxOffset`.
   * @returns The stored snapshot result
   */
  getSnapshotAsync(
    viewAddress: EvDbViewAddress,
    maxOffset?: number,
  ): Promise<EvDbStoredSnapshotResultRaw>;
```

- [ ] **Step 4: Fix the relational queries**

`packages/adapters/relational-storage-adapter/src/EvDbRelationalStorageAdapterQueries.ts`:

In `getEvents`, add ordering and the page limit (replace the `take: pageSize,` line area so the `findMany` arguments end like this):

```ts
      orderBy: { offset: "asc" },
      take: pageSize,
    });
```

(`take: pageSize` already exists; add the `orderBy` line just above it.)

Replace `getSnapshot` with:

```ts
  async getSnapshot(streamType: string, streamId: string, viewName: string, maxOffset?: number) {
    return this.prisma.snapshot.findFirst({
      where: {
        stream_type: streamType,
        stream_id: streamId,
        view_name: viewName,
        ...(maxOffset === undefined ? {} : { offset: { lte: maxOffset } }),
      },
      select: {
        state: true,
        stored_at: true,
        offset: true,
      },
      orderBy: {
        offset: "desc",
      },
    });
  }
```

- [ ] **Step 5: Fix the relational adapter**

`packages/adapters/relational-storage-adapter/src/EvDbPrismaStorageAdapter.ts`:

Replace the signature and the `while (true)` loop of `getEventsAsync` with:

```ts
  async *getEventsAsync(
    streamCursor: EvDbStreamCursor,
    pageSize: number = 100,
  ): AsyncGenerator<EvDbEvent, void, undefined> {
```

```ts
      const { streamType, streamId } = streamCursor;
      let nextOffset = streamCursor.offset;
      while (true) {
        const events = await this.queryProvider.getEvents(
          streamType,
          streamId,
          nextOffset,
          pageSize,
        );

        if (events.length === 0) {
          break;
        }

        for (const event of events) {
          yield new EvDbEvent(
            event.event_type,
            new EvDbStreamCursor(event.stream_type, event.stream_id, Number(event.offset)),
            { eventType: event.event_type, payload: deserializePayload(event.payload) },
            event.captured_at,
            event.captured_by,
            event.stored_at,
            event.traceparent ?? undefined,
            event.tracestate ?? undefined,
          );
          nextOffset = Number(event.offset) + 1;
        }

        if (events.length < pageSize) {
          break;
        }
      }
```

Replace `getSnapshotAsync` with:

```ts
  async getSnapshotAsync(
    viewAddress: EvDbViewAddress,
    maxOffset?: number,
  ): Promise<EvDbStoredSnapshotResultRaw> {
    const { streamType, streamId, viewName } = viewAddress;
    const snapshot = await this.queryProvider.getSnapshot(
      streamType,
      streamId,
      viewName,
      maxOffset,
    );

    if (!snapshot) return EvDbStoredSnapshotResultRaw.Empty;

    return new EvDbStoredSnapshotResultRaw(
      Number(snapshot.offset),
      snapshot.stored_at,
      snapshot.state,
    );
  }
```

- [ ] **Step 6: Fix the DynamoDB query provider**

`packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapterQueries.ts` — replace `getSnapshot` with:

```ts
  public static getSnapshot(viewAddress: EvDbViewAddress, maxOffset?: number) {
    const hasMax = maxOffset !== undefined;
    const queryParams = {
      TableName: "snapshots",
      KeyConditionExpression: hasMax ? "view_address = :sa AND #o <= :max" : "view_address = :sa",

      ExpressionAttributeValues: {
        ":sa": { S: serializeViewAddress(viewAddress) },
        ...(hasMax ? { ":max": { N: maxOffset.toString() } } : {}),
      },
      ProjectionExpression: "#o, #s, stored_at",
      ExpressionAttributeNames: {
        "#o": "offset",
        "#s": "state",
      },
      ScanIndexForward: false, // false = descending order
      Limit: 1,
    };

    return new QueryCommand(queryParams);
  }
```

(If TypeScript does not narrow `maxOffset` inside the spread, use `...(maxOffset !== undefined ? { ":max": { N: maxOffset.toString() } } : {})` directly.)

- [ ] **Step 7: Fix the DynamoDB adapter**

`packages/adapters/dynamodb-storage-adapter/src/EvDbDynamoDbStorageAdapter.ts`:

Rename the `_pageSize` parameter to `pageSize` and pass both the page size and the continuation key:

```ts
  async *getEventsAsync(
    streamCursor: EvDbStreamCursor,
    pageSize: number = 100,
  ): AsyncGenerator<EvDbEvent, void, undefined> {
```

```ts
      do {
        const getEventsCommand = QueryProvider.getEvents(streamCursor, queryCursor, pageSize);
        const response = await this.dynamoDbClient.send(getEventsCommand);
```

(The rest of the loop body is unchanged; it already sets `queryCursor = response.LastEvaluatedKey`.)

Replace `getSnapshotAsync`'s signature and first line:

```ts
  async getSnapshotAsync(
    viewAddress: EvDbViewAddress,
    maxOffset?: number,
  ): Promise<EvDbStoredSnapshotResultRaw> {
    const query = QueryProvider.getSnapshot(viewAddress, maxOffset);
```

- [ ] **Step 8: Build and lint**

Run: `pnpm build 2>&1 | grep "error TS" | wc -l` → expected `0`.
Run: `pnpm exec eslint . 2>&1 | grep -c " error "` → expected `0`.
Run: `pnpm exec prettier --check "packages/**/*.ts" "apps/**/*.ts" 2>&1 | tail -5` → fix any files you touched with `pnpm exec prettier --write <file>`.

- [ ] **Step 9: Run the integration tests**

Run: `TEST_CONTAINER=true dotenv -e .env.test -- node --import tsx --test apps/sample-app/src/tests/integration.test.ts`
(If `dotenv` is not on PATH, use `pnpm exec dotenv -e .env.test -- ...`.)
Expected: all sub-tests pass for Postgres, MySQL and DynamoDB, including the four new ones.

- [ ] **Step 10: Do not commit.** Leave changes in the working tree.

---

### Task 2: Split `EvDbStream.appendEvent` into `applyEvent`

**Files:**
- Create: `packages/core/src/store/InMemoryStorageAdapter.test-support.ts`
- Modify: `packages/core/tsconfig.json`, `packages/core/tsconfig.test.json`
- Modify: `packages/core/src/store/EvDbStream.ts`
- Test: `packages/core/src/store/EvDbStream.applyEvent.test.ts`

**Interfaces:**
- Consumes: Task 1's `getEventsAsync(cursor, pageSize?)` and `getSnapshotAsync(viewAddress, maxOffset?)` signatures (the in-memory adapter implements them).
- Produces:
  - `EvDbStream.applyEvent(e: EvDbEvent): ReadonlyArray<EvDbMessage>` — `protected`. Applies `e` to every view, runs `messagesProducer`, stamps messages with `e.traceparent`/`e.tracestate`, returns the messages. Does **not** touch `_pendingEvents` / `_pendingMessages`.
  - `InMemoryStorageAdapter` (test-only, default export) with public helpers `seedEvents(events: EvDbEvent[])`, `seedSnapshot(viewAddress: EvDbViewAddress, offset: number, state: object)`, counter `getEventsCalls: number`, recorder `storedMessages: EvDbMessage[]`, and a constructor option `{ ignoreMaxOffset?: boolean }`.

- [ ] **Step 1: Make `*.test-support.ts` files test-only**

`packages/core/tsconfig.json` — change the `exclude` line to:

```json
  "exclude": ["src/**/*.test.ts", "src/**/*.test-support.ts"]
```

`packages/core/tsconfig.test.json` — change the `include` line to:

```json
  "include": ["src/**/*.test.ts", "src/**/*.test-support.ts"],
```

- [ ] **Step 2: Create the in-memory adapter**

Create `packages/core/src/store/InMemoryStorageAdapter.test-support.ts`:

```ts
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import StreamStoreAffected from "@eventualize/types/stream/StreamStoreAffected";
import type EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import { EvDbStoredSnapshotResultRaw } from "@eventualize/types/snapshots/EvDbStoredSnapshotResultRaw";
import type { EvDbStoredSnapshotData } from "@eventualize/types/snapshots/EvDbStoredSnapshotData";
import type { IEvDbStorageAdapter } from "../adapters/IEvDbStorageAdapter.js";

interface StoredSnapshot {
  readonly offset: number;
  readonly state: object;
}

const streamKey = (a: EvDbStreamAddress): string => `${a.streamType}/${a.streamId}`;
const viewKey = (a: EvDbViewAddress): string => `${a.streamType}/${a.streamId}/${a.viewName}`;

/**
 * In-memory stream + snapshot adapter for core unit tests.
 * Not part of the published package (excluded from the build).
 */
export default class InMemoryStorageAdapter implements IEvDbStorageAdapter {
  private readonly events = new Map<string, EvDbEvent[]>();
  private readonly snapshots = new Map<string, StoredSnapshot[]>();
  public getEventsCalls = 0;
  public storedMessages: EvDbMessage[] = [];

  constructor(private readonly options: { ignoreMaxOffset?: boolean } = {}) {}

  seedEvents(events: ReadonlyArray<EvDbEvent>): void {
    for (const e of events) {
      const key = streamKey(e.streamCursor);
      const list = this.events.get(key) ?? [];
      list.push(e);
      list.sort((a, b) => a.streamCursor.offset - b.streamCursor.offset);
      this.events.set(key, list);
    }
  }

  seedSnapshot(viewAddress: EvDbViewAddress, offset: number, state: object): void {
    const key = viewKey(viewAddress);
    const list = this.snapshots.get(key) ?? [];
    list.push({ offset, state });
    list.sort((a, b) => a.offset - b.offset);
    this.snapshots.set(key, list);
  }

  async *getEventsAsync(
    streamCursor: EvDbStreamCursor,
    pageSize: number = 100,
  ): AsyncGenerator<EvDbEvent, void, undefined> {
    this.getEventsCalls++;
    const all = this.events.get(streamKey(streamCursor)) ?? [];
    let next = streamCursor.offset;
    while (true) {
      const page = all.filter((e) => e.streamCursor.offset >= next).slice(0, pageSize);
      if (page.length === 0) return;
      for (const e of page) {
        yield e;
        next = e.streamCursor.offset + 1;
      }
      if (page.length < pageSize) return;
    }
  }

  async getLastOffsetAsync(address: EvDbStreamAddress): Promise<number> {
    const all = this.events.get(streamKey(address)) ?? [];
    return all.length === 0 ? -1 : all[all.length - 1].streamCursor.offset;
  }

  async storeStreamAsync(
    events: ReadonlyArray<EvDbEvent>,
    messages: ReadonlyArray<EvDbMessage>,
  ): Promise<StreamStoreAffected> {
    const stored = events.map(
      (e) =>
        new EvDbEvent(
          e.eventType,
          new EvDbStreamCursor(e.streamCursor, e.streamCursor.offset),
          e.payload,
          e.capturedAt,
          e.capturedBy,
          new Date(),
          e.traceparent,
          e.tracestate,
        ),
    );
    this.seedEvents(stored);
    this.storedMessages = [...this.storedMessages, ...messages];
    return new StreamStoreAffected(events.length, undefined);
  }

  async getSnapshotAsync(
    viewAddress: EvDbViewAddress,
    maxOffset?: number,
  ): Promise<EvDbStoredSnapshotResultRaw> {
    const list = this.snapshots.get(viewKey(viewAddress)) ?? [];
    const bound = this.options.ignoreMaxOffset ? undefined : maxOffset;
    const candidates = bound === undefined ? list : list.filter((s) => s.offset <= bound);
    const latest = candidates[candidates.length - 1];
    if (!latest) return EvDbStoredSnapshotResultRaw.Empty;
    return new EvDbStoredSnapshotResultRaw(latest.offset, new Date(), latest.state);
  }

  async storeSnapshotAsync(data: EvDbStoredSnapshotData): Promise<void> {
    const key = `${data.streamType}/${data.streamId}/${data.viewName}`;
    const list = this.snapshots.get(key) ?? [];
    list.push({ offset: data.offset, state: data.state as object });
    list.sort((a, b) => a.offset - b.offset);
    this.snapshots.set(key, list);
  }

  async close(): Promise<void> {}
}
```

Before writing, open these files and adapt the code if a name differs:
- `packages/types/src/stream/StreamStoreAffected.ts` (constructor arguments; `otel_flow.test.ts` uses `new StreamStoreAffected(events.length, undefined)`).
- `packages/types/src/snapshots/EvDbStoredSnapshotData.ts` (field names `streamType`, `streamId`, `viewName`, `offset`, `state`).
- `packages/types/src/stream/IEvDbChangeStream.ts` — `IEvDbStorageStreamAdapter` extends it. If it declares outbox methods (`getFromOutboxAsync`, `getRecordsFromOutboxAsync`, `subscribeToMessageAsync`, …), add each one to the class with the exact declared signature and a body `throw new Error("Method not implemented.");` (copy the signatures from `apps/sample-app/src/tests/StorageAdapterStub.ts`).
- If `data.state as object` is rejected because `state` is already typed, drop the cast; if `state` is `unknown`, keep a typed guard instead: `typeof data.state === "object" && data.state !== null ? data.state : {}`.

- [ ] **Step 3: Write the failing test**

Create `packages/core/src/store/EvDbStream.applyEvent.test.ts`:

```ts
import { test, describe } from "node:test";
import * as assert from "node:assert";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import type IEvDbEventMetadata from "@eventualize/types/events/IEvDbEventMetadata";
import type { IEvDbPayloadData } from "@eventualize/types/events/IEvDbPayloadData";
import EvDbStream from "./EvDbStream.js";
import { createViewFactory } from "../factories/EvDbViewFactory.js";
import InMemoryStorageAdapter from "./InMemoryStorageAdapter.test-support.js";
import type { EvDbView } from "../view/EvDbView.js";

type Events = { Added: { points: number } };
type SumState = {
  sum: number;
  lastCapturedAt: number;
};

const sumView = createViewFactory<SumState, Events>({
  viewName: "Sum",
  streamType: "S",
  defaultState: { sum: 0, lastCapturedAt: 0 },
  handlers: {
    Added: (s, e, m) => ({ sum: s.sum + e.points, lastCapturedAt: m.capturedAt.getTime() }),
  },
});

const producer = (event: EvDbEvent): EvDbMessage[] => [
  EvDbMessage.createFromMetadata(event, "Added Notification", { n: 1 }),
];

class TestStream extends EvDbStream {
  constructor(adapter: InMemoryStorageAdapter) {
    const views: EvDbView<unknown>[] = [sumView.create("s-1", adapter) as EvDbView<unknown>];
    super("S", views, adapter, "s-1", -1, producer);
  }
  replay(e: EvDbEvent): ReadonlyArray<EvDbMessage> {
    return this.applyEvent(e);
  }
  add(points: number): IEvDbEventMetadata {
    const payload: IEvDbPayloadData = { points };
    return this.appendEvent("Added", payload);
  }
  get sum(): number {
    return (this.getViews()["Sum"] as EvDbView<SumState>).state.sum;
  }
  get lastCapturedAt(): number {
    return (this.getViews()["Sum"] as EvDbView<SumState>).state.lastCapturedAt;
  }
}

const storedEvent = (offset: number, points: number, capturedAt: Date): EvDbEvent =>
  new EvDbEvent(
    "Added",
    new EvDbStreamCursor("S", "s-1", offset),
    { points },
    capturedAt,
    "original-writer",
    new Date(),
    "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
    "",
  );

describe("EvDbStream.applyEvent", () => {
  test("applies a stored event to views using its original metadata", () => {
    const stream = new TestStream(new InMemoryStorageAdapter());
    const capturedAt = new Date("2020-01-01T00:00:00Z");
    stream.replay(storedEvent(0, 5, capturedAt));
    assert.strictEqual(stream.sum, 5);
    assert.strictEqual(stream.lastCapturedAt, capturedAt.getTime());
  });

  test("returns produced messages stamped with the event trace context", () => {
    const stream = new TestStream(new InMemoryStorageAdapter());
    const messages = stream.replay(storedEvent(0, 5, new Date()));
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].messageType, "Added Notification");
    assert.strictEqual(
      messages[0].traceparent,
      "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
    );
  });

  test("does not add to pending events or pending messages", () => {
    const stream = new TestStream(new InMemoryStorageAdapter());
    stream.replay(storedEvent(0, 5, new Date()));
    assert.strictEqual(stream.countOfPendingEvents, 0);
    assert.strictEqual(stream.getMessages().length, 0);
  });

  test("appendEvent behaviour is unchanged", () => {
    const stream = new TestStream(new InMemoryStorageAdapter());
    const meta = stream.add(7);
    assert.strictEqual(meta.streamCursor.offset, 0);
    assert.strictEqual(stream.sum, 7);
    assert.strictEqual(stream.countOfPendingEvents, 1);
    assert.strictEqual(stream.getMessages().length, 1);
  });
});
```

Notes for the implementer:
- `EvDbMessage.createFromMetadata(metadata: IEvDbEventMetadata, messageType: string, payload: IEvDbPayloadData, ...)`; an `EvDbEvent` is a valid `IEvDbEventMetadata`.
- `IEvDbPayloadData` is `{ readonly [key: string]: unknown }`. The payload is the raw event object (`{ points }`), exactly what the dynamic `appendEvent<Name>` methods pass.

- [ ] **Step 4: Run the test to verify it fails**

Run: `node --import tsx --test packages/core/src/store/EvDbStream.applyEvent.test.ts`
Expected: FAIL — `this.applyEvent is not a function` (or a TS error from tsx).

- [ ] **Step 5: Split `appendEvent`**

In `packages/core/src/store/EvDbStream.ts`, replace the body of the `try` block in `appendEvent` with:

```ts
      const cursor = this.getNextCursor(this._pendingEvents);
      const { traceparent, tracestate } = this.captureTraceparent();
      const e = new EvDbEvent(
        eventType,
        cursor,
        payload,
        new Date(),
        capturedBy,
        undefined,
        traceparent,
        tracestate,
      );
      this._pendingEvents = [...this._pendingEvents, e];
      const producedMessages = this.applyEvent(e);
      this._pendingMessages = [...this._pendingMessages, ...producedMessages];

      return e;
```

Add this method directly after `appendEvent`:

```ts
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
    for (const view of Object.values(this._views)) {
      view.applyEvent(e);
    }

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

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --import tsx --test packages/core/src/**/*.test.ts`
Expected: PASS (new tests plus the existing `EvDbStream.test.ts`, `otel.test.ts`, `otel_flow.test.ts`).

- [ ] **Step 7: Build and lint** (same commands as Task 1 Step 8; expect `0` / `0`).

- [ ] **Step 8: Do not commit.**

---

### Task 3: `IEvDbReadOnlyStream` and `EvDbReadOnlyStream`

**Files:**
- Create: `packages/types/src/store/IEvDbReadOnlyStream.ts`
- Create: `packages/core/src/store/EvDbReadOnlyStream.ts`
- Test: `packages/core/src/store/EvDbReadOnlyStream.test.ts`

**Interfaces:**
- Consumes: `IEvDbStorageStreamAdapter.getEventsAsync(cursor, pageSize?)` (Task 1); `InMemoryStorageAdapter` (Task 2).
- Produces:
  - `IEvDbReadOnlyStream<TViews>` (default export of `@eventualize/types/store/IEvDbReadOnlyStream`):
    `readonly event: EvDbEvent; readonly views: Readonly<TViews>; readonly messages: ReadonlyArray<EvDbMessage>; readonly isHead: boolean; forward(steps?: number): Promise<IEvDbReadOnlyStream<TViews>>;`
  - `IEvDbReplayTarget<TViews>` (named export of `packages/core/src/store/EvDbReadOnlyStream.ts`):
    `readonly views: Readonly<TViews>; replayEvent(e: EvDbEvent): ReadonlyArray<EvDbMessage>;`
  - `EvDbReadOnlyStream.open<TViews>(options: EvDbReadOnlyStreamOpenOptions<TViews>): Promise<EvDbReadOnlyStream<TViews>>` where
    `EvDbReadOnlyStreamOpenOptions<TViews> = { target: IEvDbReplayTarget<TViews>; streamStorageAdapter: IEvDbStorageStreamAdapter; streamAddress: EvDbStreamAddress; fromOffset: number; offset: number; pageSize: number; }`

- [ ] **Step 1: Create the public interface**

Create `packages/types/src/store/IEvDbReadOnlyStream.ts`:

```ts
import type EvDbEvent from "../events/EvDbEvent.js";
import type EvDbMessage from "../messages/EvDbMessage.js";

/**
 * A stream positioned on a stored event, for inspection only.
 *
 * Returned by `factory.goToOffset(...)`. It cannot append events or store.
 * Navigation is forward-only (see docs/adr/0001-replay-forward-only-navigation.md).
 */
export default interface IEvDbReadOnlyStream<TViews> {
  /** The event the stream is positioned on. `event.streamCursor` holds the address and offset. */
  readonly event: EvDbEvent;

  /** View states after `event` was applied. */
  readonly views: Readonly<TViews>;

  /**
   * Outbox messages that the current producer code derives from `event`.
   * Recomputed during replay — not read from the stored outbox.
   */
  readonly messages: ReadonlyArray<EvDbMessage>;

  /** `true` when no event exists after `event` (as of the last fetch). */
  readonly isHead: boolean;

  /**
   * Moves forward up to `steps` events (default 1). Stops early at the stream head.
   * At the head it re-checks storage, so events stored later are picked up.
   *
   * Mutates this instance and returns it (for chaining). It does not create a copy.
   * @throws RangeError when `steps` is not a positive integer.
   */
  forward(steps?: number): Promise<IEvDbReadOnlyStream<TViews>>;
}
```

- [ ] **Step 2: Write the failing tests**

Create `packages/core/src/store/EvDbReadOnlyStream.test.ts`:

```ts
import { test, describe } from "node:test";
import * as assert from "node:assert";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import { EvDbReadOnlyStream } from "./EvDbReadOnlyStream.js";
import type { IEvDbReplayTarget } from "./EvDbReadOnlyStream.js";
import InMemoryStorageAdapter from "./InMemoryStorageAdapter.test-support.js";

type Views = {
  Sum: { sum: number };
};

const address = new EvDbStreamAddress("S", "s-1");

const ev = (offset: number, points: number): EvDbEvent =>
  new EvDbEvent(
    "Added",
    new EvDbStreamCursor(address, offset),
    { points },
    new Date(),
    "test",
    new Date(),
  );

/** Folds `points` into a sum and emits one message per event. */
class SumTarget implements IEvDbReplayTarget<Views> {
  private sum = 0;
  public applied: number[] = [];
  get views(): Readonly<Views> {
    return { Sum: { sum: this.sum } };
  }
  replayEvent(e: EvDbEvent): ReadonlyArray<EvDbMessage> {
    const points = e.payload["points"];
    this.sum += typeof points === "number" ? points : 0;
    this.applied.push(e.streamCursor.offset);
    return [EvDbMessage.createFromMetadata(e, "Added", { at: e.streamCursor.offset })];
  }
}

const seeded = (count: number): InMemoryStorageAdapter => {
  const adapter = new InMemoryStorageAdapter();
  adapter.seedEvents(Array.from({ length: count }, (_, i) => ev(i, i + 1)));
  return adapter;
};

const open = (adapter: InMemoryStorageAdapter, target: SumTarget, offset: number, pageSize = 2) =>
  EvDbReadOnlyStream.open<Views>({
    target,
    streamStorageAdapter: adapter,
    streamAddress: address,
    fromOffset: 0,
    offset,
    pageSize,
  });

describe("EvDbReadOnlyStream", () => {
  test("positions on the target offset with views folded up to it", async () => {
    const target = new SumTarget();
    const s = await open(seeded(6), target, 3);
    assert.strictEqual(s.event.streamCursor.offset, 3);
    assert.deepStrictEqual(s.views, { Sum: { sum: 1 + 2 + 3 + 4 } });
    assert.deepStrictEqual(target.applied, [0, 1, 2, 3]);
    assert.strictEqual(s.messages.length, 1);
    assert.strictEqual(s.isHead, false);
  });

  test("forward walks every offset once across page boundaries", async () => {
    const target = new SumTarget();
    const s = await open(seeded(7), target, 0, 2);
    const seen = [s.event.streamCursor.offset];
    while (!s.isHead) {
      await s.forward();
      seen.push(s.event.streamCursor.offset);
    }
    assert.deepStrictEqual(seen, [0, 1, 2, 3, 4, 5, 6]);
    assert.deepStrictEqual(target.applied, [0, 1, 2, 3, 4, 5, 6]);
  });

  test("forward returns the same instance", async () => {
    const s = await open(seeded(3), new SumTarget(), 0);
    const returned = await s.forward();
    assert.strictEqual(returned, s);
  });

  test("forward(n) moves n events and keeps messages of the last one only", async () => {
    const s = await open(seeded(6), new SumTarget(), 0);
    await s.forward(3);
    assert.strictEqual(s.event.streamCursor.offset, 3);
    assert.strictEqual(s.messages.length, 1);
    assert.strictEqual(s.messages[0].streamCursor.offset, 3);
  });

  test("forward(n) past the head stops at the last event", async () => {
    const s = await open(seeded(4), new SumTarget(), 1);
    await s.forward(10);
    assert.strictEqual(s.event.streamCursor.offset, 3);
    assert.strictEqual(s.isHead, true);
  });

  test("isHead is true on the last event and forward there is a no-op", async () => {
    const target = new SumTarget();
    const s = await open(seeded(3), target, 2);
    assert.strictEqual(s.isHead, true);
    await s.forward();
    assert.strictEqual(s.event.streamCursor.offset, 2);
    assert.deepStrictEqual(target.applied, [0, 1, 2]);
  });

  test("isHead is false when the target is the last event of a page", async () => {
    const s = await open(seeded(5), new SumTarget(), 1, 2);
    assert.strictEqual(s.isHead, false);
  });

  test("forward at the head picks up events stored later", async () => {
    const adapter = seeded(2);
    const s = await open(adapter, new SumTarget(), 1);
    assert.strictEqual(s.isHead, true);
    adapter.seedEvents([ev(2, 3)]);
    await s.forward();
    assert.strictEqual(s.event.streamCursor.offset, 2);
  });

  test("throws RangeError when the target offset is past the head", async () => {
    await assert.rejects(open(seeded(3), new SumTarget(), 9), RangeError);
  });

  test("throws RangeError on an empty stream", async () => {
    await assert.rejects(open(new InMemoryStorageAdapter(), new SumTarget(), 0), RangeError);
  });

  test("throws RangeError when the target offset falls in a gap", async () => {
    const adapter = new InMemoryStorageAdapter();
    adapter.seedEvents([ev(1, 1), ev(2, 2)]); // no offset 0
    await assert.rejects(open(adapter, new SumTarget(), 0), RangeError);
  });

  test("forward rejects steps that are not positive integers", async () => {
    const s = await open(seeded(3), new SumTarget(), 0);
    await assert.rejects(s.forward(0), RangeError);
    await assert.rejects(s.forward(-1), RangeError);
    await assert.rejects(s.forward(1.5), RangeError);
  });

  test("has no write members at runtime", async () => {
    const s = await open(seeded(2), new SumTarget(), 0);
    const members = s as unknown as Record<string, unknown>;
    assert.strictEqual(members["store"], undefined);
    assert.strictEqual(members["appendToOutbox"], undefined);
    assert.strictEqual(members["appendEvent"], undefined);
  });
});
```

Notes for the implementer:
- The payload is the raw event object (`{ points }`); `IEvDbPayloadData` values are `unknown`, so the test narrows with `typeof` instead of casting.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --import tsx --test packages/core/src/store/EvDbReadOnlyStream.test.ts`
Expected: FAIL — cannot find module `./EvDbReadOnlyStream.js`.

- [ ] **Step 4: Implement `EvDbReadOnlyStream`**

Create `packages/core/src/store/EvDbReadOnlyStream.ts`:

```ts
import type EvDbEvent from "@eventualize/types/events/EvDbEvent";
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type IEvDbStorageStreamAdapter from "@eventualize/types/adapters/IEvDbStorageStreamAdapter";
import type EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import type IEvDbReadOnlyStream from "@eventualize/types/store/IEvDbReadOnlyStream";

/**
 * The stream that replay folds events into. Implemented by the factory's
 * internal replay stream; not part of the public API.
 */
export interface IEvDbReplayTarget<TViews> {
  readonly views: Readonly<TViews>;
  /** Applies a stored event to the views and returns its produced messages. */
  replayEvent(e: EvDbEvent): ReadonlyArray<EvDbMessage>;
}

export interface EvDbReadOnlyStreamOpenOptions<TViews> {
  readonly target: IEvDbReplayTarget<TViews>;
  readonly streamStorageAdapter: IEvDbStorageStreamAdapter;
  readonly streamAddress: EvDbStreamAddress;
  /** First offset to fetch (views already hold everything before it). */
  readonly fromOffset: number;
  /** The offset to position on. */
  readonly offset: number;
  readonly pageSize: number;
}

/**
 * Fetches up to `pageSize` events starting at `fromOffset`, then closes the
 * adapter iterator so no adapter span or query stays open between calls.
 */
async function fetchPage(
  adapter: IEvDbStorageStreamAdapter,
  address: EvDbStreamAddress,
  fromOffset: number,
  pageSize: number,
): Promise<EvDbEvent[]> {
  const page: EvDbEvent[] = [];
  for await (const e of adapter.getEventsAsync(new EvDbStreamCursor(address, fromOffset), pageSize)) {
    page.push(e);
    if (page.length >= pageSize) break;
  }
  return page;
}

const notFound = (address: EvDbStreamAddress, offset: number): RangeError =>
  new RangeError(`Offset ${offset} not found in stream ${address.streamType}/${address.streamId}`);

/**
 * Read-only, forward-only cursor over a stored stream.
 *
 * Keeps one page of fetched events plus the current event. Applied events are
 * dropped. The buffer always holds at least one event ahead of `event` unless
 * the stream head was reached, which is what `isHead` reports.
 */
export class EvDbReadOnlyStream<TViews> implements IEvDbReadOnlyStream<TViews> {
  private constructor(
    private readonly target: IEvDbReplayTarget<TViews>,
    private readonly adapter: IEvDbStorageStreamAdapter,
    private readonly address: EvDbStreamAddress,
    private readonly pageSize: number,
    private _event: EvDbEvent,
    private _messages: ReadonlyArray<EvDbMessage>,
    private buffer: EvDbEvent[],
    private nextOffset: number,
  ) {}

  /**
   * Folds events `fromOffset..offset` into `target` and returns a stream
   * positioned on `offset`.
   * @throws RangeError when the stream has no event at `offset`.
   */
  static async open<TViews>(
    options: EvDbReadOnlyStreamOpenOptions<TViews>,
  ): Promise<EvDbReadOnlyStream<TViews>> {
    const { target, streamStorageAdapter, streamAddress, offset, pageSize } = options;
    let nextOffset = options.fromOffset;

    while (true) {
      const page = await fetchPage(streamStorageAdapter, streamAddress, nextOffset, pageSize);
      if (page.length === 0) throw notFound(streamAddress, offset);
      nextOffset = page[page.length - 1].streamCursor.offset + 1;

      for (let i = 0; i < page.length; i++) {
        const e = page[i];
        const eventOffset = e.streamCursor.offset;
        if (eventOffset > offset) throw notFound(streamAddress, offset);
        const messages = target.replayEvent(e);
        if (eventOffset === offset) {
          const stream = new EvDbReadOnlyStream<TViews>(
            target,
            streamStorageAdapter,
            streamAddress,
            pageSize,
            e,
            messages,
            page.slice(i + 1),
            nextOffset,
          );
          await stream.ensureLookahead();
          return stream;
        }
      }
    }
  }

  get event(): EvDbEvent {
    return this._event;
  }

  get views(): Readonly<TViews> {
    return this.target.views;
  }

  get messages(): ReadonlyArray<EvDbMessage> {
    return this._messages;
  }

  get isHead(): boolean {
    return this.buffer.length === 0;
  }

  async forward(steps: number = 1): Promise<IEvDbReadOnlyStream<TViews>> {
    if (!Number.isInteger(steps) || steps < 1) {
      throw new RangeError(`steps must be a positive integer, got ${steps}`);
    }
    for (let moved = 0; moved < steps; moved++) {
      await this.ensureLookahead();
      const next = this.buffer.shift();
      if (next === undefined) break;
      this._messages = this.target.replayEvent(next);
      this._event = next;
    }
    await this.ensureLookahead();
    return this;
  }

  /** Fetches the next page when the buffer is empty. */
  private async ensureLookahead(): Promise<void> {
    if (this.buffer.length > 0) return;
    const page = await fetchPage(this.adapter, this.address, this.nextOffset, this.pageSize);
    if (page.length === 0) return;
    this.nextOffset = page[page.length - 1].streamCursor.offset + 1;
    this.buffer = page;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --import tsx --test packages/core/src/store/EvDbReadOnlyStream.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 6: Build and lint** (expect `0` / `0`; run prettier on new files).

- [ ] **Step 7: Do not commit.**

---

### Task 4: `factory.goToOffset` (view snapshots ≤ offset, replay stream class)

**Files:**
- Create: `packages/core/src/store/EvDbEmptySnapshotAdapter.ts`
- Modify: `packages/core/src/factories/EvDbViewFactory.ts`
- Modify: `packages/core/src/factories/EvDbStreamFactory.ts`
- Modify: `packages/core/src/factories/IEvDbStreamFactory.ts`
- Test: `packages/core/src/factories/EvDbStreamFactory.goToOffset.test.ts`

**Interfaces:**
- Consumes: `EvDbStream.applyEvent` (Task 2); `EvDbReadOnlyStream.open`, `IEvDbReplayTarget` (Task 3); `IEvDbReadOnlyStream` (Task 3); `getSnapshotAsync(viewAddress, maxOffset?)` (Task 1); `InMemoryStorageAdapter` incl. `{ ignoreMaxOffset: true }` and `seedSnapshot` (Task 2).
- Produces:
  - `ViewFactory.get(streamId: string, storageAdapter: IEvDbStorageSnapshotAdapter, maxOffset?: number): Promise<EvDbView<TState>>`
  - `EvDbStreamFactory.goToOffset(streamId: string, offset: number, streamStorageAdapter: IEvDbStorageStreamAdapter, snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter, pageSize?: number): Promise<IEvDbReadOnlyStream<TViews>>` (also on `IEvDbStreamFactory`).
  - `EvDbEmptySnapshotAdapter` (default export): `getSnapshotAsync` → `Empty`; `storeSnapshotAsync` → rejects; `close` → resolves.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/factories/EvDbStreamFactory.goToOffset.test.ts`:

```ts
import { test, describe } from "node:test";
import * as assert from "node:assert";
import EvDbEvent from "@eventualize/types/events/EvDbEvent";
import EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import EvDbStreamAddress from "@eventualize/types/stream/EvDbStreamAddress";
import EvDbStreamCursor from "@eventualize/types/stream/EvDbStreamCursor";
import EvDbViewAddress from "@eventualize/types/view/EvDbViewAddress";
import { EvDbStreamFactory } from "./EvDbStreamFactory.js";
import { createViewFactory } from "./EvDbViewFactory.js";
import type { ViewFactory } from "./EvDbViewFactory.js";
import InMemoryStorageAdapter from "../store/InMemoryStorageAdapter.test-support.js";

type Events = { Added: { points: number } };
// `type`, not `interface`: TViews must satisfy Record<string, unknown>.
type Views = {
  Sum: { sum: number; lastCapturedAt: number };
  Count: { count: number };
};

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
      },
    }) as unknown as ViewFactory<unknown, Events>,
    createViewFactory<Views["Count"], Events>({
      viewName: "Count",
      streamType: "S",
      defaultState: { count: 0 },
      handlers: { Added: (s) => ({ count: s.count + 1 }) },
    }) as unknown as ViewFactory<unknown, Events>,
  ],
  eventTypes: [
    {
      eventName: "Added",
      eventMessagesProducer: (event, views) => [
        EvDbMessage.createFromMetadata(event, "Added", { views }),
      ],
    },
  ],
});

const address = new EvDbStreamAddress("S", "s-1");
const capturedAt = (offset: number): Date => new Date(Date.UTC(2020, 0, 1, 0, 0, offset));
const ev = (offset: number): EvDbEvent =>
  new EvDbEvent(
    "Added",
    new EvDbStreamCursor(address, offset),
    { points: offset + 1 },
    capturedAt(offset),
    "test",
    new Date(),
  );
const sumTo = (offset: number): number => ((offset + 1) * (offset + 2)) / 2;
const seeded = (count: number, opts: { ignoreMaxOffset?: boolean } = {}) => {
  const adapter = new InMemoryStorageAdapter(opts);
  adapter.seedEvents(Array.from({ length: count }, (_, i) => ev(i)));
  return adapter;
};
const sumAddr = new EvDbViewAddress(address, "Sum");
const countAddr = new EvDbViewAddress(address, "Count");

describe("EvDbStreamFactory.goToOffset", () => {
  test("views equal a full fold of 0..offset", async () => {
    const adapter = seeded(10);
    const s = await factory.goToOffset("s-1", 4, adapter, adapter);
    assert.strictEqual(s.event.streamCursor.offset, 4);
    assert.strictEqual(s.views.Sum.sum, sumTo(4));
    assert.strictEqual(s.views.Count.count, 5);
  });

  test("view handlers see the stored capturedAt", async () => {
    const adapter = seeded(5);
    const s = await factory.goToOffset("s-1", 3, adapter, adapter);
    assert.strictEqual(s.views.Sum.lastCapturedAt, capturedAt(3).getTime());
  });

  test("uses the latest snapshot at or before the offset", async () => {
    const adapter = seeded(10);
    adapter.seedSnapshot(sumAddr, 2, { sum: sumTo(2), lastCapturedAt: 0 });
    adapter.seedSnapshot(countAddr, 2, { count: 3 });
    adapter.seedSnapshot(sumAddr, 8, { sum: 999, lastCapturedAt: 0 });
    adapter.seedSnapshot(countAddr, 8, { count: 999 });
    const s = await factory.goToOffset("s-1", 5, adapter, adapter);
    assert.strictEqual(s.views.Sum.sum, sumTo(5));
    assert.strictEqual(s.views.Count.count, 6);
  });

  test("ignores a snapshot newer than the target (adapter ignores maxOffset)", async () => {
    const adapter = seeded(10, { ignoreMaxOffset: true });
    adapter.seedSnapshot(sumAddr, 8, { sum: 999, lastCapturedAt: 0 });
    adapter.seedSnapshot(countAddr, 8, { count: 999 });
    const s = await factory.goToOffset("s-1", 5, adapter, adapter);
    assert.strictEqual(s.views.Sum.sum, sumTo(5));
    assert.strictEqual(s.views.Count.count, 6);
  });

  test("one view without a snapshot folds from 0", async () => {
    const adapter = seeded(10);
    adapter.seedSnapshot(sumAddr, 3, { sum: sumTo(3), lastCapturedAt: 0 });
    const s = await factory.goToOffset("s-1", 6, adapter, adapter);
    assert.strictEqual(s.views.Sum.sum, sumTo(6));
    assert.strictEqual(s.views.Count.count, 7);
  });

  test("all views have a snapshot at the target offset", async () => {
    const adapter = seeded(10);
    adapter.seedSnapshot(sumAddr, 4, { sum: sumTo(4), lastCapturedAt: 0 });
    adapter.seedSnapshot(countAddr, 4, { count: 5 });
    const s = await factory.goToOffset("s-1", 4, adapter, adapter);
    assert.strictEqual(s.event.streamCursor.offset, 4);
    assert.strictEqual(s.views.Sum.sum, sumTo(4));
    assert.strictEqual(s.views.Count.count, 5);
    assert.strictEqual(s.messages.length, 1);
  });

  test("without a snapshot adapter, views fold from default state", async () => {
    const adapter = seeded(6);
    const s = await factory.goToOffset("s-1", 2, adapter);
    assert.strictEqual(s.views.Sum.sum, sumTo(2));
    assert.strictEqual(s.views.Count.count, 3);
  });

  test("messages are produced for the current event with post-apply view states", async () => {
    const adapter = seeded(6);
    const s = await factory.goToOffset("s-1", 2, adapter, adapter);
    assert.strictEqual(s.messages.length, 1);
    assert.strictEqual(s.messages[0].streamCursor.offset, 2);
  });

  test("forward to the head with a small page size", async () => {
    const adapter = seeded(7);
    const s = await factory.goToOffset("s-1", 0, adapter, adapter, 2);
    const seen = [s.event.streamCursor.offset];
    while (!s.isHead) {
      await s.forward();
      seen.push(s.event.streamCursor.offset);
    }
    assert.deepStrictEqual(seen, [0, 1, 2, 3, 4, 5, 6]);
    assert.strictEqual(s.views.Sum.sum, sumTo(6));
  });

  test("does not store anything", async () => {
    const adapter = seeded(4);
    const s = await factory.goToOffset("s-1", 1, adapter, adapter);
    await s.forward(2);
    assert.strictEqual(adapter.storedMessages.length, 0);
    assert.strictEqual((await adapter.getSnapshotAsync(sumAddr)).offset, -1);
  });

  test("throws when the offset is not in the stream", async () => {
    const adapter = new InMemoryStorageAdapter();
    adapter.seedEvents([ev(1), ev(2)]); // like factory.create(): starts at 1
    await assert.rejects(factory.goToOffset("s-1", 0, adapter, adapter), RangeError);
    await assert.rejects(factory.goToOffset("s-1", 5, adapter, adapter), RangeError);
  });

  test("rejects invalid offset and pageSize", async () => {
    const adapter = seeded(3);
    await assert.rejects(factory.goToOffset("s-1", -1, adapter, adapter), RangeError);
    await assert.rejects(factory.goToOffset("s-1", 1.5, adapter, adapter), RangeError);
    await assert.rejects(factory.goToOffset("s-1", 0, adapter, adapter, 0), RangeError);
  });

  test("read-only at the type level", async () => {
    const adapter = seeded(2);
    const s = await factory.goToOffset("s-1", 0, adapter, adapter);
    // @ts-expect-error read-only stream has no store()
    assert.strictEqual(s.store, undefined);
    // @ts-expect-error read-only stream has no appendEventAdded()
    assert.strictEqual(s.appendEventAdded, undefined);
  });
});
```

Notes for the implementer:
- The `as unknown as ViewFactory<unknown, Events>` casts copy exactly what `StreamFactoryBuilder.withView` does (`packages/core/src/factories/StreamFactoryBuilder.ts:82`). Try without them first; keep them only if TypeScript requires them.
- The view handler receives `e` as the event payload type (`{ points }`).
- The `@ts-expect-error` lines only verify anything under `tsc`. Also run `pnpm exec tsc -p packages/core/tsconfig.test.json --noEmit` in Step 5; if that project has unrelated pre-existing errors, note them in your report and check that none are in the new test files.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test packages/core/src/factories/EvDbStreamFactory.goToOffset.test.ts`
Expected: FAIL — `factory.goToOffset is not a function`.

- [ ] **Step 3: Create the empty snapshot adapter**

Create `packages/core/src/store/EvDbEmptySnapshotAdapter.ts`:

```ts
import type IEvDbStorageSnapshotAdapter from "@eventualize/types/adapters/IEvDbStorageSnapshotAdapter";
import { EvDbStoredSnapshotResultRaw } from "@eventualize/types/snapshots/EvDbStoredSnapshotResultRaw";

/**
 * Snapshot adapter with no snapshots. Used by replay when the caller passes no
 * snapshot adapter, so views still exist and fold from their default state.
 * Replay never stores, so storing through this adapter is an error.
 */
export default class EvDbEmptySnapshotAdapter implements IEvDbStorageSnapshotAdapter {
  async getSnapshotAsync(): Promise<EvDbStoredSnapshotResultRaw> {
    return EvDbStoredSnapshotResultRaw.Empty;
  }

  async storeSnapshotAsync(): Promise<void> {
    throw new Error("EvDbEmptySnapshotAdapter cannot store snapshots (read-only replay)");
  }

  async close(): Promise<void> {}
}
```

- [ ] **Step 4: `ViewFactory.get` with `maxOffset`**

In `packages/core/src/factories/EvDbViewFactory.ts`, add the import:

```ts
import { EvDbStoredSnapshotResultRaw } from "@eventualize/types/snapshots/EvDbStoredSnapshotResultRaw";
```

Replace `get` with:

```ts
  /**
   * Get a view instance from event store.
   * @param maxOffset - Optional: load the latest snapshot at or before this offset.
   *   A snapshot newer than `maxOffset` (from an adapter that ignores the bound)
   *   is discarded, so the view starts from its default state.
   */
  public async get(
    streamId: string,
    storageAdapter: IEvDbStorageSnapshotAdapter,
    maxOffset?: number,
  ): Promise<EvDbView<TState>> {
    const streamAddress = new EvDbStreamAddress(this.config.streamType, streamId);
    const viewAddress = new EvDbViewAddress(streamAddress, this.config.viewName);

    const loaded = await storageAdapter.getSnapshotAsync(viewAddress, maxOffset);
    const snapshot =
      maxOffset !== undefined && loaded.offset > maxOffset
        ? EvDbStoredSnapshotResultRaw.Empty
        : loaded;

    return new GenericView<TState, TEventMap>(
      viewAddress,
      storageAdapter,
      snapshot as unknown as EvDbStoredSnapshotResult<TState>,
      this.config,
    );
  }
```

(The `as unknown as EvDbStoredSnapshotResult<TState>` cast already exists in this method; keep it, do not add new ones.)

- [ ] **Step 5: Replay stream class and `goToOffset` in the factory**

In `packages/core/src/factories/EvDbStreamFactory.ts`:

Add imports:

```ts
import type EvDbMessage from "@eventualize/types/messages/EvDbMessage";
import type IEvDbReadOnlyStream from "@eventualize/types/store/IEvDbReadOnlyStream";
import { EvDbReadOnlyStream } from "../store/EvDbReadOnlyStream.js";
import type { IEvDbReplayTarget } from "../store/EvDbReadOnlyStream.js";
import EvDbEmptySnapshotAdapter from "../store/EvDbEmptySnapshotAdapter.js";
```

Add a module-level constant after the imports:

```ts
const EMPTY_SNAPSHOT_ADAPTER = new EvDbEmptySnapshotAdapter();
```

Add a constructor-type alias next to `DynamicStreamClass` and a second field:

```ts
type StreamCtorArgs = [
  streamType: string,
  views: EvDbView<unknown>[],
  streamStorageAdapter: IEvDbStorageStreamAdapter,
  streamId: string,
  lastStreamOffset: number,
];
```

```ts
  private DynamicStreamClass: new (...args: StreamCtorArgs) => StreamWithEventMethods<TEventMap, TViews>;
  private ReplayStreamClass: new (...args: StreamCtorArgs) => IEvDbReplayTarget<TViews>;

  constructor(private readonly config: EvDbStreamFactoryConfig<TEventMap, TStreamType>) {
    const classes = this.createDynamicStreamClasses();
    this.DynamicStreamClass = classes.stream;
    this.ReplayStreamClass = classes.replay;
  }
```

Rename `createDynamicStreamClass` to `createDynamicStreamClasses` and replace its final `return` with:

```ts
    /** Internal stream used by goToOffset: exposes applyEvent for stored events. */
    class ReplayStream extends DynamicStream {
      replayEvent(e: EvDbEvent): ReadonlyArray<EvDbMessage> {
        return this.applyEvent(e);
      }
    }

    return {
      stream: DynamicStream as unknown as typeof this.DynamicStreamClass,
      replay: ReplayStream as unknown as typeof this.ReplayStreamClass,
    };
```

(The `as unknown as` here follows the existing pattern on the original return line: the dynamic `views` proxy and `appendEvent*` methods are added at runtime, so TypeScript cannot see them.)

Add `goToOffset` after `get`:

```ts
  /**
   * Opens a read-only stream positioned on the event at `offset`.
   *
   * Views start from their latest snapshot at or before `offset` (or from the
   * default state) and fold the stored events up to `offset`. Nothing is
   * stored. Navigate with `forward()`; to go back, call `goToOffset` again.
   *
   * @throws RangeError when `offset` or `pageSize` is invalid, or when the
   *   stream has no event at `offset`.
   */
  public async goToOffset(
    streamId: string,
    offset: number,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
    pageSize: number = 100,
  ): Promise<IEvDbReadOnlyStream<TViews>> {
    return withSpan(getCoreTracer(), "eventualize.stream.goToOffset", async (span) => {
      span.setAttribute("eventualize.stream.id", streamId);
      span.setAttribute("eventualize.stream.type", this.config.streamType);
      span.setAttribute("eventualize.stream.offset", offset);

      if (!Number.isInteger(offset) || offset < 0) {
        throw new RangeError(`offset must be a non-negative integer, got ${offset}`);
      }
      if (!Number.isInteger(pageSize) || pageSize < 1) {
        throw new RangeError(`pageSize must be a positive integer, got ${pageSize}`);
      }

      const snapshotAdapter = snapshotStorageAdapter ?? EMPTY_SNAPSHOT_ADAPTER;
      const views = await Promise.all(
        this.config.viewFactories.map((vf) => vf.get(streamId, snapshotAdapter, offset)),
      );

      // Views with no snapshot have storeOffset -1, so this yields 0 for them.
      // min(..., offset) makes sure the event at `offset` itself is fetched.
      const lowestViewOffset = Math.min(...views.map((v) => v.storeOffset));
      const fromOffset = Math.min(lowestViewOffset + 1, offset);

      const target = new this.ReplayStreamClass(
        this.config.streamType,
        views,
        streamStorageAdapter,
        streamId,
        offset,
      );

      return EvDbReadOnlyStream.open<TViews>({
        target,
        streamStorageAdapter,
        streamAddress: new EvDbStreamAddress(this.config.streamType, streamId),
        fromOffset,
        offset,
        pageSize,
      });
    });
  }
```

(`Math.min()` with no views returns `Infinity`, so `fromOffset` becomes `offset`. That is correct: with no views only the target event is needed.)

`EvDbView.storeOffset` comes from `EvDbViewRaw`; it is `-1` for an empty snapshot.

- [ ] **Step 6: Add `goToOffset` to `IEvDbStreamFactory`**

In `packages/core/src/factories/IEvDbStreamFactory.ts` add the import and the method:

```ts
import type IEvDbReadOnlyStream from "@eventualize/types/store/IEvDbReadOnlyStream";
```

```ts
  goToOffset(
    streamId: string,
    offset: number,
    streamStorageAdapter: IEvDbStorageStreamAdapter,
    snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
    pageSize?: number,
  ): Promise<IEvDbReadOnlyStream<TViews>>;
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --import tsx --test packages/core/src/**/*.test.ts`
Expected: PASS (all core tests, including the 13 new `goToOffset` tests).

Run: `pnpm exec tsc -p packages/core/tsconfig.test.json --noEmit 2>&1 | grep -E "goToOffset|ReadOnlyStream|applyEvent|test-support" ; echo "exit: done"`
Expected: no lines mentioning the new files (the `@ts-expect-error` lines must be "used").

- [ ] **Step 8: Build and lint** (expect `0` / `0`; prettier on touched files).

- [ ] **Step 9: Do not commit.**

---

### Task 5: Integration tests for `goToOffset` on real databases + docs

**Files:**
- Modify: `apps/sample-app/src/tests/integration.test.ts`
- Modify: `packages/README.md`

**Interfaces:**
- Consumes: `PointsStreamFactory.goToOffset(...)` (Task 4); the `"pointsPaging"` stream created in Task 1's `"Paging: stream with two stored batches"` sub-test (offsets 1..22; snapshots at 11 and 22; Sum after offset 11 = 210, after 22 = 630).

Expected Sum per offset (from `Steps.addPointsEventsToStream`, two batches):
offset 11 → 210, 12 → 260, 13 → 240, 14 → 290, 15 → 270, 16 → 540, 22 → 630. Count at offset N = N.

- [ ] **Step 1: Write the integration tests**

In `apps/sample-app/src/tests/integration.test.ts`, add these sub-tests directly **after** Task 1's `"Snapshots: getSnapshotAsync honours maxOffset"` sub-test:

```ts
        await t.test("Replay: goToOffset between two snapshots", async () => {
          const s = await PointsStreamFactory.goToOffset(
            "pointsPaging",
            15,
            testData.storageAdapter!,
            testData.storageAdapter!,
          );
          assert.strictEqual(s.event.streamCursor.offset, 15);
          assert.strictEqual(s.views.Sum.sum, 270);
          assert.strictEqual(s.views.Count.count, 15);
          assert.strictEqual(s.isHead, false);
        });

        await t.test("Replay: messages are recomputed for the current event", async () => {
          // offset 14 is PointsAdded → two notifications
          const s = await PointsStreamFactory.goToOffset(
            "pointsPaging",
            14,
            testData.storageAdapter!,
            testData.storageAdapter!,
          );
          assert.strictEqual(s.event.eventType, "PointsAdded");
          assert.strictEqual(s.messages.length, 2);
        });

        await t.test("Replay: forward to the head with pageSize 3", async () => {
          const s = await PointsStreamFactory.goToOffset(
            "pointsPaging",
            1,
            testData.storageAdapter!,
            testData.storageAdapter!,
            3,
          );
          const seen = [s.event.streamCursor.offset];
          while (!s.isHead) {
            await s.forward();
            seen.push(s.event.streamCursor.offset);
          }
          assert.deepStrictEqual(
            seen,
            Array.from({ length: 22 }, (_, i) => i + 1),
          );
          assert.strictEqual(s.views.Sum.sum, 630);
          assert.strictEqual(s.views.Count.count, 22);
        });

        await t.test("Replay: offset 0 does not exist for create()-based streams", async () => {
          await assert.rejects(
            PointsStreamFactory.goToOffset(
              "pointsPaging",
              0,
              testData.storageAdapter!,
              testData.storageAdapter!,
            ),
            RangeError,
          );
        });
```

- [ ] **Step 2: Run the integration tests**

Run: `TEST_CONTAINER=true pnpm exec dotenv -e .env.test -- node --import tsx --test apps/sample-app/src/tests/integration.test.ts`
Expected: all sub-tests pass for Postgres, MySQL and DynamoDB.
If it fails or hangs, rule out the environment first (see Global Constraints) before changing code.

- [ ] **Step 3: Document the API**

In `packages/README.md`, add this section before `## Prerequisites`:

````markdown
## Replay: inspect a stream at a past offset

`goToOffset` opens a **read-only** stream positioned on a stored event. Views
start from the latest snapshot at or before that offset and fold forward. The
stream cannot append or store.

```ts
const stream = await PointsStreamFactory.goToOffset(
  "points-1", // stream id
  15,         // offset to position on
  storageAdapter,
  snapshotAdapter, // optional; without it views fold from their default state
  100,             // optional page size
);

stream.event;    // the stored event at offset 15
stream.views;    // view states after that event
stream.messages; // outbox messages recomputed for that event (not the stored outbox)

while (!stream.isHead) {
  await stream.forward(); // mutates `stream` and returns it
}
```

Navigation is forward-only (see `docs/adr/0001-replay-forward-only-navigation.md`).
To go back, call `goToOffset` again with a smaller offset.
````

- [ ] **Step 4: Full verification**

Run each and confirm:
- `pnpm build 2>&1 | grep "error TS" | wc -l` → `0`
- `pnpm exec eslint . 2>&1 | grep -c " error "` → `0`
- `pnpm lint` → exits 0 (includes prettier check)
- `pnpm test` → all suites pass (requires Docker; check for CPU-hogging foreign `node --test` processes first)

- [ ] **Step 5: Do not commit.**
