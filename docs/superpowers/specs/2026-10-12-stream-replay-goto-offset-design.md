# Stream Replay — Part 1: `goToOffset` and Read-Only Streams

**Status:** Draft v1 (written autonomously from the brainstorming session; awaiting owner review)
**Date:** 2026-10-12
**Branch:** `replay-2026-10-11`

---

## 1. Goal

Let a developer open a stream at a past offset and step forward one event at a
time. At each step they can inspect the event, the state of every view, and the
outbox messages that the event produces.

Today `factory.get()` always lands on the stream head. There is no way to see
what the views looked like at offset N.

### Success criteria

- `factory.goToOffset(streamId, N, ...)` returns a read-only stream whose views
  equal the views of a fresh stream that applied events `0..N`.
- `forward(steps)` advances the same stream, page by page, until the stream head.
- A read-only stream cannot append events, append outbox messages, or store.
  This is enforced by the type system and at runtime.
- Works on all three adapters (Postgres, MySQL, DynamoDB).

### Scope decomposition

| Part | Content | Status |
|------|---------|--------|
| **1 (this spec)** | Adapter paging fixes, snapshot-at-or-before-offset, `goToOffset`, read-only stream, `forward()`, forward-only ADR | This spec |
| 2 | `clone()` (copy a stream up to an offset into a new stream, with projection) | Separate spec |
| Later | `goToTime`, backward navigation, ESLint rule that advises forward over backward | Future |

---

## 2. Public API

### 2.1 Factory

Added to `IEvDbStreamFactory` and `EvDbStreamFactory`:

```ts
goToOffset(
  streamId: string,
  offset: number,
  streamStorageAdapter: IEvDbStorageStreamAdapter,
  snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
  pageSize?: number, // default 100
): Promise<IEvDbReadOnlyStream<TViews>>;
```

`factory.get()` is unchanged. It still returns a writable stream at the head.

### 2.2 Read-only stream

```ts
interface IEvDbReadOnlyStream<TViews> {
  /** The event the stream is positioned on. `event.streamCursor` holds the
   *  stream address and the offset. */
  readonly event: EvDbEvent;

  /** View states after `event` was applied. */
  readonly views: Readonly<TViews>;

  /** Outbox messages that the *current* producer code derives from `event`.
   *  Recomputed — not read from the stored outbox. */
  readonly messages: ReadonlyArray<EvDbMessage>;

  /** `true` when no event exists after `event` (as of the last page fetch). */
  readonly isHead: boolean;

  /** Moves forward up to `steps` events. Mutates this instance and returns it. */
  forward(steps?: number): Promise<IEvDbReadOnlyStream<TViews>>;
}
```

Decisions:

- **No `streamAddress` / `offset` fields.** `event.streamCursor` already extends
  `EvDbStreamAddress` and carries `offset`.
- **`event` is never `undefined`.** `goToOffset` throws when the event at
  `offset` does not exist.
- **`forward()` mutates and returns `this`.** A new instance per step would need
  a copy of every view state per step and its own iterator. A forward-only cursor
  gains nothing from that. The JSDoc states that the instance mutates.
- **`messages` are for the current step only.** After `forward(3)`, `messages`
  belong to the last applied event.
- **`isHead` is a one-event lookahead.** The stream keeps at least one fetched
  event ahead of `event`. When the buffer runs out, the next page is fetched
  (this is the "load next batch in the background" behaviour).
- **`forward()` at the head.** It re-checks storage for new events. If there are
  none, it is a no-op and returns `this`. So a stream that was at the head can
  advance after new events are stored.
- **Partial moves are allowed.** `forward(5)` with 2 events left moves 2 and
  returns. The caller checks `isHead`.

### 2.3 Usage

```ts
const stream = await PointsStreamFactory.goToOffset("p-1", 3, adapter, adapter);
console.log(stream.event.streamCursor.offset, stream.views.Sum, stream.messages);

while (!stream.isHead) {
  await stream.forward();
  console.log(stream.event.eventType, stream.views.Sum);
}
```

---

## 3. Behaviour

### 3.1 Choosing the start point

1. Validate `offset`: must be a non-negative integer, else `RangeError`.
2. For each view, load the latest snapshot with `snapshot.offset <= offset`
   (`getSnapshotAsync(viewAddress, offset)`).
   - Guard: if an adapter ignores `maxOffset` and returns a snapshot with
     `offset > target`, the view starts from its default state instead. This
     keeps third-party adapters correct.
   - No `snapshotStorageAdapter`: every view starts from its default state. The
     views use an internal no-op snapshot adapter. It is safe because a read-only
     stream never stores.
3. `fromOffset = min(lowestViewOffset + 1, offset)`. The empty snapshot sentinel
   is `-1`, so a view with no snapshot gives `fromOffset = 0`. The `min` with
   `offset` makes sure event `offset` itself is always fetched, even when every
   view already has a snapshot at `offset`. Views skip events they already hold
   (`EvDbViewRaw.applyEvent` ignores `offset <= memoryOffset`).
4. Fold events `fromOffset..offset` through the views. Event `offset` becomes
   `event`, and its produced messages become `messages`.
5. If the stream has no event at `offset`, throw `RangeError`
   (`"Offset N not found in stream <type>/<id>"`).

### 3.2 Paging and memory

- Events load in pages of `pageSize` through `getEventsAsync(cursor, pageSize)`.
- The stream pulls at most `pageSize` events from the adapter iterator, then
  calls `iterator.return()`. This closes the adapter's OTel span. No adapter
  iterator stays open between `forward()` calls.
- The next page starts at `lastFetchedOffset + 1`.
- Memory: one page buffer (at most `pageSize` events) plus the current event.
  Applied events are dropped. Replay never writes to `_pendingEvents` or
  `_pendingMessages`.

### 3.3 Applying a loaded event

`EvDbStream.appendEvent` is split:

- New `protected applyEvent(e: EvDbEvent): ReadonlyArray<EvDbMessage>`. It
  applies `e` to every view, runs `messagesProducer` and stamps the messages with
  `e.traceparent` / `e.tracestate`. It returns the produced messages.
- `appendEvent` builds the new event (new cursor, `new Date()`, current trace
  context), pushes it to `_pendingEvents`, calls `applyEvent`, and pushes the
  returned messages to `_pendingMessages`. Its behaviour does not change.
- Replay calls `applyEvent` with the stored event. View handlers therefore see
  the original `capturedAt`, `capturedBy`, cursor and trace context.

### 3.4 Read-only enforcement

- `EvDbReadOnlyStream` is a wrapper, not a subclass of `EvDbStream`. It holds an
  internal replay stream and exposes only the `IEvDbReadOnlyStream` members.
- `appendEvent*`, `appendToOutbox` and `store` are not on the type and do not
  exist on the object at runtime.
- The internal replay stream is a subclass of the factory's `DynamicStream`. It
  adds one public method, `replayEvent(e)`, which calls `applyEvent`. It is not
  exported from the package.

### 3.5 Observability

`goToOffset` runs inside an `eventualize.stream.goToOffset` span with
`eventualize.stream.id`, `eventualize.stream.type` and
`eventualize.stream.offset` attributes. The same `withSpan` helper as
`factory.get()` is used. Page fetches are covered by the adapter's existing
`eventualize.adapter.query.stream` span.

---

## 4. Adapter changes

No new adapter methods. Only optional parameters, so the change does not break
custom adapters.

### 4.1 `IEvDbStorageStreamAdapter.getEventsAsync(streamCursor, pageSize?)`

The implementations already accept a positional `_pageSize`. It is added to the
interface. Existing paging bugs are fixed:

| Adapter | Bug | Fix |
|---------|-----|-----|
| Relational (Postgres/MySQL) | `pageSize` never passed to `getEvents` | pass it as `take` |
| Relational | No `orderBy` on the events query | `orderBy: { offset: "asc" }` |
| Relational | Next page queries `gte lastOffset`, so the last event of a full page repeats | next page starts at `lastOffset + 1` |
| DynamoDB | `LastEvaluatedKey` never passed back, so the loop re-runs page 1 forever when there is more than one page | pass it as `ExclusiveStartKey` |
| DynamoDB | `pageSize` never passed to the query | pass it as `Limit` |

### 4.2 `IEvDbStorageSnapshotAdapter.getSnapshotAsync(viewAddress, maxOffset?)`

Returns the latest snapshot with `offset <= maxOffset`. Without `maxOffset` the
behaviour is unchanged (latest snapshot).

- Relational: `where.offset = { lte: maxOffset }`. Covered by the primary key
  `(stream_type, stream_id, view_name, offset)`.
- DynamoDB: key condition `view_address = :va AND #o <= :max`. `offset` is the
  sort key, so the query stays a key query.

Snapshots are already kept as history (relational `create`; DynamoDB sort key
`offset`), so no schema change is needed.

### Out of scope (noted)

- The DynamoDB adapter does not project `traceparent` / `tracestate` on read.
  This is an existing OTel gap and is not changed here.
- `toOffset` (upper bound in the events query). Core stops by offset, and paging
  limits the over-fetch to one page. Deferred to part 2 (`clone` with
  `offsetLimit`).

---

## 5. ADR — forward-only navigation

See [`docs/adr/0001-replay-forward-only-navigation.md`](../../adr/0001-replay-forward-only-navigation.md).

Summary: v1 exposes `forward()` only. Going backward in an event-sourced stream
means re-folding from a snapshot, so the cost is not visible at the call site.
To go back, call `goToOffset` with a smaller offset; the cost is then explicit.

---

## 6. Testing

### Unit (`packages/core`, in-memory adapter, no Docker)

- Positions on `offset`; views equal a full fold of `0..offset`.
- Chooses the latest snapshot `<= offset`; ignores snapshots `> offset`.
- Guard: a bad adapter that returns a snapshot `> offset` still gives correct views.
- Views with mixed snapshot offsets (one view without a snapshot) fold correctly.
- No snapshot adapter: views fold from default state.
- Stored metadata reaches handlers (`capturedAt` is the stored value, not now).
- `messages` match the producer output for the current event.
- `forward()` across page boundaries with `pageSize = 2`; no duplicates, no gaps.
- `isHead` true at the last event; `forward()` at the head is a no-op.
- `forward()` at the head picks up events stored later.
- `forward(n)` partial move at the end.
- Errors: negative / non-integer offset, offset past the head, empty stream,
  invalid `steps`.
- Read-only: `@ts-expect-error` on `store` / `appendEvent*`; runtime check that
  these members are absent.
- `appendEvent` behaviour unchanged (pending events, pending messages, traceparent).

### Integration (`apps/sample-app`, all DBs via testcontainers)

- Store 11 events in two batches, so two snapshots exist per view.
- `goToOffset` at an offset between the two snapshots gives the same views as a
  full fold.
- `forward()` to the head with `pageSize = 3` visits every offset exactly once
  (this also covers the adapter paging fixes).
- `getSnapshotAsync(viewAddress, maxOffset)` returns the older snapshot.

---

## 7. Future work

- **`goToTime`.** Add the time filter inside the events / snapshot query (for
  example an optional `toTime`) so the time-to-offset lookup does not need an
  extra round trip. Use `storedAt` (database clock, monotonic with offset).
- **Backward navigation** and the ESLint rule that advises forward over
  backward.
- **`clone()`** — part 2 spec.
- **`toOffset`** upper bound in `getEventsAsync`.
