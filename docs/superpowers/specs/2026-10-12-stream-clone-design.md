# Stream Replay — Part 2: `clone()`

**Status:** Approved v1 (owner-approved 2026-10-12; amended during implementation: item-count flush for the DynamoDB 100-item transaction limit)
**Date:** 2026-10-12
**Branch:** `replay-2026-10-11`
**Builds on:** [Part 1 — `goToOffset`](2026-10-12-stream-replay-goto-offset-design.md)

---

## 1. Goal

Copy a stream, up to an offset, into a new stream of the same type. While
copying, a caller can change or drop events, and can choose which outbox
messages the copy produces.

### Use cases (all in scope)

| Use case | Typical options |
|----------|-----------------|
| **Fix / redact data** (bad deploy, GDPR) | `projectEvent` rewrites payloads; override `capturedBy` |
| **Debug / what-if sandbox** | defaults; append test events to the returned stream |
| **Schema migration** (old event shape → new event type in the same factory) | `projectEvent` changes `eventType` and payload |

### Success criteria

- With default options, the target holds the same events (type, payload,
  `capturedAt`, `capturedBy`) as the source up to the limit, and the same view
  states.
- With default options, the clone writes **no** outbox messages.
- A clone never writes into a stream that already has events.
- A failure part-way through reports exactly how far the clone got.
- Works on Postgres, MySQL and DynamoDB.

### Out of scope

- Cloning across stream types or factories.
- Separate storage for source and target (same adapters for both).
- Resuming a failed clone; appending into a non-empty target.
- Splitting one source event into several target events.
- A stored link from a cloned event back to its source offset.

---

## 2. Public API

Added to `IEvDbStreamFactory` and `EvDbStreamFactory`:

```ts
clone(
  streamId: string,
  targetStreamId: string,
  streamStorageAdapter: IEvDbStorageStreamAdapter,
  snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
  options?: EvDbCloneOptions<TEventMap>,
): Promise<StreamWithEventMethods<TEventMap, TViews>>;
```

It returns the target as a normal writable stream, positioned at its head.

```ts
interface EvDbCloneOptions<TEventMap extends Record<string, object>> {
  /** Last source offset to copy (inclusive). Default: the source head, read once at start. */
  offsetLimit?: number;
  /**
   * Source events read per page. Default 100. Writes are stored per page, and earlier when
   * pending events + messages reach 100 (DynamoDB transaction limit).
   */
  pageSize?: number;
  /** Maps a source event to a target event, or `undefined` to drop it. Default: copy as is. */
  projectEvent?: (
    e: EvDbCloneSourceEvent<TEventMap>,
  ) => EvDbCloneEventResult<TEventMap> | undefined;
  /** Maps a produced message, or `undefined` to drop it. Default: drop all
   *  (and the producer is not called). */
  projectMessage?: (m: EvDbMessage) => EvDbMessage | undefined;
}

/** Projection input. `switch (e.eventType)` narrows `payload`. */
type EvDbCloneSourceEvent<TEventMap extends Record<string, object>> = {
  [K in keyof TEventMap & string]: {
    readonly eventType: K;
    readonly payload: Readonly<TEventMap[K]>;
    readonly metadata: IEvDbEventMetadata;
  };
}[keyof TEventMap & string];

/** Projection output. Metadata fields are optional overrides. */
type EvDbCloneEventResult<TEventMap extends Record<string, object>> = {
  [K in keyof TEventMap & string]: {
    eventType: K;
    payload: TEventMap[K];
    /** Default: the source event's `capturedAt`. */
    capturedAt?: Date;
    /** Default: the source event's `capturedBy`. */
    capturedBy?: string;
  };
}[keyof TEventMap & string];
```

New on `EvDbMessage` (`packages/types`):

```ts
/** Returns a copy of this message on another channel. */
withChannel(channel: string): EvDbMessage;
```

### Usage

```ts
// Sandbox copy up to offset 15, as is, no messages:
const sandbox = await PointsStreamFactory.clone("p-1", "p-1-sandbox", adapter, adapter, {
  offsetLimit: 15,
});

// Migration + redaction + rerouted messages:
await PointsStreamFactory.clone("p-1", "p-1-v2", adapter, adapter, {
  projectEvent: (e) => {
    switch (e.eventType) {
      case "PointsMultiplied":
        return undefined; // drop
      default:
        return { eventType: e.eventType, payload: e.payload, capturedBy: "redacted" };
    }
  },
  projectMessage: (m) => m.withChannel(`sandbox.${m.channel}`),
});
```

---

## 3. Behaviour

### 3.1 Flow

```
clone(src, tgt, adapters, opts)   — inside span "eventualize.stream.clone"
 1. validate: src ≠ tgt; offsetLimit integer ≥ 0; pageSize integer ≥ 1   → RangeError
 2. getLastOffsetAsync(tgt) ≠ -1                                         → EvDbCloneError, nothing written
 3. limit = offsetLimit ?? getLastOffsetAsync(src)   (read once; a limit above the head is capped)
 4. target = internal CloneStream, lastStreamOffset -1  → target offsets start at 0
 5. for each page (≤ pageSize events from nextOffset; stop at the first event with offset > limit):
      for each source event e:
        r = projectEvent(e as EvDbCloneSourceEvent)      → undefined: skip
        staged = target.stageCloned(r, e)
        if pending events + messages + staged items > 100 → target.store()   (DynamoDB transaction limit)
        target.commitCloned(staged)
      at the end of each page, if target has pending events → target.store()
 6. return factory.get(tgt, adapters)   (fresh, writable, at head)
```

### 3.2 `stageCloned` / `commitCloned` (internal)

`stageCloned` builds the event and its messages without changing the target.
The caller can then store the pending batch first when the staged items would
push it over 100 items. `commitCloned` adds them to the target.

`stageCloned`:

1. Build an `EvDbEvent`:
   - `eventType`/`payload` from the projection result.
   - cursor: the next target offset.
   - `capturedAt`: override ?? source `capturedAt`.
   - `capturedBy`: override ?? source `capturedBy`.
   - `traceparent`/`tracestate`: the active (clone) span, the same as `appendEvent`.
2. Only when `projectMessage` is set: run the messages producer on the new
   event (with the target view states after the event, computed with the views'
   pure handlers, without changing the views), pass every message through
   `projectMessage`, keep the non-`undefined` results, and stamp them with the
   event's trace context.

`commitCloned` pushes the event to the pending events, applies it to the target
views, and pushes the messages to the pending messages.

When `projectMessage` is not set, the producer is never called. This avoids the
cost, and it avoids running current producer code on old event shapes.

### 3.3 Split of `EvDbStream` internals

Part 1 has `appendEvent` (build + views + messages) and `applyEvent` (views +
messages, used by replay). Both are re-expressed with two protected building
blocks:

- `protected applyToViews(e: EvDbEvent): void`
- `protected produceMessages(e: EvDbEvent, viewsStates = current): ReadonlyArray<EvDbMessage>` —
  runs the producer (with the given view states, default the current ones) and
  stamps `e`'s trace context.

`applyEvent(e)` = `applyToViews(e)` + `produceMessages(e)`. The behaviour of
`appendEvent` and `applyEvent` does not change.

### 3.4 Shared page reader

`fetchPage(adapter, address, fromOffset, pageSize)` moves from
`EvDbReadOnlyStream.ts` to `packages/core/src/store/fetchPage.ts`. Replay and
clone both use it. It pulls at most `pageSize` events, then closes the adapter
iterator.

### 3.5 Edge cases

| Case | Result |
|------|--------|
| Empty source, or every event dropped | Returns the empty target; nothing stored |
| `offsetLimit` above the source head | Capped at the head |
| Events appended to the source during the clone | Not copied (the head was read at start) |
| A page where every event is dropped | Nothing stored for that page; continue |
| A single event whose messages alone reach 100 items | DynamoDB rejects the store → `EvDbCloneError` |
| No `snapshotStorageAdapter` | Target has no views (same as `create()`/`get()`); producer sees empty view states |
| Another writer stores into the target during the clone | `store()` fails with OCC → `EvDbCloneError` |

### 3.6 Errors

```ts
class EvDbCloneError extends Error {
  readonly sourceStreamId: string;
  readonly targetStreamId: string;
  /**
   * Last source offset fully handled: its events were stored (at the last
   * successful store), or dropped by `projectEvent`. -1 when none.
   * Progress is per store, and a store can happen mid-page (see §3.1).
   */
  readonly lastSourceOffset: number;
  /**
   * `storedOffset` of the target when the error happened: -1 when nothing was
   * stored; for a non-empty target, its existing last offset.
   */
  readonly targetStoredOffset: number;
  /** The original error; `undefined` for a non-empty target. */
  readonly cause: unknown;
}
```

- Thrown for a non-empty target (before any write) and for any failure during
  the copy: projection, producer, message projection, or `store()`.
- `RangeError` (not `EvDbCloneError`) for invalid arguments.
- A partial target stays in storage. The caller cleans up or clones again into a
  new target id.

Type note: `cause` is `unknown` because anything can be thrown. The project
targets ES2020, whose lib has no `ErrorOptions`, so the field is declared on the
class.

### 3.7 Observability

`clone` runs inside `withSpan(getCoreTracer(), "eventualize.stream.clone", …)`
with attributes `eventualize.stream.type`, `eventualize.stream.id` (source),
`eventualize.clone.target_id`, and `eventualize.clone.offset_limit` (when set).
The cloned events and kept messages carry this span's trace context.

---

## 4. Components

| File | Change |
|------|--------|
| `packages/core/src/store/EvDbStream.ts` | split into `applyToViews` / `produceMessages`; `applyEvent` = both |
| `packages/core/src/store/fetchPage.ts` | new: shared page reader (moved) |
| `packages/core/src/store/EvDbReadOnlyStream.ts` | import `fetchPage` from the new module |
| `packages/core/src/store/EvDbCloneError.ts` | new |
| `packages/core/src/factories/EvDbCloneTypes.ts` | new: `EvDbCloneOptions`, `EvDbCloneSourceEvent`, `EvDbCloneEventResult` |
| `packages/core/src/factories/EvDbStreamFactory.ts` | internal `CloneStream` class + `clone()` |
| `packages/core/src/factories/IEvDbStreamFactory.ts` | `clone` signature |
| `packages/types/src/messages/EvDbMessage.ts` | `withChannel(channel)` |
| `packages/README.md` | usage section |
| `.changeset/*.md` | minor bump: `@eventualize/core`, `@eventualize/types` |

`CloneStream` is a third internal class next to `DynamicStream` and
`ReplayStream`. It is not exported.

---

## 5. Testing

### Unit (`packages/core`, in-memory adapter, no Docker)

- As-is clone: same types, payloads, `capturedAt`, `capturedBy`; target offsets
  `0..n`; views equal the source views.
- `offsetLimit` is inclusive; a limit above the head is capped; events appended
  to the source during the clone (seeded from inside `projectEvent`) are not
  copied.
- `projectEvent`: payload change, type change, drop (offsets stay compact),
  `capturedAt` / `capturedBy` override.
- Messages:
  - Default: nothing stored, and the producer is never called (spy).
  - Identity `projectMessage`: messages stored.
  - `withChannel` prefix.
  - Dropping a subset.
- Cloned events carry the clone span's traceparent, not the source's.
- Errors:
  - Non-empty target → `EvDbCloneError`, nothing written.
  - Source = target → `RangeError`.
  - Invalid `offsetLimit` / `pageSize` → `RangeError`.
  - The store fails on page 2 → `EvDbCloneError` with page 1's progress, and
    page 1 stays stored.
  - A throwing projection → `EvDbCloneError` with `cause`.
- Empty source → empty target returned.
- Page boundaries: 5 events, `pageSize` 2.
- Types: `@ts-expect-error` for a payload that does not match its `eventType`.
- `EvDbMessage.withChannel` keeps every other field.
- `appendEvent` / `applyEvent` behaviour unchanged (existing tests stay green).

### Integration (`apps/sample-app`, Postgres / MySQL / DynamoDB)

- Clone `pointsPaging` (offsets 1..22) with `offsetLimit` 15 and drop
  `PointsMultiplied`. Check the target views, and check the target events via
  `getEventsAsync`: count, compact offsets from 0, and preserved `capturedAt`.
- Cloning into a non-empty target throws `EvDbCloneError`.

---

## 6. Future work

- Separate source and target storage (cross-database sandbox copies).
- Resumable clone (needs stored progress).
- 1 → n event projection (splitting events during migration).
- Cross-factory / cross-stream-type clone.
