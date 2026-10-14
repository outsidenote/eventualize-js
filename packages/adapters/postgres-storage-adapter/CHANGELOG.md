# @eventualize/postgres-storage-adapter

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

### Patch Changes

- Updated dependencies [9634936]
- Updated dependencies [6a48ac3]
  - @eventualize/relational-storage-adapter@6.1.1

## 6.0.0

### Major Changes

- 48ab5e4: refine api / remove payload type

### Patch Changes

- Updated dependencies [48ab5e4]
  - @eventualize/relational-storage-adapter@6.0.0

## 5.0.0

### Major Changes

- e062a12: api changes, add withMessages and metadata

### Patch Changes

- Updated dependencies [e062a12]
  - @eventualize/relational-storage-adapter@5.0.0

## 4.4.0

### Minor Changes

- a02ab9b: fix import of PrismaClient

### Patch Changes

- Updated dependencies [a02ab9b]
  - @eventualize/relational-storage-adapter@4.4.0

## 4.3.0

### Minor Changes

- 302c66c: fix: update PrismaClient imports

### Patch Changes

- Updated dependencies [302c66c]
  - @eventualize/relational-storage-adapter@4.3.0

## 4.2.0

### Minor Changes

- da41352: lint builder factory

### Patch Changes

- Updated dependencies [da41352]
  - @eventualize/relational-storage-adapter@4.2.0

## 4.1.0

### Minor Changes

- 96fac8a: structure typesafe view that expose the state direcly

### Patch Changes

- Updated dependencies [96fac8a]
  - @eventualize/relational-storage-adapter@4.1.0

## 4.0.0

### Major Changes

- ec6dc7e: refine view api to reflect a typed state

### Patch Changes

- Updated dependencies [ec6dc7e]
  - @eventualize/relational-storage-adapter@4.0.0

## 3.0.0

### Major Changes

- 28bdfa3: Removal of the EventStore concept

### Patch Changes

- Updated dependencies [28bdfa3]
  - @eventualize/relational-storage-adapter@3.0.0

## 2.1.0

### Minor Changes

- 2730e38: Types and interface refactoring

### Patch Changes

- Updated dependencies [2730e38]
  - @eventualize/relational-storage-adapter@2.1.0

## 2.0.0

### Major Changes

- 29788eb: Initial release of @eventualize packages

### Patch Changes

- Updated dependencies [29788eb]
  - @eventualize/relational-storage-adapter@2.0.0
