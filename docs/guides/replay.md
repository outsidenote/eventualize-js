# Stream Replay Guide

eventualize-js can look at a stream's past, and copy a stream into a new one.

| Feature | What it does | Writes to storage? |
|---------|--------------|--------------------|
| `factory.goToOffset(...)` | Opens a **read-only** stream on a past event. You can step forward and look at the views at each step. | No |
| `factory.clone(...)` | Copies a stream, up to an offset, into a **new empty** stream. Events and messages can be changed or dropped on the way. | Yes (only the new stream) |

Both are methods on every stream factory (the object returned by
`StreamFactoryBuilder.build()`). The examples use the sample `PointsStreamFactory`
(events `PointsAdded`, `PointsSubtracted`, `PointsMultiplied`; views `Sum`, `Count`).

---

## 1. Inspect a stream at a past offset — `goToOffset`

```ts
goToOffset(
  streamId: string,
  offset: number,
  streamStorageAdapter: IEvDbStorageStreamAdapter,
  snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
  pageSize?: number, // default 100
): Promise<IEvDbReadOnlyStream<TViews>>;
```

### Quick start

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

### The read-only stream

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

### How the start point is chosen

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

### Moving forward

- `forward()` changes the **same** object and returns it. It does not make a copy.
  If you need the state of a step later, copy `stream.views` yourself.
- `forward(5)` with only 2 events left moves 2 and stops. Check `isHead`.
- At the head, `forward()` reads storage again. Events stored after you opened
  the stream are picked up.
- `messages` always belong to the current `event` only.
- Do not call `forward()` again before the previous call finished. Await each call.

### Going back

Navigation is forward-only on purpose (see
[ADR 0001](adr/0001-replay-forward-only-navigation.md)). Going back means
reading a snapshot and folding again, so it is not cheap. To go back, call
`goToOffset` again with a smaller offset. The cost is then clear at the call site.

### Paging and memory

Events are read in pages of `pageSize`. The stream keeps one page plus the current
event in memory. Events it has passed are dropped. No database query or iterator
stays open between `forward()` calls.

### Errors

| Situation | Error |
|-----------|-------|
| `offset` is negative or not an integer | `RangeError` |
| `pageSize` is not a positive integer | `RangeError` |
| No event at `offset` (empty stream, offset after the head, or a gap) | `RangeError: Offset N not found in stream <type>/<id>` |
| `forward(steps)` with `steps` not a positive integer | `RangeError` |

> **Note:** streams created with `factory.create()` start at offset **1**, not 0.
> `goToOffset(id, 0, ...)` on such a stream throws `RangeError`.

---

## 2. Copy a stream — `clone`

```ts
clone(
  streamId: string,
  targetStreamId: string,
  streamStorageAdapter: IEvDbStorageStreamAdapter,
  snapshotStorageAdapter?: IEvDbStorageSnapshotAdapter,
  options?: EvDbCloneOptions<TEventMap>,
): Promise<StreamWithEventMethods<TEventMap, TViews>>;
```

It returns the target as a normal, **writable** stream at its head. You can
append to it right away.

### Quick start

```ts
// A sandbox copy of everything up to offset 15. No outbox messages are written.
const sandbox = await PointsStreamFactory.clone("points-1", "points-1-sandbox", storageAdapter, snapshotAdapter, {
  offsetLimit: 15,
});

await sandbox.appendEventPointsAdded({ points: 10 }); // try something on the copy
await sandbox.store();
```

### Options

| Option | Default | Meaning |
|--------|---------|---------|
| `offsetLimit` | the source head (read once at the start) | Last source offset to copy, **inclusive**. A value above the head is capped. |
| `pageSize` | `100` | Source events read per page. |
| `projectEvent` | copy as is | `(e) => result \| undefined`. Change an event, or return `undefined` to drop it. |
| `projectMessage` | drop all messages, **producer not called** | `(m) => message \| undefined`. Keep, change or drop each produced outbox message. |

### `projectEvent`

The input is a typed union, so `switch (e.eventType)` narrows `e.payload`:

```ts
projectEvent: (e) => {
  switch (e.eventType) {
    case "PointsMultiplied":
      return undefined;                       // drop
    case "PointsAdded":
      return { eventType: "PointsAdded", payload: { points: e.payload.points * 10 } }; // change payload
    default:
      return e;                               // keep as is
  }
},
```

- `e.metadata` has the source event's metadata (`streamCursor`, `capturedAt`,
  `capturedBy`, ...).
- The result may change `eventType` to **another type of the same factory**.
- The result may override `capturedAt` and `capturedBy`. If not, the source
  values are kept.
- The result is type-checked: a payload that does not match its `eventType`
  does not compile.

### Metadata of copied events

| Field | Value |
|-------|-------|
| `capturedAt` | override, else the source value |
| `capturedBy` | override, else the source value |
| `traceparent` / `tracestate` | the clone operation's span |
| offset | new, in the target |

### Outbox messages

By default a clone writes **no** outbox messages, and the messages producer is
not called at all. The source already sent its notifications when the events
first happened. A copy must not send them again by accident.

To write messages, pass `projectMessage`:

```ts
projectMessage: (m) => m,                                       // keep all
projectMessage: (m) => m.withChannel(`sandbox.${m.channel}`),   // reroute to other channels
projectMessage: (m) => (m.messageType === "Audit" ? m : undefined), // keep some
```

- The producer runs for the **copied** event and sees the **target** view states.
- `EvDbMessage.withChannel(channel)` returns a copy on another channel. All other
  fields are kept.
- Kept messages get the trace context of their copied event.

> **Important:** when `projectMessage` is set, view handlers run **twice** per
> copied event (once to compute the producer's view states, once to apply the
> event). View handlers must be pure: return a new state and do not change the
> old one.

### Target offsets

The target must be **empty**. Its offsets start at 0 and have no gaps. They can
differ from the source offsets, for example when the source starts at offset 1,
or when `projectEvent` drops events.

### How writes are stored

Clone stores the target as it goes:

- at the end of each page, and
- earlier, before an event that would bring the pending events + messages above
  **100**. DynamoDB accepts at most 100 items per transaction, so every store
  stays at or under that limit.

Events stored before a failure stay in the target.

### Errors and progress

| Situation | Error |
|-----------|-------|
| `streamId === targetStreamId` | `RangeError` |
| `offsetLimit` negative or not an integer, `pageSize` not a positive integer | `RangeError` |
| Target stream already has events | `EvDbCloneError` (nothing is written) |
| Any failure while copying (projection, producer, `projectMessage`, store) | `EvDbCloneError` |

`EvDbCloneError` tells you how far the clone got:

| Field | Meaning |
|-------|---------|
| `sourceStreamId`, `targetStreamId` | The two streams. |
| `lastSourceOffset` | Last source offset fully handled: its events were stored, or dropped by `projectEvent`. `-1` when none. |
| `targetStoredOffset` | The target's stored offset when the error happened: `-1` when nothing was stored; for a non-empty target, its existing last offset. |
| `cause` | The original error (`undefined` for a non-empty target). |

```ts
import EvDbCloneError from "@eventualize/core/store/EvDbCloneError";

try {
  await PointsStreamFactory.clone("points-1", "points-1-copy", storageAdapter, snapshotAdapter);
} catch (err) {
  if (err instanceof EvDbCloneError) {
    console.error(err.lastSourceOffset, err.targetStoredOffset, err.cause);
  }
}
```

There is no resume. After a failure, clean up the partial target, or clone again
into a new target id.

### Other behaviour

- Source snapshots are **not** used. The target views fold from the copied events.
- An empty source, or a clone where every event is dropped, returns an empty
  target. This is not an error.
- Events added to the source while the clone runs are not copied (the head is
  read once at the start).
- Without a `snapshotStorageAdapter`, the target has no views (the same as
  `factory.create()` / `factory.get()`).

---

## 3. Recipes

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

### Sandbox: copy real history, then experiment

```ts
const sandbox = await PointsStreamFactory.clone("points-1", `points-1-sandbox-${Date.now()}`, storageAdapter, snapshotAdapter);
await sandbox.appendEventPointsSubtracted({ points: 500 });
await sandbox.store();
```

### Fix or redact data

Illustrative — `UserStreamFactory` with a `UserRegistered { email }` event:

```ts
await UserStreamFactory.clone("user-42", "user-42-redacted", storageAdapter, snapshotAdapter, {
  projectEvent: (e) =>
    e.eventType === "UserRegistered"
      ? { eventType: "UserRegistered", payload: { ...e.payload, email: "redacted" }, capturedBy: "redacted" }
      : { ...e, capturedBy: "redacted" },
});
```

`capturedBy` is free text and may hold a user id, so redact it too.

### Migrate old event shapes

Register the new type on the same factory (here `PointsAddedV2 { amount }`), then:

```ts
await PointsStreamFactory.clone("points-1", "points-1-v2", storageAdapter, snapshotAdapter, {
  projectEvent: (e) =>
    e.eventType === "PointsAdded"
      ? { eventType: "PointsAddedV2", payload: { amount: e.payload.points } }
      : e,
});
```

### Copy with messages on separate channels

```ts
await PointsStreamFactory.clone("points-1", "points-1-copy", storageAdapter, snapshotAdapter, {
  projectMessage: (m) => m.withChannel(`sandbox.${m.channel}`),
});
```

---

## 4. Limits

- `goToOffset` moves forward only.
- `clone` works within one factory and one storage. It cannot copy across
  stream types, factories or databases.
- `clone` cannot resume, and cannot append into a non-empty target.
- `clone` maps one source event to zero or one target event (no splitting).
- On DynamoDB, a single event whose messages alone reach 100 items cannot be
  stored. The clone fails with `EvDbCloneError`.
- `goToTime` (position by time) is not available yet.

---

## 5. Observability

Both methods run inside an OpenTelemetry span (see [OTEL_INTEGRATION.md](OTEL_INTEGRATION.md)):

| Span | Attributes |
|------|------------|
| `eventualize.stream.goToOffset` | `eventualize.stream.id`, `eventualize.stream.type`, `eventualize.stream.offset` |
| `eventualize.stream.clone` | `eventualize.stream.type`, `eventualize.stream.id` (source), `eventualize.clone.target_id`, `eventualize.clone.offset_limit` (when set) |

Each page read also creates the adapter's `eventualize.adapter.query.stream` span.

---

## 6. For storage adapter authors

The replay work added two **optional** parameters to the adapter interfaces.
Existing adapters still compile.

| Method | New parameter | Contract |
|--------|---------------|----------|
| `getEventsAsync(streamCursor, pageSize?)` | `pageSize` (default 100) | Yield events with `offset >= streamCursor.offset`, in ascending offset order, **each exactly once**, reading `pageSize` rows per query. |
| `getSnapshotAsync(viewAddress, maxOffset?)` | `maxOffset` | Return the latest snapshot with `offset <= maxOffset`; the empty snapshot (offset `-1`) when there is none. Without `maxOffset`: the latest snapshot, as before. |

An adapter that ignores `maxOffset` still gives correct results: core discards a
snapshot newer than the target and folds from the default state.

**Behaviour change in the relational adapter (Postgres/MySQL):** `getEventsAsync`
now yields the stored payload as is. Before, it wrapped it as
`{ eventType, payload }`. It now matches DynamoDB and what `store()` writes.
Code that read `event.payload.payload` from the relational adapter must read
`event.payload` instead.
