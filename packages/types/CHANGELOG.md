# @eventualize/types

## 6.1.1

### Highlights

- **Better OpenTelemetry support.** Events and outbox messages now store the W3C trace context (`traceparent` and `tracestate`) of the span that produced them, so you can link a stored event or message back to its trace. The context is captured from the active span when you do not pass it in.

  Database change: the relational adapters (MySQL and Postgres) replace the `telemetry_context` column with `traceparent` and `tracestate` (`VARCHAR(255)`) on the `events` and `outbox` tables. Apply the migration `20261011150000_replace_telemetry_context_with_traceparent` before you upgrade. The migration drops `telemetry_context` and its data.

- **Replay.** `factory.goToOffset(...)` opens a read-only stream at a stored event. Use `forward` to walk the stream ahead and read `event`, `views` and `messages` at each step.

- **Clone.** `factory.clone(...)` copies a stream into a new, empty stream of the same type. You can change or drop events and outbox messages during the copy.

### Minor Changes

- 9634936: Dependency update (October 2026).

  - The optional `@opentelemetry/api` peer range is now `>=1.7.0` (was `^1.7.0`), so newer API versions do not cause install conflicts.
  - Internal `@eventualize/*` dependencies now use `^` ranges, so your app and our packages can share one copy of a newer 6.x release.
  - Prisma is pinned to `7.10.0`, and the generated Prisma clients were regenerated with that version. Prisma stays a regular dependency, so your app can use a different Prisma version.

- 6a48ac3: Stream replay, part 2: `factory.clone(...)`.

  - New `factory.clone(streamId, targetStreamId, streamStorageAdapter, snapshotStorageAdapter?, options?)` copies a stream (up to `offsetLimit`) into a new, empty stream of the same type. `projectEvent` can change or drop events and override `capturedAt`/`capturedBy`; `projectMessage` can change or drop produced outbox messages. By default events are copied as is and no messages are produced. Writes are stored per page and batched to stay under 100 items (events + messages) per store, which is the DynamoDB transaction limit.
  - New `EvDbCloneError` reports how far a failed clone got.
  - New `EvDbMessage.withChannel(channel)`.
  - `IEvDbStreamFactory` gains a required `clone` member. This affects custom implementations of the interface.

- 6a48ac3: Stream replay, part 1: positioning on a stored event and walking forward.

  - New `factory.goToOffset(...)` returns a read-only, forward-only `IEvDbReadOnlyStream` with `event`, `views`, `messages`, `isHead` and `forward`.
  - `getEventsAsync(cursor, pageSize?)` and `getSnapshotAsync(viewAddress, maxOffset?)` gained optional parameters. Relational and DynamoDB paging bugs are fixed: duplicate or missing events across pages, and a DynamoDB infinite loop past one page.
  - BEHAVIOR CHANGE: relational `getEventsAsync` now yields the stored payload as-is. Before, it wrapped the payload as `{ eventType, payload }`. It now matches DynamoDB and what `store` writes. This also fixes `factory.get()` folding events after a snapshot.
  - `IEvDbStreamFactory` gains a required `goToOffset` member. This affects custom implementations of the interface.

## 6.0.0

### Major Changes

- 48ab5e4: refine api / remove payload type

## 5.0.0

### Major Changes

- e062a12: api changes, add withMessages and metadata

## 4.4.0

### Minor Changes

- a02ab9b: fix import of PrismaClient

## 4.3.0

### Minor Changes

- 302c66c: fix: update PrismaClient imports

## 4.2.0

### Minor Changes

- da41352: lint builder factory

## 4.1.0

### Minor Changes

- 96fac8a: structure typesafe view that expose the state direcly

## 4.0.0

### Major Changes

- ec6dc7e: refine view api to reflect a typed state

## 3.0.0

### Major Changes

- 28bdfa3: Removal of the EventStore concept

## 2.1.0

### Minor Changes

- 2730e38: Types and interface refactoring

## 2.0.0

### Major Changes

- 29788eb: Initial release of @eventualize packages
