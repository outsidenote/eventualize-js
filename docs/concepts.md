# Concepts

This page explains the parts of eventualize-js and how they work together. For
a hands-on start, read [Getting started](getting-started.md) first.

## Event sourcing in one paragraph

You do not store the current state of a thing. You store the facts that happened
to it, in order: _points added_, _points subtracted_. The current state is
computed from those facts. You can always compute it again, at any point in the
past, and in new shapes you did not plan for.

## Stream

A **stream** is the ordered list of events of one thing, for example one user's
points. A stream has an address:

- **stream type**: the kind of thing, for example `"PointsStream"`.
- **stream id**: which one, for example `"user-1"`.

Each event in a stream has an **offset**: 0, 1, 2, ... with no gaps. Code type:
`EvDbStreamAddress` (type + id), `EvDbStreamCursor` (type + id + offset).

The stream is also the consistency boundary. One `store()` call writes all
pending events of one stream in one transaction.

## Event

An **event** is a fact in the past tense with a plain, read-only payload:

```ts
type PointsAdded = { readonly points: number };
```

When stored, each event (`EvDbEvent`) also carries metadata:

| Field | Meaning |
|-------|---------|
| `eventType` | The name you registered, e.g. `"PointsAdded"` |
| `streamCursor` | Stream type, id, and offset |
| `capturedAt` | When the event was appended |
| `capturedBy` | Free text: who appended it (default `"N/A"`) |
| `storedAt` | When the database stored it |
| `traceparent`, `tracestate` | W3C trace context at append time |

Events are never changed or deleted in place. To fix bad data, see
[Clone](guides/clone.md).

## Stream factory

A **stream factory** knows one stream type: its event types, its views and its
message producers. You build it once with `StreamFactoryBuilder`:

```ts
const PointsStreamFactory = new StreamFactoryBuilder("PointsStream")
  .withEvent("PointsAdded").asType<PointsAdded>()
  .withView("Sum", { sum: 0 }, { PointsAdded: (s, e) => ({ sum: s.sum + e.points }) })
  .build();
```

The factory makes streams:

| Method | Does |
|--------|------|
| `get(id, streamAdapter, snapshotAdapter?)` | Loads a stream: snapshots first, then newer events. |
| `create(id, streamAdapter, snapshotAdapter?)` | Makes a stream object without reading storage. |
| `goToOffset(id, offset, ...)` | Opens a read-only stream at a past event. See [Replay](guides/replay.md). |
| `clone(sourceId, targetId, ...)` | Copies a stream into a new one. See [Clone](guides/clone.md). |

The stream it returns has a typed `appendEvent<Name>(payload)` method per event
type, a typed `views` object, and `store()`.

## View

A **view** is state computed from the events of one stream. It is a _fold_:
start with a default state, then apply a handler for each event.

```
state(n) = handler(state(n - 1), event(n))
```

- A handler gets `(oldState, payload, metadata)` and returns the new state.
- Handlers must be pure. Return a new object, and do not change `oldState`.
  Replay and `clone` can run a handler more than once for one event.
- A view has no handler for an event type it does not care about.

Read views with `stream.views.<Name>`.

## Snapshot

A **snapshot** is a stored copy of a view's state at one offset. Without
snapshots, loading a stream reads every event from offset 0. With them, `get()`
loads the latest snapshot of each view and reads only newer events.

Today a snapshot of each view is written on every `store()`.

## Outbox message

An **outbox message** (`EvDbMessage`) is a notification for other systems,
produced from an event:

```ts
.withMessages("PointsAdded", (payload, views, metadata) => [
  EvDbMessage.createFromMetadata(metadata, "PointsAddedNotification", { total: views.Sum.sum }),
])
```

Messages are stored in the same transaction as their event (the _transactional
outbox_ pattern). A separate process, for example Debezium CDC, reads the outbox
and publishes to a queue. So a message is never lost, and never sent for an
event that was not stored. Each message has a `channel` and a `shardName`
for routing. Use one queue per channel, and fork on the message type in the
consumer: see [Outbox delivery](guides/outbox.md#recommended-one-queue-per-channel).

To deliver messages with pg-boss or Debezium + Kafka, see
[Outbox delivery](guides/outbox.md). [`apps/e2e/funds`](../apps/e2e/funds) runs
both.

## Storage adapter

A **storage adapter** reads and writes events, messages and snapshots for one
database. The library splits the job in two interfaces from `@eventualize/types`:

- `IEvDbStorageStreamAdapter`: read events, read the last offset, store events +
  messages.
- `IEvDbStorageSnapshotAdapter`: read and store snapshots.

The provided adapters (`EvDbPrismaStorageAdapter`, `EvDbDynamoDbStorageAdapter`)
implement both. See [Storage adapters](guides/storage-adapters.md).

## Optimistic concurrency

Each stream knows the offset it last stored. When `store()` writes, the database
rejects an offset that already exists. If two writers load the same stream and
both append, the second `store()` throws
`Error("OPTIMISTIC_CONCURRENCY_VIOLATION")`. Load the stream again, check your
business rule again, and retry.

## Tracing

Every append, store, load, replay and clone runs in an OpenTelemetry span. Events and
messages store the W3C `traceparent` of the code that appended them, so a
consumer can continue the same trace. Without an OTel SDK, all of this is a
no-op. See [OpenTelemetry](guides/opentelemetry.md).

## Packages

```
@eventualize/types   interfaces and data classes, no logic
        ▲
@eventualize/core    StreamFactoryBuilder, streams, views, replay, clone, OTel helpers
        ▲
adapters             relational (Prisma) ◄── postgres, mysql
                     dynamodb
```

Imports are deep paths, one module per file, for example
`@eventualize/core/factories/StreamFactoryBuilder`. There is no root index.
