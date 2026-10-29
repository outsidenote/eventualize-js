# Replay: inspect a stream at a past offset

`factory.goToOffset(...)` opens a **read-only** stream positioned on a stored
event. You can step forward and look at the views and the outbox messages at
each step. It never writes to storage.

Use it to debug: what did the views look like at offset 15, and what changed at
offset 16?

It is a method on every stream factory (the object returned by
`StreamFactoryBuilder.build()`). The examples use the sample `PointsStreamFactory`
(events `PointsAdded`, `PointsSubtracted`, `PointsMultiplied`; views `Sum`, `Count`).

To copy a stream into a new one, see [Clone](clone.md). The two features are
independent.

## Signature

```ts
goToOffset(
  streamId: string,
  offset: number,
  streamStorageAdapter: IEvDbStorageStreamAdapter,
  snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
  pageSize?: number, // default 100
): Promise<IEvDbReadOnlyStream<TViews>>;
```

## Quick start

```ts
const stream = await PointsStreamFactory.goToOffset("points-1", 15, storageAdapter, snapshotAdapter);

stream.event;    // the stored event at offset 15
stream.views;    // view states after that event: { Sum: {...}, Count: {...} }
stream.messages; // outbox messages recomputed for that event
stream.isHead;   // true when no event exists after it

while (!stream.isHead) {
  await stream.forward();
  console.log(stream.event.streamCursor.offset, stream.views.Sum.sum);
}
```

## The read-only stream

`goToOffset` returns an `IEvDbReadOnlyStream`:

| Member | Meaning |
|--------|---------|
| `event` | The stored event the stream is on. `event.streamCursor` has the stream type, id and offset. Never `undefined`. |
| `views` | The view states after `event` was applied. |
| `messages` | The outbox messages that the **current** producer code makes for `event`. They are recomputed, not read from the stored outbox. |
| `isHead` | `true` when no event exists after `event` (as of the last read). |
| `forward(steps = 1)` | Moves forward up to `steps` events. |

A read-only stream has no `appendEvent*`, `appendToOutbox` or `store`. They are
missing from the type and from the object, so you cannot write by mistake.

## How the start point is chosen

1. For each view, the latest snapshot **at or before** `offset` is loaded.
   A view without such a snapshot starts from its default state.
2. Events are read from the lowest snapshot offset (or from 0) up to `offset`,
   and applied to the views. A view skips events it already holds.
3. The stream stops on the event at `offset`.

Without a `snapshotStorageAdapter`, every view starts from its default state and
folds from the first event. This is slower, but the views are still there.

View handlers get the **stored** metadata of each event (`capturedAt`,
`capturedBy`, cursor, trace context). So time-based views give the same result
as they did originally.

## Moving forward

- `forward()` changes the **same** object and returns it. It does not make a copy.
  If you need the state of a step later, copy `stream.views` yourself.
- `forward(5)` with only 2 events left moves 2 and stops. Check `isHead`.
- At the head, `forward()` reads storage again. Events stored after you opened
  the stream are picked up.
- `messages` always belong to the current `event` only.
- Do not call `forward()` again before the previous call finished. Await each call.

## Going back

Navigation is forward-only on purpose (see
[ADR 0001](../adr/0001-replay-forward-only-navigation.md)). Going back means
reading a snapshot and folding again, so it is not cheap. To go back, call
`goToOffset` again with a smaller offset. The cost is then clear at the call site.

## Paging and memory

Events are read in pages of `pageSize`. The stream keeps one page plus the current
event in memory. Events it has passed are dropped. No database query or iterator
stays open between `forward()` calls.

## Errors

| Situation | Error |
|-----------|-------|
| `offset` is negative or not an integer | `RangeError` |
| `pageSize` is not a positive integer | `RangeError` |
| No event at `offset` (empty stream, offset after the head, or a gap) | `RangeError: Offset N not found in stream <type>/<id>` |
| `forward(steps)` with `steps` not a positive integer | `RangeError` |

> **Note:** streams created with `factory.create()` start at offset **1**, not 0.
> `goToOffset(id, 0, ...)` on such a stream throws `RangeError`.

## Recipes

### Debug: walk a stream and watch a view

```ts
const s = await PointsStreamFactory.goToOffset("points-1", 1, storageAdapter, snapshotAdapter);
for (;;) {
  console.log(s.event.streamCursor.offset, s.event.eventType, s.views.Sum.sum);
  if (s.isHead) break;
  await s.forward();
}
```

### Debug: what did the views look like before a bad event?

```ts
const before = await PointsStreamFactory.goToOffset("points-1", badOffset - 1, storageAdapter, snapshotAdapter);
console.log(before.views);
```

## Limits

- Navigation is forward-only.
- `goToTime` (position by time) is not available yet.

## Observability

`goToOffset` runs inside the OpenTelemetry span `eventualize.stream.goToOffset`,
with the attributes `eventualize.stream.id`, `eventualize.stream.type` and
`eventualize.stream.offset`. Each page read also creates the adapter's
`eventualize.adapter.query.stream` span, when the factory turns it on (it is off
by default). `forward()` follows the same factory setting. See the
[OpenTelemetry guide](opentelemetry.md#choose-which-spans-to-produce).

## For storage adapter authors

Replay uses two **optional** adapter parameters. Adapters that ignore them still
compile and still give correct results.

| Method | Parameter | Contract |
|--------|-----------|----------|
| `getEventsAsync(streamCursor, pageSize?)` | `pageSize` (default 100) | Yield events with `offset >= streamCursor.offset`, in ascending offset order, **each exactly once**, reading `pageSize` rows per query. |
| `getSnapshotAsync(viewAddress, maxOffset?)` | `maxOffset` | Return the latest snapshot with `offset <= maxOffset`; the empty snapshot (offset `-1`) when there is none. |

An adapter that ignores `maxOffset` is slower, not wrong: core discards a
snapshot newer than the target and folds from the default state. The full
adapter contract is in [Storage adapters](storage-adapters.md#writing-a-new-adapter).
