# Clone: copy a stream into a new one

`factory.clone(...)` copies a stream, up to an offset, into a **new, empty**
stream of the same type. Events and outbox messages can be changed or dropped on
the way. Only the new stream is written; the source stays as it is.

Use it to fix or redact data, to make a sandbox copy of real history, or to
migrate old event shapes.

It is a method on every stream factory (the object returned by
`StreamFactoryBuilder.build()`). The examples use the sample `PointsStreamFactory`
(events `PointsAdded`, `PointsSubtracted`, `PointsMultiplied`; views `Sum`, `Count`).

To look at a stream's past without writing anything, see [Replay](replay.md).
The two features are independent.

## Signature

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

## Quick start

```ts
// A sandbox copy of everything up to offset 15. No outbox messages are written.
const sandbox = await PointsStreamFactory.clone("points-1", "points-1-sandbox", storageAdapter, snapshotAdapter, {
  offsetLimit: 15,
});

await sandbox.appendEventPointsAdded({ points: 10 }); // try something on the copy
await sandbox.store();
```

## Options

| Option | Default | Meaning |
|--------|---------|---------|
| `offsetLimit` | the source head (read once at the start) | Last source offset to copy, **inclusive**. A value above the head is capped. |
| `pageSize` | `100` | Source events read per page. |
| `projectEvent` | copy as is | `(e) => result \| undefined`. Change an event, or return `undefined` to drop it. |
| `projectMessage` | drop all messages, **producer not called** | `(m) => message \| undefined`. Keep, change or drop each produced outbox message. |

## `projectEvent`

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

## Metadata of copied events

| Field | Value |
|-------|-------|
| `capturedAt` | override, else the source value |
| `capturedBy` | override, else the source value |
| `traceparent` / `tracestate` | the clone operation's span |
| offset | new, in the target |

## Outbox messages

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

## Target offsets

The target must be **empty**. Its offsets start at 0 and have no gaps. They can
differ from the source offsets, for example when the source starts at offset 1,
or when `projectEvent` drops events.

## How writes are stored

Clone stores the target as it goes:

- at the end of each page, and
- earlier, before an event that would bring the pending events + messages above
  **100**. DynamoDB accepts at most 100 items per transaction, so every store
  stays at or under that limit.

Events stored before a failure stay in the target.

## Errors and progress

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

## Other behaviour

- Source snapshots are **not** used. The target views fold from the copied events.
- An empty source, or a clone where every event is dropped, returns an empty
  target. This is not an error.
- Events added to the source while the clone runs are not copied (the head is
  read once at the start).
- Without a `snapshotStorageAdapter`, the target has no views (the same as
  `factory.create()` / `factory.get()`).

## Recipes

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

## Limits

- `clone` works within one factory and one storage. It cannot copy across
  stream types, factories or databases.
- `clone` cannot resume, and cannot append into a non-empty target.
- `clone` maps one source event to zero or one target event (no splitting).
- On DynamoDB, a single event whose messages alone reach 100 items cannot be
  stored. The clone fails with `EvDbCloneError`.

## Observability

`clone` runs inside the OpenTelemetry span `eventualize.stream.clone`, with the
attributes `eventualize.stream.type`, `eventualize.stream.id` (source),
`eventualize.clone.target_id` and `eventualize.clone.offset_limit` (when set).
Each page read also creates the adapter's `eventualize.adapter.query.stream`
span. See the [OpenTelemetry guide](opentelemetry.md).
